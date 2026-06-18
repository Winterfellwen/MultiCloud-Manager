import express from 'express';
import cors from 'cors';
import { getConfig } from './config';
import { runMigrations } from './db/migrate';
import { authRoutes } from './routes/auth';
import { userRoutes } from './routes/users';
import { auditRoutes } from './routes/audit';
import { AppError } from '@cloudops/shared';
import { ZodError } from 'zod';

async function main() {
  const config = getConfig();

  await runMigrations();

  const app = express();

  app.use(cors({ origin: config.corsOrigin || '*' }));
  app.use(express.json());

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'auth-service', timestamp: new Date().toISOString() });
  });

  app.use('/auth', authRoutes);
  app.use('/users', userRoutes);
  app.use('/audit', auditRoutes);

  app.use((err: Error, req: any, res: any, next: any) => {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({
        error: err.code,
        message: err.message,
        details: err.details,
      });
    }

    if (err instanceof ZodError) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid input',
        details: err.flatten().fieldErrors,
      });
    }

    console.error('Unhandled error:', err);
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Internal server error',
    });
  });

  app.listen(config.port, '0.0.0.0', () => {
    console.log(`Auth service running on port ${config.port}`);
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});