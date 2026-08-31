/**
 * Diagnoses the MySQL connection and explains exactly how to fix it.
 * Usage:  npm run db:check
 */
import mysql from 'mysql2/promise';
import { env } from '../src/config/env.js';

const c = { g: '\x1b[32m', r: '\x1b[31m', y: '\x1b[33m', d: '\x1b[2m', b: '\x1b[1m', x: '\x1b[0m' };

const pw = env.db.password;
console.log(`\n${c.b}Settings actually loaded from .env:${c.x}`);
console.log(`  DB_HOST     ${env.db.host}`);
console.log(`  DB_PORT     ${env.db.port}`);
console.log(`  DB_USER     ${env.db.user}`);
console.log(`  DB_NAME     ${env.db.database}`);
console.log(
  `  DB_PASSWORD ${pw ? `${pw.length} characters, starts "${pw.slice(0, 2)}…" ends "…${pw.slice(-2)}"` : `${c.r}(empty!)${c.x}`}`
);
if (pw && (pw.includes('#') || pw.includes(' '))) {
  console.log(`  ${c.y}↑ contains '#' or a space — it MUST be wrapped in single quotes in .env${c.x}`);
}
console.log('');

async function tryConnect(host, label) {
  try {
    const conn = await mysql.createConnection({
      host,
      port: env.db.port,
      user: env.db.user,
      password: env.db.password,
      connectTimeout: 5000,
    });
    const [[row]] = await conn.query('SELECT VERSION() AS v');
    console.log(`${c.g}✅ Connected to MySQL on ${label} (server ${row.v})${c.x}`);

    const [dbs] = await conn.query('SHOW DATABASES');
    const names = dbs.map((d) => Object.values(d)[0]);
    if (names.includes(env.db.database)) {
      console.log(`${c.g}✅ Database "${env.db.database}" exists${c.x}`);
      await conn.query(`USE \`${env.db.database}\``);
      const [tables] = await conn.query('SHOW TABLES');
      const t = tables.map((x) => Object.values(x)[0]);
      const need = ['abstracts', 'registrations'];
      const missing = need.filter((n) => !t.includes(n));
      if (missing.length === 0) {
        console.log(`${c.g}✅ Tables present: ${t.join(', ')}${c.x}`);
        for (const tbl of need) {
          const [[cnt]] = await conn.query(`SELECT COUNT(*) AS n FROM \`${tbl}\``);
          console.log(`   ${tbl}: ${cnt.n} row(s)`);
        }
      } else {
        console.log(`${c.y}⚠️  Missing table(s): ${missing.join(', ')} — run: npm run init-db${c.x}`);
      }
    } else {
      console.log(`${c.y}⚠️  Database "${env.db.database}" does not exist — run: npm run init-db${c.x}`);
    }

    await conn.end();
    console.log(
      `\n${c.g}${c.b}All good.${c.x} If the API still returns 503, restart it (npm start) so it picks up .env.\n`
    );
    return true;
  } catch (err) {
    console.log(`${c.r}❌ ${label}: ${err.code || ''} ${err.message}${c.x}`);
    return err;
  }
}

const result = await tryConnect(env.db.host, `${env.db.host}:${env.db.port}`);
if (result === true) process.exit(0);

// Primary attempt failed — diagnose.
const err = result;
console.log(`\n${c.b}Likely cause and fix:${c.x}`);

if (err.code === 'ER_ACCESS_DENIED_ERROR') {
  console.log(`${c.y}The password (or user) is wrong.${c.x}`);
  console.log(`  • Most common cause: an unquoted password containing '#'.`);
  console.log(`    dotenv treats everything after '#' as a comment, silently truncating it.`);
  console.log(`    In .env write it like this (single quotes):`);
  console.log(`      DB_PASSWORD='your#password'`);
  console.log(`  • Verify the password works:  mysql -u ${env.db.user} -p`);
} else if (err.code === 'ECONNREFUSED') {
  console.log(`${c.y}Nothing is listening on ${env.db.host}:${env.db.port}.${c.x}`);
  if (env.db.host === 'localhost') {
    console.log(`  • On Windows, "localhost" often resolves to IPv6 (::1) while MySQL`);
    console.log(`    only listens on IPv4. ${c.b}Try changing .env to:${c.x}`);
    console.log(`      DB_HOST=127.0.0.1`);
    console.log(`    Retrying on 127.0.0.1 now…\n`);
  }
  console.log(`  • Or MySQL isn't running. Start it:  net start MySQL80`);
  console.log(`    (check the exact service name in services.msc)`);
} else if (err.code === 'ER_BAD_DB_ERROR') {
  console.log(`${c.y}The server is reachable but database "${env.db.database}" doesn't exist.${c.x}`);
  console.log(`  Run:  npm run init-db`);
} else {
  console.log(`  Unrecognised error — see the message above.`);
}

// The IPv6/IPv4 gotcha is common enough on Windows to auto-test.
if (err.code === 'ECONNREFUSED' && env.db.host === 'localhost') {
  const retry = await tryConnect('127.0.0.1', '127.0.0.1 (IPv4)');
  if (retry === true) {
    console.log(`${c.g}${c.b}>>> That was it. Set DB_HOST=127.0.0.1 in .env and restart the server. <<<${c.x}\n`);
    process.exit(0);
  }
}

console.log('');
process.exit(1);
