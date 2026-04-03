require('dotenv').config();

module.exports = {
  // Root UNC path to watch
  WATCH_ROOT: process.env.WATCH_ROOT || '\\\\File\\0-v2\\04-DEPARTMENT\\02-PO COMMITEE\\13-PRESENTATION\\02-P-PHOTOS',

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

  // File that tracks which image paths have already been processed
  PROCESSED_LOG: process.env.PROCESSED_LOG || './processed.json',

  // Cron schedule: 12:00pm, 3:00pm, 6:00pm (IST = UTC+5:30, so times are correct for local machine)
  // Format: second minute hour day month weekday
  CRON_SCHEDULES: [
    '0 0 12 * * *',   // 12:00 PM
    '0 0 20 * * *',   // 8:00 PM
  ],
};
