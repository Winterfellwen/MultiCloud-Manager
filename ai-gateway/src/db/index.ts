import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { config } from '../config.js';

// 复用项目统一的 PostgreSQL（与 auth-service / cloud-service / monitor-service / ai-agent 共享同一实例）
const client = postgres(config.databaseUrl, { max: 10 });
export const db = drizzle(client);
