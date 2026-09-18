/**
 * One-time migration: seed the `users` table from existing `registrations`,
 * so people who registered before real accounts existed can use "Forgot
 * password" to set a password and log in.
 *
 * Usage:  npm run seed-users
 *
 * Safe & idempotent:
 *  - only READS from `registrations` (never modifies it)
 *  - de-duplicates by lowercased email; uses one name per email
 *  - skips emails that already have a `users` account (INSERT IGNORE)
 *  - each seeded row gets an UNUSABLE random password hash, so nobody can log
 *    in until the real owner sets their own password via the reset email.
 */
import crypto from 'node:crypto';
import { getPool } from '../src/config/db.js';
import { isEmail } from '../src/utils/validate.js';
import { hashPassword } from '../src/utils/authTokens.js';

const c = { g: '\x1b[32m', r: '\x1b[31m', y: '\x1b[33m', d: '\x1b[2m', b: '\x1b[1m', x: '\x1b[0m' };

// A valid-format hash of a random secret nobody knows -> can never be logged
// into; the account is usable only after a password reset.
const unusableHash = () => hashPassword(crypto.randomBytes(24).toString('hex'));

async function main() {
  const pool = getPool();

  const [rows] = await pool.query(
    `SELECT LOWER(TRIM(email)) AS email, MIN(name) AS name
       FROM registrations
      WHERE email IS NOT NULL AND TRIM(email) <> ''
      GROUP BY LOWER(TRIM(email))`
  );

  console.log(`\n${c.b}Seeding users from registrations${c.x}`);
  console.log(`  distinct emails in registrations: ${rows.length}\n`);

  let inserted = 0;
  let skipped = 0;
  let invalid = 0;

  for (const row of rows) {
    if (!isEmail(row.email)) {
      invalid++;
      continue;
    }
    const [res] = await pool.execute(
      'INSERT IGNORE INTO users (name, email, password_hash) VALUES (?,?,?)',
      [row.name || 'Delegate', row.email, unusableHash()]
    );
    if (res.affectedRows === 1) inserted++;
    else skipped++;
  }

  console.log(`${c.g}✅ Done.${c.x}`);
  console.log(`  created new accounts : ${inserted}`);
  console.log(`  already existed      : ${skipped}`);
  if (invalid) console.log(`  ${c.y}skipped (bad email)  : ${invalid}${c.x}`);
  console.log(
    `\n${c.d}These users can now use "Forgot password" to set a password and log in.${c.x}\n`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(`${c.r}❌ Seeding failed: ${err.message}${c.x}`);
  console.error(`${c.d}   (Is MySQL reachable? Check DB settings in .env.)${c.x}`);
  process.exit(1);
});
