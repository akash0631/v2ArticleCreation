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
// triggerBatch is intentionally NOT imported — the /trigger webhook is disabled (see below).
import { getJobStatus, retryJobFailed, retryPresentation } from '../controllers/srmHookController';

const router = Router();

// All SRM hook routes require the shared API key — no JWT
router.use(authenticateSrmHook);

// ── DISABLED for now ─────────────────────────────────────────────────────────
// The SRM webhook push (/trigger → processSrmWebhookBatch → insertRow) is turned
// off. New SRM articles are ingested via the external SRM writer → raw_articles
// table → the raw-articles extraction cron (every 10 min). This route is kept as
// a no-op so callers get a clean response instead of a 404.
// To re-enable: re-import triggerBatch and restore the original handler below.
router.post('/trigger', (_req, res) => {
  console.log('[SRM Hook] /trigger called but the webhook is DISABLED — no-op.');
  res.status(200).json({ success: true, disabled: true, message: 'SRM webhook is disabled. Ingestion runs via raw_articles + extraction cron.' });
});

router.get('/status/:jobId',           asyncHandler(getJobStatus));
router.post('/retry/:jobId',           asyncHandler(retryJobFailed));
router.post('/retry-presentation',     asyncHandler(retryPresentation));

export default router;
