import { getPool } from '../config/db.js';
import { env, mailEnabled } from '../config/env.js';
import { sendEmail } from './emailService.js';

// ── CSV helpers ────────────────────────────────────────
function csvCell(v) {
  if (v === null || v === undefined) return '';
  let s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  // Quote if it contains comma, quote, or newline; escape quotes by doubling.
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(columns, rows) {
  const header = columns.map((c) => csvCell(c.label)).join(',');
  const body = rows
    .map((r) => columns.map((c) => csvCell(r[c.key])).join(','))
    .join('\n');
  return `${header}\n${body}`;
}

const ABSTRACT_COLUMNS = [
  { key: 'id', label: 'ID' },
  { key: 'created_at', label: 'Submitted At' },
  { key: 'first_name', label: 'First Name' },
  { key: 'last_name', label: 'Last Name' },
  { key: 'email', label: 'Email' },
  { key: 'mobile', label: 'Mobile' },
  { key: 'institution', label: 'Institution' },
  { key: 'co_authors', label: 'Co-authors' },
  { key: 'membership_id', label: 'Membership/Reg ID' },
  { key: 'presentation_type', label: 'Presentation Type' },
  { key: 'track', label: 'Track' },
  { key: 'title', label: 'Title' },
  { key: 'keywords', label: 'Keywords' },
  { key: 'file_name', label: 'Attachment' },
  { key: 'email_status', label: 'Email Status' },
];

const REGISTRATION_COLUMNS = [
  { key: 'id', label: 'ID' },
  { key: 'created_at', label: 'Registered At' },
  { key: 'reference', label: 'Reference' },
  { key: 'name', label: 'Name' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'designation', label: 'Designation' },
  { key: 'institution', label: 'Institution' },
  { key: 'category', label: 'Category' },
  { key: 'workshops', label: 'Workshops' },
  { key: 'guests', label: 'Accompanying' },
  { key: 'currency', label: 'Currency' },
  { key: 'total_amount', label: 'Total' },
  { key: 'phase', label: 'Phase' },
  { key: 'payment_status', label: 'Payment Status' },
  { key: 'razorpay_payment_id', label: 'Razorpay Payment ID' },
  { key: 'razorpay_order_id', label: 'Razorpay Order ID' },
  { key: 'email_status', label: 'Email Status' },
];

// ── Data ───────────────────────────────────────────────
async function fetchRows() {
  const pool = getPool();
  const [abstracts] = await pool.query(
    `SELECT id, created_at, first_name, last_name, email, mobile, institution,
            co_authors, membership_id, presentation_type, track, title, keywords,
            file_name, email_status
     FROM abstracts ORDER BY id`
  );
  const [registrations] = await pool.query(
    `SELECT id, created_at, reference, name, email, phone, designation, institution,
            category, workshops, guests, currency, total_amount, phase,
            payment_status, razorpay_payment_id, razorpay_order_id, email_status
     FROM registrations ORDER BY id`
  );
  return { abstracts, registrations };
}

const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');

/**
 * Builds the two CSVs and emails them to the report recipient.
 * Returns { ok, emailStatus, counts } (throws only on DB errors).
 */
export async function sendDataReport(toEmail = env.report.email) {
  if (!toEmail) return { ok: false, error: 'No report recipient configured.' };

  const { abstracts, registrations } = await fetchRows();
  const date = new Date().toISOString().slice(0, 10);

  const abstractsCsv = toCsv(ABSTRACT_COLUMNS, abstracts);
  const registrationsCsv = toCsv(REGISTRATION_COLUMNS, registrations);

  const paid = registrations.filter((r) => r.payment_status === 'paid').length;

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:auto;">
      <div style="background:#6E1A2B;color:#FBF1DD;padding:18px 24px;border-radius:12px 12px 0 0;">
        <h2 style="margin:0;font-size:18px;">LTSICON Chennai 2026</h2>
        <p style="margin:4px 0 0;font-size:13px;opacity:.85;">Data export — ${date}</p>
      </div>
      <div style="border:1px solid #E7D9BB;border-top:none;padding:20px 24px;color:#33242A;">
        <p>Attached are the latest submissions as of ${new Date().toString()}.</p>
        <ul>
          <li><b>Abstract submissions:</b> ${abstracts.length}</li>
          <li><b>Registrations:</b> ${registrations.length} (paid: ${paid})</li>
        </ul>
        <p style="font-size:12px;color:#6E5C54;">Two CSV files are attached — open them in Excel or Google Sheets.</p>
      </div>
    </div>`;

  const emailStatus = await sendEmail({
    to: [{ email: toEmail }],
    subject: `LTSICON data export — ${date}`,
    htmlContent: html,
    attachments: [
      { name: `abstracts-${date}.csv`, content: b64(abstractsCsv) },
      { name: `registrations-${date}.csv`, content: b64(registrationsCsv) },
    ],
  });

  return {
    ok: emailStatus === 'sent',
    emailStatus,
    to: toEmail,
    counts: { abstracts: abstracts.length, registrations: registrations.length, paid },
    mailConfigured: mailEnabled(),
  };
}

// ── Persisted 48-hour clock (survives restarts) ────────
// Stores the last-sent time (epoch seconds) in the counters table.
export async function getLastReportSent() {
  const [rows] = await getPool().query(
    "SELECT value FROM counters WHERE name = 'report_last_sent'"
  );
  return rows[0] ? Number(rows[0].value) : 0;
}

export async function markReportSent(epoch = Math.floor(Date.now() / 1000)) {
  await getPool().query(
    "INSERT INTO counters (name, value) VALUES ('report_last_sent', ?) ON DUPLICATE KEY UPDATE value = ?",
    [epoch, epoch]
  );
}

// Exposed for testing.
export const _internal = { toCsv, ABSTRACT_COLUMNS, REGISTRATION_COLUMNS };
