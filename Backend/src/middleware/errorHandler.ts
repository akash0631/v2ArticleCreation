import { Request, Response, NextFunction } from 'express';
export { asyncHandler, requestTimeout } from './asyncHandler';

export interface ApiError extends Error {
  statusCode?: number;
  code?: string;
}

export const errorHandler = (
  err: ApiError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Response already committed (e.g. timeout fired while async handler was still running).
  // We cannot send another response — just log and bail.
  if (res.headersSent) {
    console.error('Error occurred after response already sent:', {
      message: err.message,
      url: req.url,
      method: req.method,
      timestamp: new Date().toISOString()
    });
    return;
  }

  console.error('Error occurred:', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    timestamp: new Date().toISOString()
  });

  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  res.status(statusCode).json({
    success: false,
    error: message,
    timestamp: Date.now(),
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

export const notFound = (req: Request, res: Response, next: NextFunction) => {
  const error = new Error(`Not Found - ${req.originalUrl}`) as ApiError;
  error.statusCode = 404;
  next(error);
};

export const validateRequest = (req: Request, res: Response, next: NextFunction) => {
  if (req.method === 'POST' && !req.file && !req.body.image) {
    const error = new Error('No image provided') as ApiError;
    error.statusCode = 400;
    return next(error);
  }
  next();
};