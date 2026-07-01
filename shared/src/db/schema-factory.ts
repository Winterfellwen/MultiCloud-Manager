// shared/src/db/schema-factory.ts
//
// Schema 工厂：用 pgSchema('public') 和 pgSchema('demo') 创建两组结构完全相同的表定义。
// 表结构镜像现有 cloud-service/src/db/schema.ts 与 monitor-service/src/db/schema.ts，
// 供 scopedDb(scope) 根据 RequestScope.schema 选择对应 schema 的表对象集合。
//
// 说明：
// - 索引/外键等 DDL 由 migrations/*.sql 管理，此处只定义查询所需的表对象（不含索引回调）。
// - knowledge_base.embedding 使用 drizzle-orm 的 vector 类型（pgvector），与 migration 000 一致。
// - instances / cloud_resources 的 cloud_account_id 作为普通 uuid 列保留（与 monitor-service 一致，
//   不建外键，因为 demo schema 没有 cloud_accounts 表）。
import {
  pgSchema,
  type PgSchema,
  uuid,
  varchar,
  text,
  timestamp,
  jsonb,
  boolean,
  integer,
  decimal,
  serial,
  vector,
} from 'drizzle-orm/pg-core';

const publicSchema = pgSchema('public');
const demoSchema = pgSchema('demo');

/**
 * 在指定 schema 下构建一整套业务表定义。
 * public 与 demo 结构完全相同，便于 scopedDb 按 scope 切换。
 */
function buildTables(schema: PgSchema<string>) {
  // ========== cloud-service 业务表 ==========
  const instances = schema.table('instances', {
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

  const metrics = schema.table('metrics', {
    id: uuid('id').primaryKey().defaultRandom(),
    instanceId: uuid('instance_id').references(() => instances.id, { onDelete: 'cascade' }),
    metricName: varchar('metric_name', { length: 64 }).notNull(),
    value: decimal('value', { precision: 12, scale: 4 }).notNull(),
    unit: varchar('unit', { length: 16 }),
    recordedAt: timestamp('recorded_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  });

  const costRecords = schema.table('cost_records', {
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

  const alertRules = schema.table('alert_rules', {
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

  const alerts = schema.table('alerts', {
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

  const cloudResources = schema.table('cloud_resources', {
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
    cloudAccountId: uuid('cloud_account_id'),
  });

  // ========== monitor-service 业务表 ==========
  const tokenUsage = schema.table('token_usage', {
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

  const metricPredictions = schema.table('metric_predictions', {
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

  const remediationPolicies = schema.table('remediation_policies', {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 128 }).notNull(),
    actionType: varchar('action_type', { length: 64 }).notNull(),
    envTags: jsonb('env_tags').notNull(),
    autoExecute: jsonb('auto_execute').notNull(),
    enabled: boolean('enabled').default(true),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  });

  const remediationRuns = schema.table('remediation_runs', {
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

  const knowledgeBase = schema.table('knowledge_base', {
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
    embedding: vector('embedding', { dimensions: 1536 }),
    helpfulCount: integer('helpful_count').default(0),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  });

  return {
    instances,
    metrics,
    costRecords,
    alertRules,
    alerts,
    cloudResources,
    tokenUsage,
    metricPredictions,
    remediationPolicies,
    remediationRuns,
    knowledgeBase,
  };
}

/** public schema 的表对象集合（真实数据） */
export const publicTables = buildTables(publicSchema);

/** demo schema 的表对象集合（演示数据） */
export const demoTables = buildTables(demoSchema);

/** scopedDb 返回的表对象集合类型 */
export type ScopedTables = ReturnType<typeof buildTables>;
