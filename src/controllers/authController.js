import { getPool } from '../config/db.js';
import { env } from '../config/env.js';
import { isEmail, str } from '../utils/validate.js';
import {
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
  makeResetToken,
  hashResetToken,
} from '../utils/authTokens.js';
import { sendPasswordResetEmail } from '../services/emailService.js';

const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email });

function tokenFromHeader(req) {
  const h = req.get('authorization') || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : '';
}

// Resolves the authenticated user from the Bearer token, or null.
export async function currentUser(req) {
  const payload = verifyToken(tokenFromHeader(req));
  if (!payload?.uid) return null;
  const [rows] = await getPool().execute(
    'SELECT id, name, email FROM users WHERE id = ? LIMIT 1',
    [payload.uid]
  );
  return rows[0] || null;
}

/** POST /api/auth/register — create an account, return a login token. */
export async function register(req, res, next) {
  try {
    const name = str(req.body?.name);
    const email = str(req.body?.email).toLowerCase();
    const password = String(req.body?.password || '');

    const errors = [];
    if (!name) errors.push('Name is required.');
    if (!isEmail(email)) errors.push('A valid email is required.');
    if (password.length < 6) errors.push('Password must be at least 6 characters.');
    if (errors.length) return res.status(400).json({ ok: false, errors });

    const [exists] = await getPool().execute('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
    if (exists.length) {
      return res.status(409).json({ ok: false, errors: ['An account with this email already exists. Please log in.'] });
    }

    const [result] = await getPool().execute(
      'INSERT INTO users (name, email, password_hash) VALUES (?,?,?)',
      [name, email, hashPassword(password)]
    );
    const user = { id: result.insertId, name, email };
    return res.status(201).json({ ok: true, token: signToken({ uid: user.id }), user: publicUser(user) });
  } catch (err) {
    return next(err);
  }
}

/** POST /api/auth/login — verify credentials, return a login token. */
export async function login(req, res, next) {
  try {
    const email = str(req.body?.email).toLowerCase();
    const password = String(req.body?.password || '');
    if (!isEmail(email) || !password) {
      return res.status(400).json({ ok: false, errors: ['Email and password are required.'] });
    }
    const [rows] = await getPool().execute(
      'SELECT id, name, email, password_hash FROM users WHERE email = ? LIMIT 1',
      [email]
    );
    const user = rows[0];
    if (!user || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ ok: false, errors: ['Incorrect email or password.'] });
    }
    return res.json({ ok: true, token: signToken({ uid: user.id }), user: publicUser(user) });
  } catch (err) {
    return next(err);
  }
}

/** GET /api/auth/me — return the user for a valid token. */
export async function me(req, res, next) {
  try {
    const user = await currentUser(req);
    if (!user) return res.status(401).json({ ok: false, errors: ['Not authenticated.'] });
    return res.json({ ok: true, user: publicUser(user) });
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /api/auth/forgot-password — email a reset link if the account exists.
 * Always returns ok (never reveals whether an email is registered).
 */
export async function forgotPassword(req, res, next) {
  try {
    const email = str(req.body?.email).toLowerCase();
    if (!isEmail(email)) return res.status(400).json({ ok: false, errors: ['A valid email is required.'] });

    const [rows] = await getPool().execute(
      'SELECT id, name, email FROM users WHERE email = ? LIMIT 1',
      [email]
    );
    const user = rows[0];
    // Per client request: tell the user plainly whether the email is registered.
    if (!user) {
      return res.status(404).json({
        ok: false,
        errors: ['This email is not registered. Please create an account first.'],
      });
    }

    const { raw, hash } = makeResetToken();
    // 1-hour expiry.
    await getPool().execute(
      'UPDATE users SET reset_token_hash = ?, reset_expires = DATE_ADD(NOW(), INTERVAL 1 HOUR) WHERE id = ?',
      [hash, user.id]
    );
    const proto = req.get('x-forwarded-proto') || req.protocol;
    const host = req.get('x-forwarded-host') || req.get('host');
    const base = env.auth.frontendUrl || `${proto}://${host}`;
    const resetUrl = `${base}/#reset?token=${raw}`;
    const emailStatus = await sendPasswordResetEmail(user.email, user.name, resetUrl);

    return res.json({ ok: true, emailStatus, message: 'A password-reset link has been sent to your email.' });
  } catch (err) {
    return next(err);
  }
}

/** POST /api/auth/reset-password — set a new password using a valid reset token. */
export async function resetPassword(req, res, next) {
  try {
    const token = str(req.body?.token);
    const password = String(req.body?.password || '');
    if (!token) return res.status(400).json({ ok: false, errors: ['Reset token is required.'] });
    if (password.length < 6) return res.status(400).json({ ok: false, errors: ['Password must be at least 6 characters.'] });

    const [rows] = await getPool().execute(
      'SELECT id FROM users WHERE reset_token_hash = ? AND reset_expires > NOW() LIMIT 1',
      [hashResetToken(token)]
    );
    const user = rows[0];
    if (!user) {
      return res.status(400).json({ ok: false, errors: ['This reset link is invalid or has expired.'] });
    }
    await getPool().execute(
      'UPDATE users SET password_hash = ?, reset_token_hash = NULL, reset_expires = NULL WHERE id = ?',
      [hashPassword(password), user.id]
    );
    return res.json({ ok: true, message: 'Password updated. You can now log in.' });
  } catch (err) {
    return next(err);
  }
}
