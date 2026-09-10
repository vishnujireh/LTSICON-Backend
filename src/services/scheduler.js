import { env } from '../config/env.js';
import { sendDataReport, getLastReportSent, markReportSent } from './reportService.js';

const HOUR = 3600;

/**
 * Sends the data export if at least REPORT_INTERVAL_HOURS have passed since the
 * last send. The last-sent time is persisted in the DB, so the true 48-hour
 * cadence holds even across restarts (and has no month-boundary gaps).
 */
async function runIfDue() {
  const intervalSec = env.report.intervalHours * HOUR;
  const now = Math.floor(Date.now() / 1000);
  const last = await getLastReportSent();

  // First run ever: start the clock (first export goes out one interval later).
  if (!last) {
    await markReportSent(now);
    console.log(`🕒 Data export clock started — first export in ~${env.report.intervalHours}h.`);
    return;
  }
  if (now - last >= intervalSec) {
    const res = await sendDataReport();
    await markReportSent(now);
    console.log(`🕒 Data export sent to ${res.to} (status ${res.emailStatus}, ` +
      `abstracts ${res.counts?.abstracts}, registrations ${res.counts?.registrations}).`);
  }
}

export async function startScheduledReports() {
  if (!env.report.enabled) {
    console.log('🕒 Scheduled data export is disabled (REPORT_ENABLED=false).');
    return;
  }

  // Load node-cron lazily so a missing/optional dependency can never crash the
  // whole server on boot — the API keeps working even if the scheduler can't.
  let cron;
  try {
    cron = (await import('node-cron')).default;
  } catch {
    console.warn('⚠️  node-cron not installed — scheduled data export is off. Run `npm install`, then restart.');
    return;
  }

  const tick = () => runIfDue().catch((e) => console.error('🕒 Report check failed:', e.message));

  // Check every hour, and once ~15s after boot to catch up promptly.
  cron.schedule('5 * * * *', tick);
  setTimeout(tick, 15000);

  console.log(`🕒 Data export every ${env.report.intervalHours}h → ${env.report.email}.`);
}
