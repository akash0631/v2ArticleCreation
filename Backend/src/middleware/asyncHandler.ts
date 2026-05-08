import { Request, Response, NextFunction } from 'express';

type AsyncRouteHandler = (req: Request, res: Response, next: NextFunction) => Promise<any>;

/**
 * Wraps an async route handler so any unhandled error is forwarded to next(err)
 * instead of becoming an unhandled promise rejection that hangs the request.
 */
export const asyncHandler = (fn: AsyncRouteHandler) =>
  (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

/**
 * Request timeout middleware.
 * If a response hasn't been sent within `ms` milliseconds, returns 503.
 * Prevents slow/hanging DB queries from leaking memory indefinitely.
 */
export const requestTimeout = (ms: number) =>
  (req: Request, res: Response, next: NextFunction): void => {
    const timer = setTimeout(() => {
      if (!res.headersSent) {
        console.error(`[Timeout] ${req.method} ${req.path} exceeded ${ms}ms`);
        res.status(503).json({
          success: false,
          error: 'Request timed out — the operation took too long. Try a smaller date range or fewer items.',
          code: 'REQUEST_TIMEOUT',
        });
      }
    }, ms);

    res.on('finish', () => clearTimeout(timer));
    res.on('close', () => clearTimeout(timer));
    next();
  };
