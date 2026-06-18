import { pgTable, uuid, varchar, text, timestamp, jsonb, boolean, integer, decimal, uniqueIndex, index } from 'drizzle-orm/pg-core';

// 复用 Phase 2 已有表（与 cloud-service/schema.ts 一致，供本服务查询）
export const instances = pgTable('instances', {
  id: uuid('id').primaryKey().defaultRandom(),
  provider: varchar('provider', { length: 32 }).notNull(),
  providerInstanceId: varchar('provider_instance_id', { length: 128 }).notNull(),
  name: varchar('name', { length: 256 }),
  region: varchar('region', { length: 64 }).notNull(),
  status: varchar('status', { length: 32 }).notNull(),
  cpu: integer('cpu'),
  memoryMb: integer('memory_mb'),
  diskGb: integer('disk_gb'),
  publicIp: varchar('public_ip'),
  privateIp: varchar('private_ip'),
  monthlyCost: decimal('monthly_cost', { precision: 10, scale: 2 }),
  tags: jsonb('tags'),
  lastSyncedAt: timestamp('last_synced_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  cloudAccountId: uuid('cloud_account_id'),
});

export const metrics = pgTable('metrics', {
  id: uuid('id').primaryKey().defaultRandom(),
  instanceId: uuid('instance_id').references(() => instances.id, { onDelete: 'cascade' }),
  metricName: varchar('metric_name', { length: 64 }).notNull(),
  value: decimal('value', { precision: 12, scale: 4 }).notNull(),
  unit: varchar('unit', { length: 16 }),
  recordedAt: timestamp('recorded_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const alertRules = pgTable('alert_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 128 }).notNull(),
  metric: varchar('metric', { length: 64 }).notNull(),
  condition: varchar('condition', { length: 32 }).notNull(),
  duration: varchar('duration', { length: 16 }).notNull(),
  severity: varchar('severity', { length: 16 }).notNull(),
  actions: jsonb('actions').notNull(),
  enabled: boolean('enabled').default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const alerts = pgTable('alerts', {
  id: uuid('id').primaryKey().defaultRandom(),
  ruleId: uuid('rule_id').references(() => alertRules.id),
  instanceId: uuid('instance_id').references(() => instances.id),
  severity: varchar('severity', { length: 16 }).notNull(),
  message: text('message').notNull(),
  status: varchar('status', { length: 16 }).default('firing'),
  firedAt: timestamp('fired_at').defaultNow().notNull(),
  resolvedAt: timestamp('resolved_at'),
});

export const costRecords = pgTable('cost_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  provider: varchar('provider', { length: 32 }).notNull(),
  region: varchar('region', { length: 64 }).notNull(),
  service: varchar('service', { length: 64 }).notNull(),
  resourceId: varchar('resource_id', { length: 128 }),
  amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
  currency: varchar('currency', { length: 8 }).default('USD'),
  periodStart: timestamp('period_start').notNull(),
  periodEnd: timestamp('period_end').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Phase 3 新增：通知渠道配置表
export const notificationChannels = pgTable('notification_channels', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 128 }).notNull(),
  type: varchar('type', { length: 32 }).notNull(), // webhook | email | slack
  config: jsonb('config').notNull(),               // {url, secret?} | {recipients[]} | {webhookUrl}
  enabled: boolean('enabled').default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
