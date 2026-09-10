import crypto from 'node:crypto';
import { env } from '../config/env.js';

// ── Password hashing (scrypt — built in, no native deps) ──
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password, stored) {
  const [scheme, salt, hash] = String(stored || '').split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const test = crypto.scryptSync(String(password), salt, 64).toString('hex');
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(test, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ── Signed login tokens (HMAC — stateless, no JWT dep) ──
const b64url = (buf) => Buffer.from(buf).toString('base64url');

export function signToken(payload, ttlSec = env.auth.tokenTtlDays * 24 * 3600) {
  const body = { ...payload, exp: Math.floor(Date.now() / 1000) + ttlSec };
  const p = b64url(JSON.stringify(body));
  const sig = crypto.createHmac('sha256', env.auth.secret).update(p).digest('base64url');
  return `${p}.${sig}`;
}

export function verifyToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [p, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', env.auth.secret).update(p).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let body;
  try {
    body = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!body.exp || body.exp < Math.floor(Date.now() / 1000)) return null;
  return body;
}

// ── Password-reset tokens ──
// The raw token goes in the email link; only its hash is stored in the DB.
export function makeResetToken() {
  const raw = crypto.randomBytes(32).toString('hex');
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  return { raw, hash };
}

export const hashResetToken = (raw) =>
  crypto.createHash('sha256').update(String(raw)).digest('hex');
