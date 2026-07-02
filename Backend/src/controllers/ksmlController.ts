/**
 * ksmlController.ts
 *
 * HTTP layer for the KSML class-characteristic uploader (Admin only).
 *
 *   POST /api/ksml/preview  (multipart: file)         → parse + auto-detect, NO SAP call
 *   POST /api/ksml/commit   (multipart: file, env, test?) → live SAP push
 *
 * Preview is always safe (never touches SAP). Commit requires an explicit env.
 */

import { Request, Response } from 'express';
import { parseKsmlExcel, runKsmlAssignment } from '../services/ksmlAssignService';

export class KsmlController {
  /** Parse the uploaded Excel and return a summary. Never calls SAP. */
  static async preview(req: Request, res: Response) {
    try {
      if (!req.file?.buffer) {
        return res.status(400).json({ success: false, error: 'No Excel file uploaded (field name must be "file").' });
      }
      const result = await parseKsmlExcel(req.file.buffer);
      return res.json({ success: true, ...result });
    } catch (err: any) {
      return res.status(400).json({ success: false, error: err?.message || 'Failed to parse Excel' });
    }
  }

  /** Live SAP push. Parses the file again (stateless) then runs the grouped assignment. */
  static async commit(req: Request, res: Response) {
    try {
      if (!req.file?.buffer) {
        return res.status(400).json({ success: false, error: 'No Excel file uploaded (field name must be "file").' });
      }

      const env = String(req.body?.env || '').trim().toLowerCase();
      if (env !== 'qa' && env !== 'prod') {
        return res.status(400).json({ success: false, error: 'env must be explicitly "qa" or "prod".' });
      }

      // test mode ('X') = SAP validates without committing. Default false (live write).
      const test = String(req.body?.test ?? 'false').toLowerCase() === 'true';
      const classConc = Number(req.body?.classConc) || 8;

      const parsed = await parseKsmlExcel(req.file.buffer);
      if (parsed.pairs.length === 0) {
        return res.status(400).json({ success: false, error: 'No valid (class, characteristic) pairs to push.' });
      }

      console.log(`[KSML] commit env=${env} test=${test} classes=${parsed.classes} pairs=${parsed.pairs.length}`);
      const report = await runKsmlAssignment(parsed.pairs, env, { test, classConc });
      console.log(`[KSML] done env=${env} added=${report.added} already=${report.already} failed=${report.failed} (${report.durationMs}ms)`);

      return res.json({ success: true, ...report });
    } catch (err: any) {
      console.error('[KSML] commit error:', err?.message);
      return res.status(500).json({ success: false, error: err?.message || 'KSML assignment failed' });
    }
  }
}
