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
};

export const mailEnabled = () => Boolean(env.mail.brevoApiKey);
