import dotenv from 'dotenv';
dotenv.config();

const bool = (v, def = false) =>
  v === undefined ? def : ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());

const PORT = Number(process.env.PORT) || 4000;

export const env = {
  port: PORT,
  // Optional override for the base URL used in download links (no trailing
  // slash). When empty, the link is derived from the incoming request instead,
  // so it automatically matches the live domain.
  publicBaseUrl: (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, ''),
  corsOrigin: (process.env.CORS_ORIGIN || '*')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  db: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'ltsicon',
    autoInit: bool(process.env.DB_AUTO_INIT, true),
  },

  mail: {
    brevoApiKey: process.env.BREVO_API_KEY || '',
    // Accept both the BREVO_*/ADMIN_* names used in .env and the older MAIL_* names.
    fromEmail: process.env.BREVO_SENDER_EMAIL || process.env.MAIL_FROM_EMAIL || 'no-reply@ltsicon2026.com',
    fromName: process.env.BREVO_SENDER_NAME || process.env.MAIL_FROM_NAME || 'LTSICON Chennai 2026',
    adminEmail: process.env.ADMIN_EMAIL || process.env.MAIL_ADMIN_EMAIL || '',
    adminName: process.env.ADMIN_NAME || 'LTSICON Chennai 2026',
  },

  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID || '',
    keySecret: process.env.RAZORPAY_KEY_SECRET || '',
  },

  auth: {
    // Secret used to sign login tokens. Set a long random AUTH_SECRET in .env;
    // if it changes, existing logins are invalidated (users just log in again).
    secret: process.env.AUTH_SECRET || 'ltsicon-change-this-auth-secret',
    // Base URL of the site, used to build the password-reset link in emails.
    // Falls back to PUBLIC_BASE_URL, then to the request origin.
    frontendUrl: (process.env.FRONTEND_URL || process.env.PUBLIC_BASE_URL || '').replace(/\/$/, ''),
    tokenTtlDays: Number(process.env.AUTH_TOKEN_TTL_DAYS) || 30,
  },

  report: {
    // Recipient for the periodic data export (abstracts + registrations).
    email: process.env.REPORT_EMAIL || 'vishnu@jirehsol.com',
    // True fixed cadence in hours (default 48h). The clock is persisted in the
    // DB, so it survives restarts and isn't affected by month boundaries.
    intervalHours: Number(process.env.REPORT_INTERVAL_HOURS) || 48,
    // Set to false to disable the in-app scheduler (e.g. if using OS cron).
    enabled: bool(process.env.REPORT_ENABLED, true),
  },
};

export const mailEnabled = () => Boolean(env.mail.brevoApiKey);
export const razorpayEnabled = () => Boolean(env.razorpay.keyId && env.razorpay.keySecret);
