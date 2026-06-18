import type { Request, Response, NextFunction } from 'express';

interface RateLimitStore {
  [key: string]: { count: number; resetTime: number };
}

const store: RateLimitStore = {};

export function createRateLimiter(options: { max: number; windowMs: number }) {
  const { max, windowMs } = options;

  setInterval(() => {
    const now = Date.now();
    Object.keys(store).forEach(key => {
      if (store[key].resetTime < now) {
        delete store[key];
      }
    });
  }, windowMs);

  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip || 'unknown';
    const now = Date.now();

    if (!store[key] || store[key].resetTime < now) {
      store[key] = { count: 0, resetTime: now + windowMs };
    }

    store[key].count++;

    res.setHeader('X-RateLimit-Limit', max.toString());
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - store[key].count).toString());
    res.setHeader('X-RateLimit-Reset', Math.ceil(store[key].resetTime / 1000).toString());

    if (store[key].count > max) {
      return res.status(429).json({
        error: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests',
      });
    }

    next();
  };
}

export const rateLimiter = createRateLimiter({ max: 100, windowMs: 60000 });