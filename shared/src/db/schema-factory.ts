// shared/src/db/schema-factory.ts
//
// Schema 工厂：public 用 pgTable()，demo 用 pgSchema('demo').table()
// 两组表结构完全相同，供 scopedDb(scope) 按 RequestScope.schema 选择。
//
// 说明：
// - Drizzle 不允许 pgSchema('public')，public 必须用 pgTable()
// - 索引/外键等 DDL 由 migrations/*.sql 管理，此处只定义查询所需的表对象
// - knowledge_base.embedding 使用 drizzle-orm 的 vector 类型（pgvector）
import {
  pgSchema,
  pgTable,
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

const demoSchema = pgSchema('demo');

/**
 * 表列定义类型（public 和 demo 共用）
 */
type TableColumns = Record<string, any>;

/**
 * 在指定 table 创建器下构建一整套业务表定义。
 * createTable: pgTable 或 demoSchema.table
 */
function buildTables(createTable: (name: string, columns: TableColumns) => any) {
  // ========== cloud-service 业务表 ==========
  const instances = createTable('instances', {
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

  const metrics = createTable('metrics', {
    id: uuid('id').primaryKey().defaultRandom(),
    instanceId: uuid('instance_id'),
    metricName: varchar('metric_name', { length: 64 }).notNull(),
    value: decimal('value', { precision: 12, scale: 4 }).notNull(),
    unit: varchar('unit', { length: 16 }),
    recordedAt: timestamp('recorded_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  });

  const costRecords = createTable('cost_records', {
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

  const alertRules = createTable('alert_rules', {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 128 }).notNull(),
    metric: varchar('metric', { length: 64 }).notNull(),
    condition: varchar('condition', { length: 32 }).notNull(),
    duration: varchar('duration', { length: 16 }),
    severity: varchar('severity', { length: 16 }).notNull(),
    actions: jsonb('actions'),
    enabled: boolean('enabled').default(true),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  });

  const alerts = createTable('alerts', {
    id: uuid('id').primaryKey().defaultRandom(),
    ruleId: uuid('rule_id'),
    instanceId: uuid('instance_id'),
    severity: varchar('severity', { length: 16 }).notNull(),
    message: text('message'),
    status: varchar('status', { length: 16 }).default('firing'),
    firedAt: timestamp('fired_at').defaultNow(),
    resolvedAt: timestamp('resolved_at'),
    aiAnalysis: text('ai_analysis'),
    aiAnalyzedAt: timestamp('ai_analyzed_at'),
  });

  const cloudResources = createTable('cloud_resources', {
    id: uuid('id').primaryKey().defaultRandom(),
    provider: varchar('provider', { length: 32 }).notNull(),
    resourceType: varchar('resource_type', { length: 64 }).notNull(),
    providerResourceId: varchar('provider_resource_id', { length: 128 }).notNull(),
    name: varchar('name', { length: 256 }),
    region: varchar('region', { length: 64 }),
    status: varchar('status', { length: 32 }),
    attributes: jsonb('attributes'),
    tags: jsonb('tags'),
    lastSyncedAt: timestamp('last_synced_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  });

  // ========== monitor-service 业务表 ==========
  const tokenUsage = createTable('token_usage', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: varchar('user_id', { length: 64 }),
    sessionKey: varchar('session_key', { length: 128 }),
    provider: varchar('provider', { length: 256 }),
    model: varchar('model', { length: 128 }),
    promptTokens: integer('prompt_tokens').default(0),
    completionTokens: integer('completion_tokens').default(0),
    totalTokens: integer('total_tokens').default(0),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  });

  const metricPredictions = createTable('metric_predictions', {
    id: serial('id').primaryKey(),
    instanceId: uuid('instance_id').notNull(),
    metricName: varchar('metric_name', { length: 64 }).notNull(),
    currentValue: decimal('current_value', { precision: 12, scale: 4 }).notNull(),
    predictedValue: decimal('predicted_value', { precision: 12, scale: 4 }).notNull(),
    threshold: decimal('threshold', { precision: 12, scale: 4 }).notNull(),
    hoursToThreshold: decimal('hours_to_threshold', { precision: 8, scale: 2 }).notNull(),
    slope: decimal('slope', { precision: 12, scale: 6 }).notNull(),
    confidence: decimal('confidence', { precision: 5, scale: 2 }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  });

  const remediationPolicies = createTable('remediation_policies', {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 128 }).notNull(),
    actionType: varchar('action_type', { length: 64 }).notNull(),
    envTags: jsonb('env_tags').notNull(),
    autoExecute: jsonb('auto_execute').notNull(),
    enabled: boolean('enabled').default(true),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  });

  const remediationRuns = createTable('remediation_runs', {
    id: uuid('id').primaryKey().defaultRandom(),
    alertId: uuid('alert_id'),
    instanceId: uuid('instance_id'),
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

  const knowledgeBase = createTable('knowledge_base', {
    id: uuid('id').primaryKey().defaultRandom(),
    alertId: uuid('alert_id'),
    remediationRunId: uuid('remediation_run_id'),
    symptom: text('symptom').notNull(),
    metricName: varchar('metric_name', { length: 64 }),
    instanceProvider: varchar('instance_provider', { length: 32 }),
    instanceEnv: varchar('instance_env', { length: 32 }),
    rootCause: text('root_cause'),
    actionTaken: varchar('action_taken', { length: 64 }),
    outcome: varchar('outcome', { length: 32 }),
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

/** public schema 的表对象集合（真实数据）— 用 pgTable */
export const publicTables = buildTables(pgTable);

/** demo schema 的表对象集合（演示数据）— 用 demoSchema.table */
export const demoTables = buildTables((name: string, columns: TableColumns) =>
  demoSchema.table(name, columns)
);

/** scopedDb 返回的表对象集合类型 */
export type ScopedTables = ReturnType<typeof buildTables>;
