-- LLM Provider compat 配置（参考 openclaw 设计）
-- 支持 thinkingFormat 方言、ThinkingLevel 映射、模型能力声明

-- ============ Provider 级 compat 配置 ============
-- compat JSONB 存储 provider 级别的兼容性配置：
--   thinkingFormat: openai|deepseek|qwen|qwen-chat-template|zai|openrouter|together
--   supportsReasoningEffort: boolean
--   maxTokensField: "max_tokens" | "max_completion_tokens"
--   supportsTools: boolean
--   requiresStringContent: boolean
ALTER TABLE llm_providers
    ADD COLUMN IF NOT EXISTS compat JSONB;

-- ============ Model 级 thinking 配置 ============
-- thinking_format: 覆盖 provider 级 compat.thinkingFormat
ALTER TABLE llm_models
    ADD COLUMN IF NOT EXISTS thinking_format TEXT;

-- thinking_level_map: 各思考级别到 provider 参数的映射（JSON）
-- 例如 {"low":"low","medium":"medium","high":"high"} 或 {"low":null} 表示不支持
ALTER TABLE llm_models
    ADD COLUMN IF NOT EXISTS thinking_level_map TEXT;

-- supported_reasoning_efforts: 该模型支持的思考级别列表（JSON 数组）
-- 例如 ["low","medium","high"]
ALTER TABLE llm_models
    ADD COLUMN IF NOT EXISTS supported_reasoning_efforts TEXT;
