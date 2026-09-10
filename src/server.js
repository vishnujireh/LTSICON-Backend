import express from 'express';
import cors from 'cors';
import { env, mailEnabled } from './config/env.js';
import { initDb, pingDb } from './config/db.js';
import apiRoutes from './routes/index.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { startScheduledReports } from './services/scheduler.js';

const app = express();
// Behind a reverse proxy / CDN (e.g. Cloudflare) so req.protocol and req.host
// reflect the original https request, used when building download links.
app.set('trust proxy', true);
app.use(
  cors({
    origin: env.corsOrigin.includes('*') ? true : env.corsOrigin,
  })
);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cors());

// Health check — reports DB + email readiness without failing the boot.
app.get('/api/health', async (req, res) => {
  let db = false;
  try {
    db = await pingDb();
  } catch {
    db = false;
  }
  res.json({ ok: true, db, email: mailEnabled() ? 'enabled' : 'disabled' });
});

app.use('/api', apiRoutes);

app.use(notFound);
app.use(errorHandler);

async function start() {
  if (env.db.autoInit) {
    try {
      await initDb();
      console.log('✅ Database ready.');
    } catch (err) {
      console.warn(
        `⚠️  Could not initialise the database (${err.message}). ` +
          'The server will still start; configure MySQL in .env and restart.'
      );
    }
  }

  if (!mailEnabled()) {
    console.warn('⚠️  BREVO_API_KEY not set — emails will be skipped until it is added to .env.');
  }

  app.listen(env.port, () => {
    console.log(`🚀 LTSICON backend listening on http://localhost:${env.port}`);
  });

  // Periodic data export (abstracts + registrations) to the report recipient.
  // Never let scheduler setup affect the API — swallow any startup error.
  startScheduledReports().catch((e) => console.error('🕒 Scheduler start failed:', e.message));
}

start();

export default app;
