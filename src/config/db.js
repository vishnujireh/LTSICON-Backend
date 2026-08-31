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
  await addColumn('ALTER TABLE registrations ADD COLUMN transaction_id VARCHAR(120) NULL AFTER phase');
  await addColumn('ALTER TABLE registrations ADD COLUMN payment_screenshot VARCHAR(255) NULL AFTER transaction_id');

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
