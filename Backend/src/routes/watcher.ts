/**
 * Watcher Routes
 * Called by the external file-watcher service (not human users).
 * Requires X-Watcher-Key header instead of JWT.
 */

import { Router } from 'express';
import multer from 'multer';
import os from 'os';
import path from 'path';
import { EnhancedExtractionController } from '../controllers/enhancedExtractionController';
import { backfillWatcherSubDivisions } from '../controllers/adminController';
import { asyncHandler } from '../middleware/asyncHandler';

const router = Router();
const enhancedController = new EnhancedExtractionController();

// Use disk storage so that large batches (24k+) don't exhaust Node.js heap.
// Each file is written to the OS temp directory and cleaned up by the controller
// after the R2 upload completes.
const upload = multer({
  storage: multer.diskStorage({
    destination: os.tmpdir(),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || '.jpg';
      cb(null, `watcher-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
    },
  }),
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE || '15728640'), // 15MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Supported: JPEG, PNG, WebP'));
    }
  }
});

/**
 * POST /api/watcher/extract/upload
 *
 * Accepts multipart/form-data with:
 *   - image             (file)
 *   - schema            (JSON string)
 *   - categoryName      (string)
 *   - source            → always "WATCHER"
 *   - image_unc_path    → full UNC path for duplicate detection
 *   - watcher_division  → e.g. "MENS"
 *   - watcher_vendor_name
 *   - watcher_vendor_code
 *   - watcher_major_category
 *   - watcher_sub_division
 *   - watcher_mc_code
 */
router.post('/extract/upload',
  upload.single('image'),
  asyncHandler(enhancedController.extractFromUploadVLM)
);

// One-time backfill: fix subDivision for all watcher articles from their majorCategory
router.post('/backfill-subdivisions', asyncHandler(backfillWatcherSubDivisions));

/**
 * POST /api/watcher/sync-srm
 *
 * DISABLED — the scheduled SRM pull (watcher cron at 12pm/8pm) has been turned
 * off. New SRM presentations are ingested via the SRM webhook
 * (POST /api/srm-hook/trigger) + the raw-articles extraction cron instead.
 *
 * This endpoint is kept as a no-op (returns success with zero counts) so the
 * watcher service's existing calls don't error while its cron is being removed.
 * To re-enable, restore the syncFromSrm() call below.
 * Manual admin sync remains available via POST /api/admin/srm/sync.
 */
router.post('/sync-srm', async (_req, res) => {
  console.log('[Watcher] /sync-srm called but the scheduled SRM pull is DISABLED — no-op.');
  res.json({ success: true, disabled: true, inserted: 0, skipped: 0, errors: 0, total: 0, staged: 0, note: 'Scheduled SRM pull is disabled. Ingestion runs via SRM webhook + raw-extraction cron.' });
});

export default router;
