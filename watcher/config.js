require('dotenv').config();

module.exports = {
  // Root UNC path to watch
  WATCH_ROOT: process.env.WATCH_ROOT || '\\\\File\\0-v2\\04-DEPARTMENT\\02-PO COMMITEE\\13-PRESENTATION\\02-P-PHOTOS',

  // ── FLAT MODE ──────────────────────────────────────────────────────────────
  // Set FLAT_MODE=true when WATCH_ROOT contains images directly (no
  // YEAR/MONTH/DIVISION/DATE hierarchy).  Every image under WATCH_ROOT is
  // submitted using the DEFAULT_* fields below as metadata.
  FLAT_MODE: (process.env.FLAT_MODE || 'false').toLowerCase() === 'true',

  // Optional metadata applied to every image in flat mode.
  // Leave blank to let the backend extract / infer these automatically.
  DEFAULT_DIVISION:       process.env.DEFAULT_DIVISION       || '',
  DEFAULT_SUB_DIVISION:   process.env.DEFAULT_SUB_DIVISION   || '',
  DEFAULT_VENDOR_NAME:    process.env.DEFAULT_VENDOR_NAME    || '',
  DEFAULT_VENDOR_CODE:    process.env.DEFAULT_VENDOR_CODE    || '',
  DEFAULT_MAJOR_CATEGORY: process.env.DEFAULT_MAJOR_CATEGORY || '',
  DEFAULT_MC_CODE:        process.env.DEFAULT_MC_CODE        || '',
  // ──────────────────────────────────────────────────────────────────────────

  // Folder names under MONTH that are valid — all others are ignored
  // MEN/WOMEN/KID are typo variants, also accepted
  VALID_DIVISIONS: ['MENS', 'WOMENS', 'LADIES', 'KIDS', 'MEN', 'WOMEN', 'KID'],

  // Image file extensions to process
  IMAGE_EXTENSIONS: ['.jpg', '.jpeg', '.png', '.webp'],

  // Your backend API base URL
  API_BASE_URL: process.env.API_BASE_URL || 'http://localhost:5000',

  // API key for watcher endpoint (must match WATCHER_API_KEY in backend .env)
  WATCHER_API_KEY: process.env.WATCHER_API_KEY || '',

  // Schema to send with every extraction request (JSON string)
  // Keep this in sync with what your approver dashboard expects
  EXTRACTION_SCHEMA: process.env.EXTRACTION_SCHEMA || '[]',

  // How many images to submit in parallel (tune based on backend capacity)
  CONCURRENCY: parseInt(process.env.CONCURRENCY || '5', 10),

  // File that tracks which image paths have already been processed
  PROCESSED_LOG: process.env.PROCESSED_LOG || './processed.json',

  // Cron schedule: 12:00pm, 8:00pm daily
  // Format: second minute hour day month weekday
  CRON_SCHEDULES: [
    '0 0 12 * * *',   // 12:00 PM
    '0 0 20 * * *',   // 8:00 PM
  ],
};
