import crypto from 'node:crypto';
import { env, razorpayEnabled } from '../config/env.js';

const RAZORPAY_ORDERS = 'https://api.razorpay.com/v1/orders';

// Razorpay works in the smallest currency unit (paise for INR).
const toMinorUnits = (amount) => Math.round(Number(amount || 0) * 100);

// Map the site's currency symbol to a Razorpay ISO currency code.
function currencyCode(cur) {
  if (!cur) return 'INR';
  if (cur === '₹' || cur.toUpperCase() === 'INR') return 'INR';
  if (cur === '$' || cur.toUpperCase() === 'USD') return 'USD';
  return cur.toUpperCase();
}

/**
 * POST /api/payments/order
 * Body: { amount (major units), currency, reference }
 * Creates a Razorpay order and returns the details the checkout needs.
 */
export async function createOrder(req, res, next) {
  try {
    if (!razorpayEnabled()) {
      return res.status(500).json({ ok: false, errors: ['Payment gateway is not configured.'] });
    }
    const amount = toMinorUnits(req.body?.amount);
    if (amount <= 0) {
      return res.status(400).json({ ok: false, errors: ['A valid amount is required.'] });
    }
    const currency = currencyCode(req.body?.currency);
    const receipt = String(req.body?.reference || `rcpt_${Date.now()}`).slice(0, 40);

    const auth = Buffer.from(`${env.razorpay.keyId}:${env.razorpay.keySecret}`).toString('base64');
    const resp = await fetch(RAZORPAY_ORDERS, {
      method: 'POST',
      headers: { authorization: `Basic ${auth}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        amount,
        currency,
        receipt,
        notes: { reference: req.body?.reference || '' },
      }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      console.error('[razorpay] order failed:', data?.error?.description || resp.status);
      return res.status(502).json({
        ok: false,
        errors: [data?.error?.description || 'Could not create the payment order.'],
      });
    }

    return res.json({
      ok: true,
      orderId: data.id,
      amount: data.amount,
      currency: data.currency,
      keyId: env.razorpay.keyId, // public key — safe to expose to the checkout
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Verifies the checkout signature Razorpay returns to the browser.
 * signature === HMAC_SHA256(order_id + "|" + payment_id, key_secret)
 */
export function verifyPaymentSignature({ orderId, paymentId, signature }) {
  if (!orderId || !paymentId || !signature) return false;
  const expected = crypto
    .createHmac('sha256', env.razorpay.keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  // Constant-time comparison.
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
