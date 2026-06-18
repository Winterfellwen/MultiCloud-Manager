import type { Request, Response, NextFunction } from 'express';

export function loggerMiddleware(req: Request, res: Response, next: NextFunction) {
  const startTime = Date.now();
  const requestId = req.headers['x-request-id'] as string || crypto.randomUUID();
  
  (req as any).requestId = requestId;
  (req as any).startTime = startTime;
  
  res.setHeader('X-Request-ID', requestId);

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    console.log({
      requestId,
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration,
      ip: req.ip,
    });
  });

  next();
}