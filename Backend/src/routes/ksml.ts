/**
 * KSML class-characteristic uploader routes (Admin only).
 *
 *   POST /api/ksml/preview  — parse + auto-detect columns (no SAP call)
 *   POST /api/ksml/commit   — live SAP push (grouped, race-safe)
 *
 * Mounted in index.ts behind `authenticate, requireAdmin`.
 */

import { Router } from 'express';
import multer from 'multer';
import { asyncHandler } from '../middleware/asyncHandler';
import { KsmlController } from '../controllers/ksmlController';

const excelUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (
      file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      file.mimetype === 'application/vnd.ms-excel' ||
      file.originalname.endsWith('.xlsx') ||
      file.originalname.endsWith('.xls')
    ) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel files (.xlsx / .xls) are allowed'));
    }
  },
});

const router = Router();

router.post('/preview', excelUpload.single('file'), asyncHandler(KsmlController.preview));
router.post('/commit', excelUpload.single('file'), asyncHandler(KsmlController.commit));

export default router;
