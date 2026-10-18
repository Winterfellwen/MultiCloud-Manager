import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { config } from '../config.js';
import { pgPoolOptions } from '@cloudops/shared';
import * as schema from './schema.js';

const client = postgres(config.databaseUrl, pgPoolOptions(6));
export const db = drizzle(client, { schema });