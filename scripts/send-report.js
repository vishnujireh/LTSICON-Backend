/**
 * Sends the data export (abstracts + registrations as CSV attachments) now.
 * Usage:  npm run report              (uses REPORT_EMAIL from .env)
 *         npm run report you@x.com    (override recipient)
 *
 * Useful to test the report without waiting for the cron schedule.
 */
import { env } from '../src/config/env.js';
import { sendDataReport } from '../src/services/reportService.js';

const c = { g: '\x1b[32m', r: '\x1b[31m', d: '\x1b[2m', b: '\x1b[1m', x: '\x1b[0m' };
const to = process.argv[2] || env.report.email;

console.log(`\n${c.b}LTSICON data export${c.x}`);
console.log(`  To   : ${to}`);
console.log(`  Brevo: ${env.mail.brevoApiKey ? 'configured' : c.r + 'NOT configured' + c.x}\n`);

try {
  const res = await sendDataReport(to);
  console.log(`  Abstracts: ${res.counts?.abstracts ?? '?'}  |  Registrations: ${res.counts?.registrations ?? '?'} (paid: ${res.counts?.paid ?? '?'})`);
  if (res.ok) {
    console.log(`${c.g}✅ Report emailed to ${to}.${c.x}\n`);
    process.exit(0);
  }
  if (res.emailStatus === 'skipped') {
    console.log(`${c.r}⚠️  Email skipped — BREVO_API_KEY not set. CSVs were built but not sent.${c.x}\n`);
    process.exit(1);
  }
  console.log(`${c.r}❌ Could not send the report (emailStatus: ${res.emailStatus || res.error}).${c.x}\n`);
  process.exit(1);
} catch (err) {
  console.log(`${c.r}❌ Report failed: ${err.message}${c.x}`);
  console.log(`${c.d}   (Is MySQL reachable? Check DB settings in .env.)${c.x}\n`);
  process.exit(1);
}
