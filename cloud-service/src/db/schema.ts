import { pgTable, uuid, varchar, text, timestamp, jsonb, inet, boolean, integer, decimal, uniqueIndex, index } from 'drizzle-orm/pg-core';

export const cloudAccounts = pgTable('cloud_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 128 }).notNull(),
  provider: varchar('provider', { length: 32 }).notNull(),
  config: jsonb('config').notNull(),
  status: varchar('status', { length: 16 }).default('active'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  providerIdx: index('idx_cloud_accounts_provider').on(table.provider),
  statusIdx: index('idx_cloud_accounts_status').on(table.status),
}));

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
  publicIp: inet('public_ip'),
  privateIp: inet('private_ip'),
  monthlyCost: decimal('monthly_cost', { precision: 10, scale: 2 }),
  tags: jsonb('tags'),
  lastSyncedAt: timestamp('last_synced_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  cloudAccountId: uuid('cloud_account_id').references(() => cloudAccounts.id),
}, (table) => ({
  providerInstanceIdx: uniqueIndex('idx_instances_provider_instance').on(table.provider, table.providerInstanceId),
  providerIdx: index('idx_instances_provider').on(table.provider),
  regionIdx: index('idx_instances_region').on(table.region),
  statusIdx: index('idx_instances_status').on(table.status),
  accountIdx: index('idx_instances_account').on(table.cloudAccountId),
}));

export const metrics = pgTable('metrics', {
  id: uuid('id').primaryKey().defaultRandom(),
  instanceId: uuid('instance_id').references(() => instances.id, { onDelete: 'cascade' }),
  metricName: varchar('metric_name', { length: 64 }).notNull(),
  value: decimal('value', { precision: 12, scale: 4 }).notNull(),
  unit: varchar('unit', { length: 16 }),
  recordedAt: timestamp('recorded_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  instanceTimeIdx: index('idx_metrics_instance_time').on(table.instanceId, table.recordedAt),
  nameIdx: index('idx_metrics_name').on(table.metricName),
}));

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
}, (table) => ({
  ruleIdx: index('idx_alerts_rule').on(table.ruleId),
  instanceIdx: index('idx_alerts_instance').on(table.instanceId),
  statusIdx: index('idx_alerts_status').on(table.status),
  firedIdx: index('idx_alerts_fired').on(table.firedAt),
}));

export const cloudResources = pgTable('cloud_resources', {
  id: uuid('id').primaryKey().defaultRandom(),
  provider: varchar('provider', { length: 32 }).notNull(),
  resourceType: varchar('resource_type', { length: 32 }).notNull(),
  providerResourceId: varchar('provider_resource_id', { length: 256 }).notNull(),
  name: varchar('name', { length: 256 }),
  region: varchar('region', { length: 64 }).notNull(),
  status: varchar('status', { length: 32 }).notNull(),
  attributes: jsonb('attributes').$type<Record<string, unknown>>().default({}),
  tags: jsonb('tags').$type<Record<string, string>>().default({}),
  lastSyncedAt: timestamp('last_synced_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  cloudAccountId: uuid('cloud_account_id').references(() => cloudAccounts.id, { onDelete: 'cascade' }),
}, (table) => ({
  providerResourceIdx: uniqueIndex('idx_cloud_resources_provider_resource').on(table.provider, table.resourceType, table.providerResourceId),
  providerIdx: index('idx_cloud_resources_provider').on(table.provider),
  typeIdx: index('idx_cloud_resources_type').on(table.resourceType),
  regionIdx: index('idx_cloud_resources_region').on(table.region),
  statusIdx: index('idx_cloud_resources_status').on(table.status),
  accountIdx: index('idx_cloud_resources_account').on(table.cloudAccountId),
}));

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
}, (table) => ({
  providerRegionIdx: index('idx_cost_provider_region').on(table.provider, table.region),
  periodIdx: index('idx_cost_period').on(table.periodStart, table.periodEnd),
}));