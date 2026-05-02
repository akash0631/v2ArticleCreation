require('dotenv').config();

const cron = require('node-cron');
const axios = require('axios');
const { CRON_SCHEDULES, API_BASE_URL, WATCHER_API_KEY } = require('./config');
const { load: loadProcessed } = require('./processedTracker');
const { runScan } = require('./scanner');
const log = require('./logger');

// --test flag: run one scan immediately and exit (for manual testing)
const testMode = process.argv.includes('--test');

/**
 * Call the backend SRM sync endpoint.
 * Fetches all presentation records from the SRM API and inserts new ones
 * into extraction_results_flat without any AI extraction.
 */
async function runSrmSync() {
  try {
    log.info('[SRM Sync] Triggering SRM sync via backend...');
    const res = await axios.post(
      `${API_BASE_URL}/api/watcher/sync-srm`,
      {},
      { headers: { 'X-Watcher-Key': WATCHER_API_KEY }, timeout: 120_000 }
    );
    const d = res.data;
    log.info(`[SRM Sync] Done — inserted: ${d.inserted}, skipped: ${d.skipped}, errors: ${d.errors}, total: ${d.total}`);
  } catch (err) {
    log.error('[SRM Sync] Failed:', err?.response?.data || err.message);
  }
}

async function main() {
  log.info('AI Fashion Watcher Service starting...');
  log.info(`Schedules: 12:00 PM, 8:00 PM (daily)`);

  // Load list of already-processed images
  loadProcessed();

  if (testMode) {
    log.info('[TEST MODE] Running one scan now and exiting...');
    await runScan();
    await runSrmSync();
    process.exit(0);
    return;
  }

  // Schedule scans at 12pm, 8pm
  CRON_SCHEDULES.forEach((schedule, i) => {
    const labels = ['12:00 PM', '8:00 PM'];
    cron.schedule(schedule, async () => {
      log.info(`Scheduled scan triggered: ${labels[i]}`);
      try {
        await runScan();
      } catch (err) {
        log.error('Unexpected error during image scan:', err.message);
      }
      // Also sync SRM API data on every cron run
      await runSrmSync();
    });
    log.info(`Scheduled: ${labels[i]} (cron: ${schedule})`);
  });

  log.info('Watcher is running. Waiting for scheduled times...');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
