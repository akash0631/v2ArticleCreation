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
import { syncFromSrm } from '../services/srmSyncService';
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
 * Fetches all presentation records from the SRM API and inserts them
 * into extraction_results_flat without any AI extraction.
 * Idempotent — already-synced records (matched by pptNumber + designNumber) are skipped.
 *
 * Called by the watcher service on its cron schedule (12pm, 8pm),
 * or manually from the admin UI / CLI.
 */
router.post('/sync-srm', async (req, res, next) => {
  try {
    const result = await syncFromSrm();
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

export default router;
