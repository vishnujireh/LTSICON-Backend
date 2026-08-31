/**
 * End-to-end check: does a form submission reach the API and land in MySQL?
 *
 * Usage:  npm start        (in one terminal — leave it running)
 *         npm run smoke    (in a second terminal)
 *
 * It POSTs a sample abstract and a sample registration, confirms the
 * registration, then reads both rows back out of the database and prints them.
 * Test rows are cleaned up at the end unless you pass --keep.
 */
import mysql from 'mysql2/promise';
import { env } from '../src/config/env.js';

const BASE = `http://localhost:${env.port}`;
const KEEP = process.argv.includes('--keep');
const stamp = Date.now();
const testEmail = `smoketest+${stamp}@example.com`;
const testRef = `SMOKE-${stamp}`;

const c = { g: '\x1b[32m', r: '\x1b[31m', y: '\x1b[33m', d: '\x1b[2m', x: '\x1b[0m' };
const ok = (m) => console.log(`${c.g}✅ ${m}${c.x}`);
const bad = (m) => console.log(`${c.r}❌ ${m}${c.x}`);
const info = (m) => console.log(`${c.d}   ${m}${c.x}`);

let failures = 0;

async function api(path, { method = 'POST', body } = {}) {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* ignore */ }
  return { status: res.status, json };
}

async function main() {
  console.log(`\n🔍 Testing ${BASE}\n`);

  // ── 1. Is the server up, and is the DB connected? ───────────────────────
  let health;
  try {
    health = await api('/health', { method: 'GET' });
  } catch {
    bad(`Cannot reach the server at ${BASE}`);
    info('Is it running? Start it with:  npm start');
    process.exit(1);
  }

  if (health.json?.db) {
    ok('Server is up and connected to MySQL');
  } else {
    bad('Server is up but NOT connected to MySQL');
    info('Check DB_USER / DB_PASSWORD / DB_NAME in .env, then restart.');
    info('Reminder: if the password contains "#", wrap it in single quotes.');
    process.exit(1);
  }
  info(`Email sending: ${health.json.email} ${health.json.email === 'disabled' ? '(no BREVO_API_KEY — expected for now)' : ''}`);

  // ── 2. Submit an abstract ───────────────────────────────────────────────
  console.log('\n── Abstract submission ──');
  const abs = await api('/abstracts', {
    body: {
      firstName: 'Smoke', lastName: 'Test', email: testEmail,
      mobile: '+91 99999 00000', institution: 'Test Institute',
      coAuthors: 'Dr A, Dr B', membershipId: 'LTSI-TEST',
      presentationType: 'Oral', track: 'Hepatology',
      title: `Smoke test abstract ${stamp}`,
      abstractBody: 'Background. Methods. Results. Conclusion.',
      keywords: 'test, smoke',
      declarations: ['Abstract is original, unpublished and not under review elsewhere.'],
    },
  });
  if (abs.status === 201 && abs.json?.ok) {
    ok(`API accepted the abstract (id ${abs.json.id}, email: ${abs.json.emailStatus})`);
  } else {
    failures++;
    bad(`API rejected the abstract — HTTP ${abs.status}`);
    info(JSON.stringify(abs.json));
  }

  // ── 3. Register (lead capture, then confirm) ────────────────────────────
  console.log('\n── Registration ──');
  const lead = await api('/registrations', {
    body: {
      reference: testRef, name: 'Dr Smoke Test', email: testEmail,
      phone: '+91 99999 00000', designation: 'Consultant',
      institution: 'Test Institute', phase: 'early',
    },
  });
  if (lead.status === 201 && lead.json?.ok) {
    ok(`Step 1 lead captured (ref ${lead.json.reference}, email: ${lead.json.emailStatus})`);
  } else {
    failures++;
    bad(`Lead capture failed — HTTP ${lead.status}`);
    info(JSON.stringify(lead.json));
  }

  const conf = await api(`/registrations/${testRef}`, {
    method: 'PUT',
    body: {
      name: 'Dr Smoke Test', email: testEmail, category: 'LTSI Member',
      workshops: ['Robotic Surgery Workshop'], guests: [{ name: 'Guest One', mobile: '99999' }],
      currency: '₹', totalAmount: 25000, phase: 'early', paid: true,
    },
  });
  if (conf.status === 200 && conf.json?.ok) {
    ok(`Payment confirmed (status: ${conf.json.paymentStatus}, email: ${conf.json.emailStatus})`);
  } else {
    failures++;
    bad(`Confirmation failed — HTTP ${conf.status}`);
    info(JSON.stringify(conf.json));
  }

  // ── 4. Read the rows back out of MySQL ──────────────────────────────────
  console.log('\n── Reading back from MySQL ──');
  const db = await mysql.createConnection({
    host: env.db.host, port: env.db.port, user: env.db.user,
    password: env.db.password, database: env.db.database,
  });

  const [aRows] = await db.execute(
    'SELECT id, first_name, last_name, email, presentation_type, track, title, declarations, email_status, created_at FROM abstracts WHERE email = ?',
    [testEmail]
  );
  if (aRows.length) {
    ok(`Found ${aRows.length} abstract row in the database:`);
    console.table(aRows.map((r) => ({
      id: r.id, name: `${r.first_name} ${r.last_name}`, type: r.presentation_type,
      track: r.track, title: r.title.slice(0, 30), email_status: r.email_status,
    })));
  } else {
    failures++;
    bad('No abstract row found in the database.');
  }

  const [rRows] = await db.execute(
    'SELECT id, reference, name, email, category, workshops, guests, currency, total_amount, payment_status, email_status FROM registrations WHERE reference = ?',
    [testRef]
  );
  if (rRows.length) {
    ok(`Found ${rRows.length} registration row in the database:`);
    console.table(rRows.map((r) => ({
      id: r.id, reference: r.reference, name: r.name, category: r.category,
      total: `${r.currency || ''}${r.total_amount}`, payment: r.payment_status,
    })));
    const r = rRows[0];
    const workshops = typeof r.workshops === 'string' ? JSON.parse(r.workshops) : r.workshops;
    const guests = typeof r.guests === 'string' ? JSON.parse(r.guests) : r.guests;
    info(`workshops JSON: ${JSON.stringify(workshops)}`);
    info(`guests JSON:    ${JSON.stringify(guests)}`);
    if (r.payment_status === 'paid') ok('payment_status correctly updated to "paid" by the confirm step');
    else { failures++; bad(`payment_status is "${r.payment_status}", expected "paid"`); }
  } else {
    failures++;
    bad('No registration row found in the database.');
  }

  // ── 5. Cleanup ──────────────────────────────────────────────────────────
  if (KEEP) {
    console.log(`\n${c.y}⚠️  --keep passed: test rows left in the database.${c.x}`);
  } else {
    await db.execute('DELETE FROM abstracts WHERE email = ?', [testEmail]);
    await db.execute('DELETE FROM registrations WHERE reference = ?', [testRef]);
    info('\nTest rows cleaned up. (Pass --keep to leave them in place.)');
  }
  await db.end();

  console.log(
    failures === 0
      ? `\n${c.g}🎉 All checks passed — form submissions are saving to MySQL.${c.x}\n`
      : `\n${c.r}${failures} check(s) failed — see above.${c.x}\n`
  );
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  bad(`Unexpected error: ${err.message}`);
  process.exit(1);
});
