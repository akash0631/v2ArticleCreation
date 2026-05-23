/**
 * SRM Webhook Routes
 *
 * Secured by x-srm-api-key header (set SRM_HOOK_API_KEY in .env).
 * No JWT required — designed for server-to-server calls from SRM web app.
 *
 * POST /api/srm-hook/trigger          → queue a batch extraction job
 * GET  /api/srm-hook/status/:jobId    → poll job progress / results
 */

import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { authenticateSrmHook } from '../middleware/srmHookAuth';
import { triggerBatch, getJobStatus } from '../controllers/srmHookController';

const router = Router();

// All SRM hook routes require the shared API key — no JWT
router.use(authenticateSrmHook);

router.post('/trigger',          asyncHandler(triggerBatch));
router.get('/status/:jobId',     asyncHandler(getJobStatus));

export default router;
