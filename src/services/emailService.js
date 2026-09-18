import { env, mailEnabled } from '../config/env.js';

const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

/**
 * Sends a transactional email through Brevo.
 * Returns one of: 'sent' | 'skipped' | 'failed'.
 *
 * When no BREVO_API_KEY is configured the call is a safe no-op ('skipped'),
 * so the rest of the flow (DB save) still succeeds during development.
 */
export async function sendEmail({ to, subject, htmlContent, replyTo, attachments }) {
  if (!mailEnabled()) {
    console.warn(`[email] BREVO_API_KEY not set — skipping "${subject}"`);
    return 'skipped';
  }

  const recipients = (Array.isArray(to) ? to : [to])
    .filter((r) => r && r.email)
    .map((r) => ({ email: r.email, name: r.name || undefined }));

  if (recipients.length === 0) return 'skipped';

  const payload = {
    sender: { email: env.mail.fromEmail, name: env.mail.fromName },
    to: recipients,
    subject,
    htmlContent,
  };
  if (replyTo) payload.replyTo = replyTo;
  if (attachments && attachments.length) payload.attachment = attachments;

  try {
    const res = await fetch(BREVO_ENDPOINT, {
      method: 'POST',
      headers: {
        'api-key': env.mail.brevoApiKey,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error(`[email] Brevo responded ${res.status}: ${detail}`);
      return 'failed';
    }
    return 'sent';
  } catch (err) {
    console.error('[email] send failed:', err.message);
    return 'failed';
  }
}

const esc = (v) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const row = (label, value) =>
  value === undefined || value === null || value === ''
    ? ''
    : `<tr><td style="padding:6px 12px;font-weight:600;color:#6E1A2B;vertical-align:top;">${esc(
        label
      )}</td><td style="padding:6px 12px;color:#33242A;">${esc(value)}</td></tr>`;

// Like row(), but the value is raw HTML (already escaped by the caller).
const rowRaw = (label, html) =>
  !html
    ? ''
    : `<tr><td style="padding:6px 12px;font-weight:600;color:#6E1A2B;vertical-align:top;">${esc(
        label
      )}</td><td style="padding:6px 12px;color:#33242A;">${html}</td></tr>`;

// Format an amount the same way the site does: e.g. money('₹', 8000) -> "₹8,000".
const money = (currency, amount) =>
  `${currency || ''}${Number(amount || 0).toLocaleString('en-IN')}`;

function wrap(title, rowsHtml, note) {
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:auto;">
    <div style="background:#6E1A2B;color:#FBF1DD;padding:18px 24px;border-radius:12px 12px 0 0;">
      <h2 style="margin:0;font-size:18px;">LTSICON Chennai 2026</h2>
      <p style="margin:4px 0 0;font-size:13px;opacity:.85;">${esc(title)}</p>
    </div>
    <table style="width:100%;border-collapse:collapse;border:1px solid #E7D9BB;border-top:none;">
      ${rowsHtml}
    </table>
    ${note ? `<p style="font-size:12px;color:#6E5C54;margin-top:12px;">${note}</p>` : ''}
  </div>`;
}

/** Password-reset email with a one-time reset link. */
export async function sendPasswordResetEmail(to, name, resetUrl) {
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:auto;">
      <div style="background:#6E1A2B;color:#FBF1DD;padding:18px 24px;border-radius:12px 12px 0 0;">
        <h2 style="margin:0;font-size:18px;">LTSICON Chennai 2026</h2>
        <p style="margin:4px 0 0;font-size:13px;opacity:.85;">Password reset</p>
      </div>
      <div style="border:1px solid #E7D9BB;border-top:none;padding:20px 24px;color:#33242A;">
        <p>Hi ${esc(name || 'there')},</p>
        <p>We received a request to reset your password. Click the button below to choose a new one. This link expires in 1 hour.</p>
        <p style="text-align:center;margin:24px 0;">
          <a href="${esc(resetUrl)}" style="background:#6E1A2B;color:#FBF1DD;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:600;display:inline-block;">Reset password</a>
        </p>
        <p style="font-size:12px;color:#6E5C54;">If the button doesn't work, copy this link into your browser:<br/>${esc(resetUrl)}</p>
        <p style="font-size:12px;color:#6E5C54;">If you didn't request this, you can safely ignore this email.</p>
      </div>
    </div>`;

  return sendEmail({
    to: [{ email: to, name }],
    subject: 'Reset your LTSICON password',
    htmlContent: html,
  });
}

// Brevo rejects very large payloads; only inline-attach files up to ~8 MB and
// rely on the download link for anything bigger.
const MAX_ATTACH_BYTES = 8 * 1024 * 1024;

/** Confirmation to the submitting author + copy to organisers. */
export async function sendAbstractEmails(a) {
  // The attachment cell links to the file when we have a download URL.
  const attachmentCell = a.fileName
    ? a.fileUrl
      ? `<a href="${esc(a.fileUrl)}" style="color:#6E1A2B;font-weight:600;">${esc(a.fileName)}</a>`
      : esc(a.fileName)
    : '';

  const rows =
    row('Name', `${a.firstName} ${a.lastName}`) +
    row('Email', a.email) +
    row('Mobile', a.mobile) +
    row('Institution', a.institution) +
    row('Co-authors', a.coAuthors) +
    row('Membership / Reg. ID', a.membershipId) +
    row('Presentation type', a.presentationType) +
    row('Track / Theme', a.track) +
    row('Title', a.title) +
    row('Keywords', a.keywords) +
    (attachmentCell
      ? `<tr><td style="padding:6px 12px;font-weight:600;color:#6E1A2B;vertical-align:top;">Attachment</td><td style="padding:6px 12px;color:#33242A;">${attachmentCell}</td></tr>`
      : '') +
    row('Abstract', a.abstractBody);

  const recipients = [{ email: a.email, name: `${a.firstName} ${a.lastName}` }];
  if (env.mail.adminEmail) recipients.push({ email: env.mail.adminEmail });

  // Attach the real file when it's present and not too large for email.
  let attachments;
  if (a.fileBuffer && a.fileName && a.fileBuffer.length <= MAX_ATTACH_BYTES) {
    attachments = [{ name: a.fileName, content: a.fileBuffer.toString('base64') }];
  }

  const note = a.fileUrl
    ? 'Thank you for your submission. The uploaded file is attached, and can also be downloaded via the link above. Our scientific committee will review it and notify you of the outcome.'
    : 'Thank you for your submission. Our scientific committee will review it and notify you of the outcome.';

  return sendEmail({
    to: recipients,
    subject: `Abstract received — ${a.title}`,
    htmlContent: wrap('Abstract submission received', rows, note),
    replyTo: env.mail.adminEmail ? { email: env.mail.adminEmail } : undefined,
    attachments,
  });
}

/**
 * Confirmation to the delegate + copy to organisers.
 * stage = 'started'  → details captured at step 1, payment still pending.
 * stage = 'confirmed' → registration completed / paid.
 */
export async function sendRegistrationEmails(r, stage = 'started') {
  const confirmed = stage === 'confirmed';
  const b = r.breakdown; // itemised amounts (present on the confirmed email)

  // Workshops — each with its fee when the breakdown is available.
  let workshopsCell = '';
  if (b && Array.isArray(b.workshops) && b.workshops.length) {
    workshopsCell =
      b.workshops
        .map((w) => `${esc(w.name)} — ${esc(money(b.wsCurrency, w.amount))}`)
        .join('<br>') +
      `<br><b>Subtotal: ${esc(money(b.wsCurrency, b.workshopsTotal))}</b>`;
  } else if (Array.isArray(r.workshops) && r.workshops.length) {
    workshopsCell = r.workshops.map((w) => esc(typeof w === 'string' ? w : w.name)).join('<br>');
  }

  // Accompanying persons — name, mobile, and the per-head charge.
  let guestsCell = '';
  if (Array.isArray(r.guests) && r.guests.length) {
    const unitCur = b ? b.guestCurrency : r.currency;
    const unit = b ? b.guestUnit : null;
    const lines = r.guests
      .map((g) => (typeof g === 'string' ? { name: g } : g))
      .filter((g) => g && g.name)
      .map((g) => {
        const mob = g.mobile ? ` (${esc(g.mobile)})` : '';
        const charge = unit != null ? ` — ${esc(money(unitCur, unit))}` : '';
        return `${esc(g.name)}${mob}${charge}`;
      });
    if (lines.length) {
      guestsCell = lines.join('<br>');
      if (b) {
        guestsCell += `<br><b>Subtotal: ${b.guestCount} × ${esc(
          money(b.guestCurrency, b.guestUnit)
        )} = ${esc(money(b.guestCurrency, b.guestsTotal))}</b>`;
      }
    }
  }

  // Grand total — the multi-currency-aware label from the site, or the stored amount.
  const grandTotal = b && b.grandTotalLabel
    ? b.grandTotalLabel
    : r.totalAmount != null
      ? money(r.currency, r.totalAmount)
      : '';

  const rows =
    // Unique sequential reference (e.g. LTSICON_0001); falls back to internal ref.
    row('Reference', r.orderNo || r.reference) +
    row('Name', r.name) +
    row('Email', r.email) +
    row('Phone', r.phone) +
    row('Designation', r.designation) +
    row('Institution', r.institution) +
    row('Category', r.category) +
    (b ? row('Conference fee', money(b.currency, b.conferenceAmount)) : '') +
    rowRaw('Workshops', workshopsCell) +
    rowRaw('Accompanying', guestsCell) +
    row('Phase', r.phase) +
    // Subtotal + GST breakdown (present on GST-enabled submissions).
    (b && b.subtotal != null ? row('Subtotal', money(b.currency, b.subtotal)) : '') +
    (b && b.gstAmount != null ? row(`GST (${b.gstRate || 18}%)`, money(b.currency, b.gstAmount)) : '') +
    (grandTotal
      ? rowRaw('Grand Total', `<b style="font-size:15px;color:#6E1A2B;">${esc(grandTotal)}</b>`)
      : '') +
    // Payment ID shown; Razorpay Order ID is stored in the DB but hidden here.
    row('Payment ID', r.paymentId);

  const recipients = [{ email: r.email, name: r.name }];
  if (env.mail.adminEmail) recipients.push({ email: env.mail.adminEmail });

  return sendEmail({
    to: recipients,
    subject: confirmed
      ? `Registration confirmed — ${r.reference}`
      : `Registration received — ${r.reference}`,
    htmlContent: wrap(
      confirmed ? 'Delegate registration confirmed' : 'Delegate registration received',
      rows,
      confirmed
        ? 'Your registration is confirmed. We look forward to welcoming you in Chennai.'
        : 'Your details are saved. Complete payment any time to confirm your seat.'
    ),
    replyTo: env.mail.adminEmail ? { email: env.mail.adminEmail } : undefined,
  });
}
