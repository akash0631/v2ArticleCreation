/**
 * poolBController.ts
 *
 * HTTP layer for the Pool B article-attribute-value uploader (Admin only).
 *
 *   POST /api/poolb/preview  (multipart: file)          → parse, NO SAP call
 *   POST /api/poolb/commit   (multipart: file, test?)   → live AUSP patch
 *
 * The SAP environment is the server's configured SAP_ENV (same as live article
 * creation). `test=true` uses SAP test mode (no permanent write).
 */

import { Request, Response } from 'express';
import { parsePoolBExcel, runPoolBPatch } from '../services/poolBPatchService';

export class PoolBController {
  static async preview(req: Request, res: Response) {
    try {
      if (!req.file?.buffer) {
        return res.status(400).json({ success: false, error: 'No Excel file uploaded (field name must be "file").' });
      }
      const result = await parsePoolBExcel(req.file.buffer);
      // Default the uploader to QA for safety; the user picks the env on commit.
      return res.json({ success: true, defaultEnv: 'qa', ...result });
    } catch (err: any) {
      return res.status(400).json({ success: false, error: err?.message || 'Failed to parse Excel' });
    }
  }

  static async commit(req: Request, res: Response) {
    try {
      if (!req.file?.buffer) {
        return res.status(400).json({ success: false, error: 'No Excel file uploaded (field name must be "file").' });
      }

      const env = String(req.body?.env || '').trim().toLowerCase();
      if (env !== 'qa' && env !== 'prod') {
        return res.status(400).json({ success: false, error: 'env must be explicitly "qa" or "prod".' });
      }
      const test = String(req.body?.test ?? 'false').toLowerCase() === 'true';

      const parsed = await parsePoolBExcel(req.file.buffer);
      if (parsed.rows.length === 0) {
        return res.status(400).json({ success: false, error: 'No article rows with values to push.' });
      }

      console.log(`[PoolB] commit env=${env} test=${test} matnrs=${parsed.rows.length} cells=${parsed.totalValueCells}`);
      const report = await runPoolBPatch(parsed.rows, { test, env });
      console.log(`[PoolB] done ok=${report.ok} failed=${report.failed} written=${report.totalWritten} nic=${report.totalNic} (${report.durationMs}ms)`);

      return res.json({ success: true, ...report });
    } catch (err: any) {
      console.error('[PoolB] commit error:', err?.message);
      return res.status(500).json({ success: false, error: err?.message || 'Pool B patch failed' });
    }
  }
}
