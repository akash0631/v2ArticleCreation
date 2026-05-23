/**
 * SRM Webhook Controller
 *
 * Accepts a batch of up to 50 images from the SRM web app,
 * runs VLM extraction on each one sequentially, and stores results in the DB.
 *
 * Flow:
 *   POST /api/srm-hook/trigger  → returns 202 + job_id immediately
 *   (background) processSrmWebhookBatch() → insertRow + enrichSrmRowWithVlm per image
 *   GET  /api/srm-hook/status/:jobId → returns progress / final results
 */

import { Request, Response } from 'express';
import {
  processSrmWebhookBatch,
  SrmWebhookBatchRequest,
  SrmWebhookProgress,
} from '../services/srmSyncService';

// ─── In-Memory Job Store ────────────────────────────────────────────────────

const MAX_IMAGES_PER_REQUEST = 50;
const JOB_TTL_MS = 24 * 60 * 60 * 1000; // jobs expire after 24 hours

export type SrmHookJobStatus = 'QUEUED' | 'PROCESSING' | 'COMPLETE' | 'PARTIAL_COMPLETE' | 'FAILED';

export interface SrmHookJob {
  jobId: string;
  presentationNo: string;
  total: number;
  processed: number;
  enriched: number;
  failed: number;
  status: SrmHookJobStatus;
  startedAt: string;
  completedAt?: string;
  estimatedMinutesRemaining: number;
  results: SrmWebhookProgress[];
  /** Internal: epoch ms when job was created — used for TTL cleanup */
  _createdAt: number;
}

const jobStore = new Map<string, SrmHookJob>();

// ── Cleanup expired jobs once per hour ──────────────────────────────────────
setInterval(() => {
  const now = Date.now();
  let removed = 0;
  for (const [id, job] of jobStore.entries()) {
    if (now - job._createdAt > JOB_TTL_MS) {
      jobStore.delete(id);
      removed++;
    }
  }
  if (removed > 0) console.log(`[SRM Hook] Cleaned up ${removed} expired job(s)`);
}, 60 * 60 * 1000);

// ─── Helpers ────────────────────────────────────────────────────────────────

function generateJobId(): string {
  // crypto.randomUUID() is available in Node 14.17+ — no external dependency needed
  return crypto.randomUUID();
}

function calcEstimatedMinutes(remaining: number): number {
  // ~75 seconds per image + 2s gap ≈ 1.3 minutes each; round up generously
  return Math.max(1, Math.ceil(remaining * 1.3));
}

// ─── Controllers ────────────────────────────────────────────────────────────

/**
 * POST /api/srm-hook/trigger
 *
 * Body: SrmWebhookBatchRequest (presentation_no + images array)
 * Returns 202 immediately with a job_id.
 * VLM extraction runs in the background — poll /status/:jobId for progress.
 */
export const triggerBatch = async (req: Request, res: Response): Promise<void> => {
  const body = req.body as Partial<SrmWebhookBatchRequest>;

  // ── Validation ─────────────────────────────────────────────────────────
  if (!body.presentation_no?.trim()) {
    res.status(400).json({ success: false, error: 'presentation_no is required' });
    return;
  }
  if (!body.division?.trim()) {
    res.status(400).json({ success: false, error: 'division is required' });
    return;
  }
  if (!body.major_category?.trim()) {
    res.status(400).json({ success: false, error: 'major_category is required' });
    return;
  }
  if (!Array.isArray(body.images) || body.images.length === 0) {
    res.status(400).json({ success: false, error: 'images must be a non-empty array' });
    return;
  }
  if (body.images.length > MAX_IMAGES_PER_REQUEST) {
    res.status(400).json({
      success: false,
      error: `Maximum ${MAX_IMAGES_PER_REQUEST} images per request. Received ${body.images.length}.`,
    });
    return;
  }

  // Validate each image has at minimum a design_number
  for (let i = 0; i < body.images.length; i++) {
    if (!body.images[i]?.design_number?.trim()) {
      res.status(400).json({ success: false, error: `images[${i}].design_number is required` });
      return;
    }
  }

  // ── Create job ─────────────────────────────────────────────────────────
  const jobId = generateJobId();
  const total = body.images.length;

  const job: SrmHookJob = {
    jobId,
    presentationNo:            body.presentation_no.trim(),
    total,
    processed:                 0,
    enriched:                  0,
    failed:                    0,
    status:                    'QUEUED',
    startedAt:                 new Date().toISOString(),
    estimatedMinutesRemaining: calcEstimatedMinutes(total),
    results:                   [],
    _createdAt:                Date.now(),
  };
  jobStore.set(jobId, job);

  // ── Respond immediately (202 Accepted) ─────────────────────────────────
  res.status(202).json({
    success:           true,
    job_id:            jobId,
    presentation_no:   body.presentation_no.trim(),
    queued:            total,
    status:            'QUEUED',
    poll_url:          `/api/srm-hook/status/${jobId}`,
    estimated_minutes: calcEstimatedMinutes(total),
    message:           `Extraction queued for ${total} image(s). Poll poll_url for progress.`,
  });

  // ── Background processing ───────────────────────────────────────────────
  void (async () => {
    job.status = 'PROCESSING';

    try {
      await processSrmWebhookBatch(
        body as SrmWebhookBatchRequest,
        (progress: SrmWebhookProgress) => {
          job.processed++;
          if (progress.success) job.enriched++;
          else job.failed++;
          job.results.push(progress);
          job.estimatedMinutesRemaining = calcEstimatedMinutes(job.total - job.processed);
        },
      );
    } catch (err: any) {
      console.error(`[SRM Hook] Unhandled batch error for job ${jobId}:`, err.message);
    }

    // Determine final status
    if (job.enriched === job.total) {
      job.status = 'COMPLETE';
    } else if (job.enriched > 0) {
      job.status = 'PARTIAL_COMPLETE';
    } else {
      job.status = 'FAILED';
    }

    job.completedAt = new Date().toISOString();
    job.estimatedMinutesRemaining = 0;

    console.log(
      `[SRM Hook] Job ${jobId} finished — ` +
      `enriched: ${job.enriched}/${job.total} | failed: ${job.failed} | status: ${job.status}`,
    );
  })();
};

/**
 * GET /api/srm-hook/status/:jobId
 *
 * Returns the current state of a batch extraction job.
 * Jobs are kept in memory for 24 hours after creation.
 */
export const getJobStatus = async (req: Request, res: Response): Promise<void> => {
  const { jobId } = req.params;
  const job = jobStore.get(jobId);

  if (!job) {
    res.status(404).json({
      success: false,
      error:   'Job not found. It may have expired (jobs are kept for 24 hours) or the job_id is invalid.',
    });
    return;
  }

  const progressPercent = job.total > 0
    ? Math.round((job.processed / job.total) * 100)
    : 0;

  res.json({
    success:             true,
    job_id:              job.jobId,
    presentation_no:     job.presentationNo,
    status:              job.status,
    total:               job.total,
    processed:           job.processed,
    enriched:            job.enriched,
    failed:              job.failed,
    progress_percent:    progressPercent,
    started_at:          job.startedAt,
    completed_at:        job.completedAt ?? null,
    estimated_minutes_remaining: job.estimatedMinutesRemaining,
    results:             job.results,
  });
};
