// LLM Provider 持久化存储（PostgreSQL）
// 支持运行时增删改查 provider 配置，不再只依赖环境变量
// 支持 compat 配置和 thinkingFormat 方言（参考 openclaw）

import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  config,
  type LLMProviderConfig,
  type LLMModelConfig,
  type ProviderCompat,
  type ThinkingFormat,
  type ThinkingLevelMap,
  isThinkingFormat,
} from '../config.js';
import {
  normalizeCompat,
  normalizeThinkingLevelMap,
} from '../agent/thinking-format.js';

/**
 * 初始化 provider 存储（表结构由 migrations/001_init.sql 和 002_provider_compat.sql 创建）
 * 此函数保留为空，仅为向后兼容；实际初始化在服务启动时由 runMigrations 完成。
 */
export async function initProviderStore(): Promise<void> {
  // no-op：表已通过 migration 创建
}

interface ProviderRow {
  id: string;
  name: string;
  base_url: string;
  api_key: string;
  is_default: boolean;
  // drizzle 返回的 jsonb 字段可能是 object（已解析）或 string
  compat: unknown;
  created_at: string;
  updated_at: string;
}

interface ModelRow {
  id: string;
  provider_id: string;
  name: string;
  context_window: number | null;
  reasoning: boolean;
  input_types: unknown;
  thinking_format: string | null;
  thinking_level_map: unknown;
  supported_reasoning_efforts: unknown;
}

function parseCompat(raw: unknown): ProviderCompat | undefined {
  if (raw == null) return undefined;
  // drizzle 返回的 jsonb 字段可能是 object（已解析）或 string（需 JSON.parse）
  const value = typeof raw === 'string' ? safeJsonParse(raw) : raw;
  return normalizeCompat(value);
}

function parseThinkingLevelMap(raw: unknown): ThinkingLevelMap | undefined {
  if (raw == null) return undefined;
  const value = typeof raw === 'string' ? safeJsonParse(raw) : raw;
  return normalizeThinkingLevelMap(value);
}

function parseStringArray(raw: unknown): string[] | undefined {
  if (raw == null) return undefined;
  const value = typeof raw === 'string' ? safeJsonParse(raw) : raw;
  return Array.isArray(value) ? value.filter((x) => typeof x === 'string') : undefined;
}

function safeJsonParse(s: string): unknown {
  try { return JSON.parse(s); } catch { return undefined; }
}

function rowToProvider(row: ProviderRow, models: ModelRow[]): LLMProviderConfig & { isDefault?: boolean } {
  return {
    id: row.id,
    name: row.name,
    baseUrl: row.base_url,
    apiKey: row.api_key,
    isDefault: row.is_default,
    compat: parseCompat(row.compat),
    models: models.map(m => ({
      id: m.id,
      name: m.name,
      contextWindow: m.context_window ?? undefined,
      reasoning: m.reasoning,
      input: parseStringArray(m.input_types),
      thinkingFormat: (m.thinking_format && isThinkingFormat(m.thinking_format)) ? m.thinking_format as ThinkingFormat : undefined,
      thinkingLevelMap: parseThinkingLevelMap(m.thinking_level_map),
      supportedReasoningEfforts: parseStringArray(m.supported_reasoning_efforts),
    })),
  };
}

/** 列出所有 provider */
export async function listProvidersFromStore(): Promise<(LLMProviderConfig & { isDefault?: boolean })[]> {
  const providers = await db.execute(sql`
    SELECT id, name, base_url, api_key, is_default, compat, created_at, updated_at
    FROM llm_providers
    ORDER BY created_at
  `) as unknown as ProviderRow[];

  if (providers.length === 0) return [];

  const models = await db.execute(sql`
    SELECT id, provider_id, name, context_window, reasoning, input_types,
           thinking_format, thinking_level_map, supported_reasoning_efforts
    FROM llm_models
  `) as unknown as ModelRow[];

  return providers.map(p => rowToProvider(p, models.filter(m => m.provider_id === p.id)));
}

/** 获取单个 provider */
export async function getProviderFromStore(id: string): Promise<(LLMProviderConfig & { isDefault?: boolean }) | null> {
  const rows = await db.execute(sql`
    SELECT id, name, base_url, api_key, is_default, compat, created_at, updated_at
    FROM llm_providers
    WHERE id = ${id}
  `) as unknown as ProviderRow[];
  if (rows.length === 0) return null;
  const row = rows[0];

  const models = await db.execute(sql`
    SELECT id, provider_id, name, context_window, reasoning, input_types,
           thinking_format, thinking_level_map, supported_reasoning_efforts
    FROM llm_models
    WHERE provider_id = ${id}
  `) as unknown as ModelRow[];

  return rowToProvider(row, models);
}

/** 创建 provider */
export async function createProviderInStore(input: {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  compat?: ProviderCompat;
  models?: LLMModelConfig[];
}): Promise<LLMProviderConfig & { isDefault?: boolean }> {
  const now = Date.now();
  const compatJson = input.compat ? JSON.stringify(input.compat) : null;
  await db.execute(sql`
    INSERT INTO llm_providers (id, name, base_url, api_key, is_default, compat, created_at, updated_at)
    VALUES (${input.id}, ${input.name}, ${input.baseUrl}, ${input.apiKey}, FALSE, ${compatJson}::jsonb, ${now}, ${now})
  `);

  if (input.models && input.models.length > 0) {
    for (const m of input.models) {
      await insertModel(input.id, m);
    }
  }

  const result = await getProviderFromStore(input.id);
  return result!;
}

/** 插入单个 model（含 thinking 配置） */
async function insertModel(providerId: string, m: LLMModelConfig): Promise<void> {
  const thinkingFormat = m.thinkingFormat ?? null;
  const thinkingLevelMap = m.thinkingLevelMap ? JSON.stringify(m.thinkingLevelMap) : null;
  const supportedEfforts = m.supportedReasoningEfforts ? JSON.stringify(m.supportedReasoningEfforts) : null;
  await db.execute(sql`
    INSERT INTO llm_models (id, provider_id, name, context_window, reasoning, input_types,
                            thinking_format, thinking_level_map, supported_reasoning_efforts)
    VALUES (${m.id}, ${providerId}, ${m.name}, ${m.contextWindow ?? null}, ${m.reasoning ?? false},
            ${m.input ? JSON.stringify(m.input) : null},
            ${thinkingFormat}, ${thinkingLevelMap}::jsonb, ${supportedEfforts}::jsonb)
  `);
}

/** 更新 provider */
export async function updateProviderInStore(id: string, input: {
  name?: string;
  baseUrl?: string;
  apiKey?: string;
  compat?: ProviderCompat;
  models?: LLMModelConfig[];
}): Promise<(LLMProviderConfig & { isDefault?: boolean }) | null> {
  const now = Date.now();
  const sets: ReturnType<typeof sql>[] = [sql`updated_at = ${now}`];
  if (input.name !== undefined) sets.push(sql`name = ${input.name}`);
  if (input.baseUrl !== undefined) sets.push(sql`base_url = ${input.baseUrl}`);
  if (input.apiKey !== undefined) sets.push(sql`api_key = ${input.apiKey}`);
  if (input.compat !== undefined) {
    const compatJson = Object.keys(input.compat).length > 0 ? JSON.stringify(input.compat) : null;
    sets.push(sql`compat = ${compatJson}::jsonb`);
  }

  await db.execute(sql`
    UPDATE llm_providers
    SET ${sql.join(sets, sql`, `)}
    WHERE id = ${id}
  `);

  if (input.models !== undefined) {
    await db.execute(sql`DELETE FROM llm_models WHERE provider_id = ${id}`);
    for (const m of input.models) {
      await insertModel(id, m);
    }
  }
  return getProviderFromStore(id);
}

/** 删除 provider */
export async function deleteProviderFromStore(id: string): Promise<boolean> {
  const result = await db.execute(sql`DELETE FROM llm_providers WHERE id = ${id}`);
  return Number((result as unknown as { count?: number }).count ?? 0) > 0;
}

/** 从环境变量导入初始 provider（首次启动时） */
export async function seedFromEnv(): Promise<void> {
  const countRows = await db.execute(sql`SELECT COUNT(*)::int AS c FROM llm_providers`) as unknown as Array<{ c: number }>;
  if (countRows[0].c > 0) return; // 已有数据，不覆盖

  // 导入默认 provider（从 config.llm）
  if (config.llm.baseUrl && config.llm.apiKey) {
    const now = Date.now();
    const modelName = config.llm.model;
    const isReasoning = /reasoning|think|nemotron/i.test(modelName);
    const supportsImage = /vision|omni|vl/i.test(modelName);
    await db.execute(sql`
      INSERT INTO llm_providers (id, name, base_url, api_key, is_default, compat, created_at, updated_at)
      VALUES ('default', '默认 Provider', ${config.llm.baseUrl}, ${config.llm.apiKey}, TRUE, NULL, ${now}, ${now})
      ON CONFLICT (id) DO NOTHING
    `);
    await db.execute(sql`
      INSERT INTO llm_models (id, provider_id, name, context_window, reasoning, input_types,
                              thinking_format, thinking_level_map, supported_reasoning_efforts)
      VALUES (${modelName}, 'default', ${modelName}, NULL, ${isReasoning},
              ${JSON.stringify(supportsImage ? ['text', 'image'] : ['text'])},
              NULL, NULL, NULL)
      ON CONFLICT (id, provider_id) DO NOTHING
    `);
  }

  // 导入环境变量配置的多 provider
  for (const p of config.llmProviders) {
    const now = Date.now();
    const compatJson = p.compat ? JSON.stringify(p.compat) : null;
    await db.execute(sql`
      INSERT INTO llm_providers (id, name, base_url, api_key, is_default, compat, created_at, updated_at)
      VALUES (${p.id}, ${p.name}, ${p.baseUrl}, ${p.apiKey}, FALSE, ${compatJson}::jsonb, ${now}, ${now})
      ON CONFLICT (id) DO NOTHING
    `);
    for (const m of p.models) {
      await insertModel(p.id, m);
    }
  }
}
