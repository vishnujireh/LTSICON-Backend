import { getPool } from '../config/db.js';
import { razorpayEnabled } from '../config/env.js';
import { validateRegistration } from '../utils/validate.js';
import { sendRegistrationEmails } from '../services/emailService.js';
import { verifyPaymentSignature } from './paymentController.js';

// Hands out the next gap-free sequential order number, e.g. "LTSICON_0001".
// Uses MySQL's connection-scoped LAST_INSERT_ID() so it's atomic under load.
async function nextOrderNo() {
  const conn = await getPool().getConnection();
  try {
    await conn.query("INSERT IGNORE INTO counters (name, value) VALUES ('registration_order', 0)");
    await conn.query("UPDATE counters SET value = LAST_INSERT_ID(value + 1) WHERE name = 'registration_order'");
    const [[row]] = await conn.query('SELECT LAST_INSERT_ID() AS v');
    return `LTSICON_${String(row.v).padStart(4, '0')}`;
  } finally {
    conn.release();
  }
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
 * Step 6 — payment confirmation via Razorpay. Verifies the checkout signature
 * server-side, marks the registration paid, stores the Razorpay ids and sends
 * the "confirmed" email. Body is JSON.
 */
export async function confirmRegistration(req, res, next) {
  try {
    const reference = String(req.params.reference || '').trim();
    if (!reference) return res.status(400).json({ ok: false, errors: ['Reference is required.'] });

    const body = req.body || {};

    const { valid, errors, data } = validateRegistration({ ...body, reference });
    if (!valid) return res.status(400).json({ ok: false, errors });

    // Razorpay payment proof — the browser returns these after a successful pay.
    const orderId = String(body.razorpay_order_id || '').trim();
    const paymentId = String(body.razorpay_payment_id || '').trim();
    const signature = String(body.razorpay_signature || '').trim();

    if (!orderId || !paymentId || !signature) {
      return res.status(400).json({ ok: false, errors: ['Payment details are required.'] });
    }
    // Verify the signature server-side — never trust the client's "paid" claim.
    if (razorpayEnabled() && !verifyPaymentSignature({ orderId, paymentId, signature })) {
      return res.status(400).json({ ok: false, errors: ['Payment verification failed.'] });
    }

    // Find the existing row by its pre-payment reference, or by the Razorpay
    // order id (covers a repeated confirm where the reference was already
    // renamed to LTSICON_####).
    const [rows] = await getPool().execute(
      'SELECT id, order_no FROM registrations WHERE reference = ? OR razorpay_order_id = ? LIMIT 1',
      [reference, orderId]
    );
    const existingRow = rows[0];
    // Reuse the number if already assigned; otherwise take the next one.
    const orderNo = existingRow?.order_no || (await nextOrderNo());

    // Tax breakdown from the client's breakdown object (stored for GST accounting).
    const bd = body.breakdown || {};
    const subtotal = bd.subtotal != null ? Number(bd.subtotal) : null;
    const gstRate = bd.gstRate != null ? Number(bd.gstRate) : null;
    const gstAmount = bd.gstAmount != null ? Number(bd.gstAmount) : null;

    // Pass the breakdown + reference (LTSICON_####) + Razorpay ids to the email.
    const emailStatus = await sendRegistrationEmails(
      { ...data, breakdown: body.breakdown, orderNo, paymentId, orderId },
      'confirmed'
    );

    if (existingRow) {
      // Overwrite the reference with the final unique LTSICON_#### number.
      await getPool().execute(
        `UPDATE registrations SET
           reference=?, name=?, email=?, phone=?, designation=?, institution=?, address=?,
           mci_number=?, mci_state=?, category=?, workshops=?, guests=?,
           currency=?, subtotal=?, gst_rate=?, gst_amount=?, total_amount=?, phase=?, order_no=?,
           razorpay_order_id=?, razorpay_payment_id=?, payment_status=?, email_status=?
         WHERE id=?`,
        [
          orderNo,
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
          subtotal,
          gstRate,
          gstAmount,
          data.totalAmount,
          data.phase || null,
          orderNo,
          orderId,
          paymentId,
          'paid',
          emailStatus,
          existingRow.id,
        ]
      );
    } else {
      // No lead row — create it now with the final reference.
      await getPool().execute(
        `INSERT INTO registrations
          (reference, name, email, phone, designation, institution, address,
           mci_number, mci_state, category, workshops, guests, currency,
           subtotal, gst_rate, gst_amount, total_amount, phase, order_no,
           razorpay_order_id, razorpay_payment_id, payment_status, email_status)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          orderNo, data.name, data.email, data.phone || null, data.designation || null,
          data.institution || null, data.address || null, data.mciNumber || null,
          data.mciState || null, data.category || null, JSON.stringify(data.workshops || []),
          JSON.stringify(data.guests || []), data.currency || null,
          subtotal, gstRate, gstAmount, data.totalAmount,
          data.phase || null, orderNo, orderId, paymentId, 'paid', emailStatus,
        ]
      );
    }

    return res.json({
      ok: true,
      reference: orderNo,
      orderNo,
      paymentId,
      orderId,
      paymentStatus: 'paid',
      emailStatus,
      message: 'Registration confirmed.',
    });
  } catch (err) {
    return next(err);
  }
}
