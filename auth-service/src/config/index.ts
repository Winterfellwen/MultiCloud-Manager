import { z } from 'zod';

const configSchema = z.object({
  port: z.coerce.number().default(3001),
  databaseUrl: z.string().url().default('postgresql://postgres:postgres@localhost:5432/cloudops_auth'),
  redisUrl: z.string().url().optional(),
  jwtSecret: z.string().min(32).default('dev-secret-change-in-production-at-least-32-chars'),
  jwtExpiresIn: z.string().default('15m'),
  jwtRefreshExpiresIn: z.string().default('7d'),
  adminEmail: z.string().email().default('admin@cloudops.local'),
  adminPassword: z.string().min(8).default('Test.1234'),
  environment: z.enum(['development', 'production', 'test']).default('development'),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  corsOrigin: z.string().default('*'),
});

export type Config = z.infer<typeof configSchema>;

let config: Config | null = null;

export function loadConfig(): Config {
  if (config) return config;

  const result = configSchema.safeParse({
    port: process.env.PORT,
    databaseUrl: process.env.DATABASE_URL,
    redisUrl: process.env.REDIS_URL,
    jwtSecret: process.env.JWT_SECRET,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN,
    jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN,
    adminEmail: process.env.ADMIN_EMAIL,
    adminPassword: process.env.ADMIN_PASSWORD,
    environment: process.env.NODE_ENV,
    logLevel: process.env.LOG_LEVEL,
  });

  if (!result.success) {
    console.error('Config validation failed:', result.error.flatten().fieldErrors);
    process.exit(1);
  }

  config = result.data;

  if (config.environment === 'production') {
    if (config.jwtSecret === 'dev-secret-change-in-production-at-least-32-chars') {
      console.error('FATAL: JWT_SECRET must be set in production');
      process.exit(1);
    }
    if (config.adminPassword === 'Test.1234') {
      console.error('FATAL: ADMIN_PASSWORD must be set in production');
      process.exit(1);
    }
  }

  return config;
}

export function getConfig(): Config {
  if (!config) return loadConfig();
  return config;
}