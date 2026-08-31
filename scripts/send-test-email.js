/**
 * Sends a single test email through Brevo using the current .env config.
 * Usage:  node scripts/send-test-email.js  [recipient@example.com]
 *
 * Defaults to the ADMIN_EMAIL from .env (vishnu@jirehsol.com).
 * Prints the Brevo response so you can see success (messageId) or the exact
 * error (e.g. sender not verified).
 */
import { env } from '../src/config/env.js';

const to = process.argv[2] || env.mail.adminEmail;

const c = { g: '\x1b[32m', r: '\x1b[31m', d: '\x1b[2m', b: '\x1b[1m', x: '\x1b[0m' };

console.log(`\n${c.b}Sending test email${c.x}`);
console.log(`  From : ${env.mail.fromName} <${env.mail.fromEmail}>`);
console.log(`  To   : ${to}`);
console.log(`  Key  : ${env.mail.brevoApiKey ? env.mail.brevoApiKey.slice(0, 10) + '…' : '(missing!)'}\n`);

if (!env.mail.brevoApiKey) {
  console.log(`${c.r}No BREVO_API_KEY in .env — nothing sent.${c.x}`);
  process.exit(1);
}
if (!to) {
  console.log(`${c.r}No recipient. Pass one as an argument or set ADMIN_EMAIL in .env.${c.x}`);
  process.exit(1);
}

const payload = {
  sender: { email: env.mail.fromEmail, name: env.mail.fromName },
  to: [{ email: to }],
  subject: 'LTSICON Chennai 2026 — Brevo test email',
  htmlContent: `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:auto;">
      <div style="background:#6E1A2B;color:#FBF1DD;padding:18px 24px;border-radius:12px 12px 0 0;">
        <h2 style="margin:0;font-size:18px;">LTSICON Chennai 2026</h2>
        <p style="margin:4px 0 0;font-size:13px;opacity:.85;">Brevo configuration test</p>
      </div>
      <div style="border:1px solid #E7D9BB;border-top:none;padding:20px 24px;color:#33242A;">
        <p>This is a test email confirming the Brevo email configuration is working.</p>
        <p style="font-size:13px;color:#6E5C54;">
          Sender: ${env.mail.fromEmail}<br/>
          Sent: ${new Date().toString()}
        </p>
      </div>
    </div>`,
};

try {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': env.mail.brevoApiKey,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();

  if (res.ok) {
    console.log(`${c.g}✅ Sent successfully.${c.x} Brevo response: ${text}`);
    console.log(`${c.d}   Check ${to} (and the spam folder) in a minute.${c.x}\n`);
  } else {
    console.log(`${c.r}❌ Brevo rejected the send — HTTP ${res.status}${c.x}`);
    console.log(`   ${text}`);
    if (/sender/i.test(text)) {
      console.log(`\n${c.b}Likely fix:${c.x} verify ${env.mail.fromEmail} in Brevo →`);
      console.log(`   Senders, Domains & Dedicated IPs → Senders → add & confirm it.`);
    }
    console.log('');
    process.exit(1);
  }
} catch (err) {
  console.log(`${c.r}❌ Could not reach Brevo: ${err.message}${c.x}`);
  console.log(`${c.d}   Check your internet connection / firewall.${c.x}\n`);
  process.exit(1);
}
