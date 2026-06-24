import { pgTable, uuid, varchar, text, timestamp, jsonb, inet, boolean, index } from 'drizzle-orm/pg-core';

export const teams = pgTable('teams', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 64 }).notNull().unique(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  username: varchar('username', { length: 64 }).unique().notNull(),
  email: varchar('email', { length: 256 }),
  passwordHash: text('password_hash').notNull(),
  role: varchar('role', { length: 32 }).notNull().default('viewer'),
  team: varchar('team', { length: 64 }).notNull().default(''),
  teamId: uuid('team_id').references(() => teams.id, { onDelete: 'set null' }),
  apiKey: varchar('api_key', { length: 128 }).unique(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  lastLoginAt: timestamp('last_login_at'),
});

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  timestamp: timestamp('timestamp').defaultNow().notNull(),
  userId: varchar('user_id', { length: 64 }).notNull(),
  action: varchar('action', { length: 128 }).notNull(),
  resourceType: varchar('resource_type', { length: 64 }),
  resourceId: varchar('resource_id', { length: 128 }),
  provider: varchar('provider', { length: 32 }),
  region: varchar('region', { length: 64 }),
  params: jsonb('params'),
  result: varchar('result', { length: 16 }).notNull(),
  ip: inet('ip'),
  traceId: varchar('trace_id', { length: 64 }),
}, (table) => ({
  timestampIdx: index('idx_audit_timestamp').on(table.timestamp),
  userIdx: index('idx_audit_user').on(table.userId),
  actionIdx: index('idx_audit_action').on(table.action),
}));