import fs from 'node:fs';
import path from 'node:path';
import { getPool } from '../config/db.js';
import { env } from '../config/env.js';
import { validateRegistration } from '../utils/validate.js';
import { sendRegistrationEmails } from '../services/emailService.js';
import { UPLOADS_DIR } from './abstractController.js';

// Unique, filesystem-safe stored name that still hints at the original.
function makeStoredName(originalName) {
  const safe = (originalName || 'file').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`;
}

/**
 * Step 1 — lead capture. Creates (or refreshes) a `pending` registration keyed
 * by its reference. NO email is sent at this stage — the data is only stored.
 * Re-posting the same reference updates the existing row (ON DUPLICATE KEY).
 */
export async function createRegistration(req, res, next) {
  try {
    const { valid, errors, data } = validateRegistration(req.body || {});
    if (!valid) return res.status(400).json({ ok: false, errors });

    // Store only — the confirmation email is sent later, at the final step.
    const emailStatus = 'skipped';

    const [result] = await getPool().execute(
      `INSERT INTO registrations
        (reference, name, email, phone, designation, institution, address,
         mci_number, mci_state, category, workshops, guests, currency,
         total_amount, phase, email_status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE
         name=VALUES(name), email=VALUES(email), phone=VALUES(phone),
         designation=VALUES(designation), institution=VALUES(institution),
         address=VALUES(address), mci_number=VALUES(mci_number),
         mci_state=VALUES(mci_state), email_status=VALUES(email_status)`,
      [
        data.reference,
        data.name,
        data.email,
        data.phone || null,
        data.designation || null,
        data.institution || null,
        data.address || null,
        data.mciNumber || null,
        data.mciState || null,
        data.category || null,
        JSON.stringify(data.workshops || []),
        JSON.stringify(data.guests || []),
        data.currency || null,
        data.totalAmount,
        data.phase || null,
        emailStatus,
      ]
    );

    return res.status(201).json({
      ok: true,
      id: result.insertId || null,
      reference: data.reference,
      emailStatus,
      message: 'Registration details saved.',
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Step 6 — payment confirmation. Fills in the choices made across the flow,
 * marks the registration paid and sends the "confirmed" email.
 */
export async function confirmRegistration(req, res, next) {
  try {
    const reference = String(req.params.reference || '').trim();
    if (!reference) return res.status(400).json({ ok: false, errors: ['Reference is required.'] });

    // The payload arrives either as JSON (no file) or, when a screenshot is
    // attached, as a single `payload` field inside multipart/form-data.
    const body = req.body && req.body.payload ? JSON.parse(req.body.payload) : req.body || {};

    const { valid, errors, data } = validateRegistration({ ...body, reference });
    if (!valid) return res.status(400).json({ ok: false, errors });

    // Payment proof — both fields are required on the final step.
    const transactionId = String(body.transactionId ?? body.transaction_id ?? '').trim();
    if (!transactionId) {
      return res.status(400).json({ ok: false, errors: ['Transaction number / ID is required.'] });
    }
    if (!req.file) {
      return res.status(400).json({ ok: false, errors: ['Payment screenshot is required.'] });
    }

    // Save the screenshot to the uploads/ folder and build a download link.
    const stored = makeStoredName(req.file.originalname);
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    fs.writeFileSync(path.join(UPLOADS_DIR, stored), req.file.buffer);
    const proto = req.get('x-forwarded-proto') || req.protocol;
    const host = req.get('x-forwarded-host') || req.get('host');
    const baseUrl = env.publicBaseUrl || `${proto}://${host}`;
    const screenshotUrl = `${baseUrl}/api/registrations/file/${encodeURIComponent(stored)}`;

    const paid = body.paid !== false; // default true on this endpoint
    // Pass the breakdown + payment proof through to the email.
    const emailStatus = await sendRegistrationEmails(
      { ...data, breakdown: body.breakdown, transactionId, screenshotUrl },
      'confirmed'
    );

    const [result] = await getPool().execute(
      `UPDATE registrations SET
         name=?, email=?, phone=?, designation=?, institution=?, address=?,
         mci_number=?, mci_state=?, category=?, workshops=?, guests=?,
         currency=?, total_amount=?, phase=?, transaction_id=?, payment_screenshot=?,
         payment_status=?, email_status=?
       WHERE reference=?`,
      [
        data.name,
        data.email,
        data.phone || null,
        data.designation || null,
        data.institution || null,
        data.address || null,
        data.mciNumber || null,
        data.mciState || null,
        data.category || null,
        JSON.stringify(data.workshops || []),
        JSON.stringify(data.guests || []),
        data.currency || null,
        data.totalAmount,
        data.phase || null,
        transactionId,
        stored,
        paid ? 'paid' : 'pending',
        emailStatus,
        reference,
      ]
    );

    // If the lead-capture step was skipped/failed, create the row now.
    if (result.affectedRows === 0) {
      await getPool().execute(
        `INSERT INTO registrations
          (reference, name, email, phone, designation, institution, address,
           mci_number, mci_state, category, workshops, guests, currency,
           total_amount, phase, transaction_id, payment_screenshot, payment_status, email_status)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          reference, data.name, data.email, data.phone || null, data.designation || null,
          data.institution || null, data.address || null, data.mciNumber || null,
          data.mciState || null, data.category || null, JSON.stringify(data.workshops || []),
          JSON.stringify(data.guests || []), data.currency || null, data.totalAmount,
          data.phase || null, transactionId, stored, paid ? 'paid' : 'pending', emailStatus,
        ]
      );
    }

    return res.json({
      ok: true,
      reference,
      transactionId,
      screenshotUrl,
      paymentStatus: paid ? 'paid' : 'pending',
      emailStatus,
      message: 'Registration confirmed.',
    });
  } catch (err) {
    return next(err);
  }
}
