import express from 'express';
import cors from 'cors';
import { config } from './config';
import { loggerMiddleware } from './middleware/logger';
import { rateLimiter } from './middleware/rate-limit';
import { healthRoutes } from './routes/health';
import { proxyRoutes } from './routes/proxy';
import { AppError } from '@cloudops/shared';

const app = express();

app.use(cors({ origin: config.corsOrigin }));
app.use(express.json());
app.use(loggerMiddleware);
app.use(rateLimiter);

app.use((err: Error, req: any, res: any, next: any) => {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: err.code,
      message: err.message,
      details: err.details,
    });
  }

  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'INTERNAL_ERROR',
    message: 'Internal server error',
  });
});

app.use(healthRoutes);
app.use(proxyRoutes);

app.listen(config.port, '0.0.0.0', () => {
  console.log(`API Gateway running on port ${config.port}`);
});