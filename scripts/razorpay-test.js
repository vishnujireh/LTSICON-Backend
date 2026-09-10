/**
 * Verifies the Razorpay keys by creating a test order (no money is charged).
 * Usage:  npm run pay:test            (defaults to ₹1)
 *         npm run pay:test 12500      (order for ₹12,500)
 *
 * A successful run means RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are correct and
 * the server can reach Razorpay. It prints the created order id.
 */
import { env, razorpayEnabled } from '../src/config/env.js';

const c = { g: '\x1b[32m', r: '\x1b[31m', d: '\x1b[2m', b: '\x1b[1m', x: '\x1b[0m' };
const rupees = Number(process.argv[2]) || 1;

console.log(`\n${c.b}Razorpay key check${c.x}`);
console.log(`  KEY_ID : ${env.razorpay.keyId || c.r + '(missing)' + c.x}`);
console.log(`  SECRET : ${env.razorpay.keySecret ? 'set (' + env.razorpay.keySecret.length + ' chars)' : c.r + '(missing)' + c.x}`);
console.log(`  Order  : ₹${rupees.toLocaleString('en-IN')}\n`);

if (!razorpayEnabled()) {
  console.log(`${c.r}Keys not configured in .env — nothing to test.${c.x}\n`);
  process.exit(1);
}
if (!/^rzp_(test|live)_/.test(env.razorpay.keyId)) {
  console.log(`${c.r}KEY_ID doesn't look like a Razorpay key (expected rzp_test_… or rzp_live_…).${c.x}\n`);
}

const auth = Buffer.from(`${env.razorpay.keyId}:${env.razorpay.keySecret}`).toString('base64');
try {
  const res = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { authorization: `Basic ${auth}`, 'content-type': 'application/json' },
    body: JSON.stringify({ amount: Math.round(rupees * 100), currency: 'INR', receipt: `test_${Date.now()}` }),
  });
  const data = await res.json().catch(() => ({}));
  if (res.ok) {
    console.log(`${c.g}✅ Keys work — order created.${c.x}`);
    console.log(`   order id : ${data.id}`);
    console.log(`   amount   : ₹${(data.amount / 100).toLocaleString('en-IN')}  status: ${data.status}`);
    console.log(`${c.d}   (Test order — no money charged. Live checkout is tested from the site.)${c.x}\n`);
    process.exit(0);
  }
  console.log(`${c.r}❌ Razorpay rejected the request — HTTP ${res.status}${c.x}`);
  console.log(`   ${data?.error?.description || JSON.stringify(data)}`);
  if (res.status === 401) console.log(`${c.b}   → 401 means the KEY_ID/SECRET pair is wrong.${c.x}`);
  console.log('');
  process.exit(1);
} catch (err) {
  console.log(`${c.r}❌ Could not reach Razorpay: ${err.message}${c.x}`);
  console.log(`${c.d}   Check the server's internet/firewall.${c.x}\n`);
  process.exit(1);
}
