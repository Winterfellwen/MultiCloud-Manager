import { pgTable, uuid, varchar, text, timestamp, jsonb, boolean, integer, decimal, serial, uniqueIndex, index } from 'drizzle-orm/pg-core';

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
  aiAnalysis: text('ai_analysis'),
  aiAnalyzedAt: timestamp('ai_analyzed_at'),
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

// Phase 4 新增：Token 使用统计表（由 ai-gateway 写入，monitor-service 共享查询）
export const tokenUsage = pgTable('token_usage', {
  id: integer('id').primaryKey(),
  userId: varchar('user_id', { length: 64 }).notNull(),
  sessionKey: varchar('session_key', { length: 128 }),
  provider: varchar('provider', { length: 256 }),
  model: varchar('model', { length: 128 }),
  promptTokens: integer('prompt_tokens').notNull(),
  completionTokens: integer('completion_tokens').notNull(),
  totalTokens: integer('total_tokens').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Phase 4 新增：预测表（线性回归预测引擎写入）
export const metricPredictions = pgTable('metric_predictions', {
  id: serial('id').primaryKey(),
  instanceId: uuid('instance_id').references(() => instances.id, { onDelete: 'cascade' }).notNull(),
  metricName: varchar('metric_name', { length: 64 }).notNull(),
  currentValue: decimal('current_value', { precision: 12, scale: 4 }).notNull(),
  predictedValue: decimal('predicted_value', { precision: 12, scale: 4 }).notNull(),
  threshold: decimal('threshold', { precision: 12, scale: 4 }).notNull(),
  hoursToThreshold: decimal('hours_to_threshold', { precision: 8, scale: 2 }).notNull(),
  slope: decimal('slope', { precision: 12, scale: 6 }).notNull(),
  confidence: decimal('confidence', { precision: 5, scale: 2 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Phase 5 新增：自愈策略表
export const remediationPolicies = pgTable('remediation_policies', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 128 }).notNull(),
  actionType: varchar('action_type', { length: 64 }).notNull().unique(),
  resourceType: varchar('resource_type', { length: 64 }),
  envTags: jsonb('env_tags').notNull(),
  autoExecute: jsonb('auto_execute').notNull(),
  enabled: boolean('enabled').default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Phase 5 新增：自愈执行记录表
export const remediationRuns = pgTable('remediation_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  alertId: uuid('alert_id').references(() => alerts.id, { onDelete: 'cascade' }),
  instanceId: uuid('instance_id').references(() => instances.id, { onDelete: 'cascade' }),
  rootCause: text('root_cause'),
  actionPlan: jsonb('action_plan'),
  actionExecuted: varchar('action_executed', { length: 64 }),
  status: varchar('status', { length: 32 }).default('pending'),
  env: varchar('env', { length: 32 }),
  triggeredAt: timestamp('triggered_at').defaultNow().notNull(),
  approvedAt: timestamp('approved_at'),
  approvedBy: uuid('approved_by'),
  executedAt: timestamp('executed_at'),
  verifiedAt: timestamp('verified_at'),
  verificationResult: text('verification_result'),
  errorMessage: text('error_message'),
});

// Phase 6 新增：运维知识库表（pgvector 向量检索）
// pgvector 类型支持（如果扩展不存在，查询会降级为纯关键词检索）
export const knowledgeBase = pgTable('knowledge_base', {
  id: uuid('id').primaryKey().defaultRandom(),
  alertId: uuid('alert_id').references(() => alerts.id, { onDelete: 'set null' }),
  remediationRunId: uuid('remediation_run_id').references(() => remediationRuns.id, { onDelete: 'set null' }),
  symptom: text('symptom').notNull(),
  metricName: varchar('metric_name', { length: 64 }).notNull(),
  instanceProvider: varchar('instance_provider', { length: 32 }),
  instanceEnv: varchar('instance_env', { length: 32 }),
  rootCause: text('root_cause'),
  actionTaken: varchar('action_taken', { length: 64 }),
  outcome: varchar('outcome', { length: 32 }).notNull(),
  resolutionTimeMinutes: integer('resolution_time_minutes'),
  // embedding 列通过原生 SQL 管理（drizzle 不原生支持 vector 类型）
  helpfulCount: integer('helpful_count').default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
