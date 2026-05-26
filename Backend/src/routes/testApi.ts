/**
 * Test API Routes
 *
 * Staging/test endpoints for the raw_articles pipeline.
 * Secured with admin auth (JWT + admin role).
 */

import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { fetchPresentationToRaw, getRawArticles } from '../controllers/testApiController';

const router = Router();

/**
 * POST /api/test-api/fetch-presentation
 * Body: { "ppt_no": "PRES-00831" }
 * Fetches presentation from SRM API, saves all images to raw_articles as PENDING.
 */
router.post('/fetch-presentation', asyncHandler(fetchPresentationToRaw));

/**
 * GET /api/test-api/raw-articles?ppt_no=PRES-00831
 * Lists raw_articles rows (optionally filtered by ppt_no).
 */
router.get('/raw-articles', asyncHandler(getRawArticles));

export default router;
