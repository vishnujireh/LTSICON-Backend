import mysql from 'mysql2/promise';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from './env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let pool = null;

/**
 * Returns a shared connection pool. Lazily created on first use so the server
 * can still boot (and serve health checks) when MySQL is not yet configured.
 */
export function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: env.db.host,
      port: env.db.port,
      user: env.db.user,
      password: env.db.password,
      database: env.db.database,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      charset: 'utf8mb4',
      dateStrings: true,
    });
  }
  return pool;
}

/** Runs the schema.sql file — creates the database and tables if missing. */
export async function initDb() {
  const schemaPath = path.join(__dirname, '..', 'db', 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');

  // First connect without a database to guarantee it exists, then run schema.
  const bootstrap = await mysql.createConnection({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    multipleStatements: true,
  });
  await bootstrap.query(
    `CREATE DATABASE IF NOT EXISTS \`${env.db.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
  );
  await bootstrap.query(`USE \`${env.db.database}\`;`);
  await bootstrap.query(schema);

  // Migrations for columns added after the first release. MySQL has no
  // "ADD COLUMN IF NOT EXISTS", so add each and ignore a duplicate-field error.
  const addColumn = async (sql) => {
    try {
      await bootstrap.query(sql);
    } catch (err) {
      if (err.code !== 'ER_DUP_FIELDNAME') throw err;
    }
  };
  await addColumn('ALTER TABLE abstracts ADD COLUMN file_path VARCHAR(255) NULL AFTER file_mime');
  await addColumn('ALTER TABLE registrations ADD COLUMN razorpay_order_id VARCHAR(120) NULL AFTER phase');
  await addColumn('ALTER TABLE registrations ADD COLUMN razorpay_payment_id VARCHAR(120) NULL AFTER razorpay_order_id');
  await addColumn('ALTER TABLE registrations ADD COLUMN order_no VARCHAR(40) NULL AFTER phase');
  await addColumn('ALTER TABLE registrations ADD COLUMN subtotal DECIMAL(12,2) NULL AFTER currency');
  await addColumn('ALTER TABLE registrations ADD COLUMN gst_rate DECIMAL(5,2) NULL AFTER subtotal');
  await addColumn('ALTER TABLE registrations ADD COLUMN gst_amount DECIMAL(12,2) NULL AFTER gst_rate');
  // Counters table for gap-free sequential order numbers (safe if it already exists).
  await bootstrap.query(
    `CREATE TABLE IF NOT EXISTS counters (
       name  VARCHAR(50)  NOT NULL,
       value INT UNSIGNED NOT NULL DEFAULT 0,
       PRIMARY KEY (name)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );
  await bootstrap.query("INSERT IGNORE INTO counters (name, value) VALUES ('registration_order', 0)");

  await bootstrap.end();
}

/** Verifies connectivity; used by the health endpoint. */
export async function pingDb() {
  const conn = await getPool().getConnection();
  try {
    await conn.ping();
    return true;
  } finally {
    conn.release();
  }
}
