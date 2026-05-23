import { Request, Response, NextFunction } from 'express';

/**
 * SRM Webhook API Key Authentication
 * Used by the external SRM web app to call the extraction webhook.
 * Set SRM_HOOK_API_KEY in your .env / Azure App Settings.
 */
export const authenticateSrmHook = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const key = req.headers['x-srm-api-key'];
  const expected = process.env.SRM_HOOK_API_KEY;

  if (!expected) {
    console.error('[SRM Hook] SRM_HOOK_API_KEY is not set in environment variables');
    res.status(503).json({ success: false, error: 'SRM webhook not configured on server' });
    return;
  }

  if (!key || key !== expected) {
    res.status(401).json({ success: false, error: 'Invalid or missing x-srm-api-key header', code: 'INVALID_SRM_HOOK_KEY' });
    return;
  }

  next();
};
