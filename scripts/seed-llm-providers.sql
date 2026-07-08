-- scripts/seed-llm-providers.sql
-- Demo LLM Provider 和模型数据（public schema）
-- 用法：docker compose exec -T postgres psql -U multicloud -d multicloud < scripts/seed-llm-providers.sql

BEGIN;

-- OpenAI
INSERT INTO llm_providers (id, name, base_url, api_key, is_default, compat, created_at, updated_at)
VALUES ('openai', 'OpenAI', 'https://api.openai.com/v1', 'sk-****DEMO', FALSE,
        '{"thinkingFormat":"openai","supportsReasoningEffort":true,"maxTokensField":"max_completion_tokens","supportsTools":true}'::jsonb,
        EXTRACT(EPOCH FROM NOW()) * 1000, EXTRACT(EPOCH FROM NOW()) * 1000)
ON CONFLICT (id) DO NOTHING;

INSERT INTO llm_models (id, provider_id, name, context_window, reasoning, input_types, thinking_format, thinking_level_map, supported_reasoning_efforts)
VALUES
  ('gpt-4o', 'openai', 'GPT-4o', 128000, FALSE, '["text","image"]', NULL, NULL, NULL),
  ('gpt-4o-mini', 'openai', 'GPT-4o Mini', 128000, FALSE, '["text","image"]', NULL, NULL, NULL),
  ('o3-mini', 'openai', 'o3-mini', 200000, TRUE, '["text"]', NULL, NULL, '["low","medium","high"]'),
  ('gpt-4.1', 'openai', 'GPT-4.1', 1047576, FALSE, '["text","image"]', NULL, NULL, NULL)
ON CONFLICT (id, provider_id) DO NOTHING;

-- DeepSeek
INSERT INTO llm_providers (id, name, base_url, api_key, is_default, compat, created_at, updated_at)
VALUES ('deepseek', 'DeepSeek', 'https://api.deepseek.com/v1', 'sk-****DEMO', FALSE,
        '{"thinkingFormat":"deepseek","supportsReasoningEffort":true,"supportsTools":true}'::jsonb,
        EXTRACT(EPOCH FROM NOW()) * 1000, EXTRACT(EPOCH FROM NOW()) * 1000)
ON CONFLICT (id) DO NOTHING;

INSERT INTO llm_models (id, provider_id, name, context_window, reasoning, input_types, thinking_format, thinking_level_map, supported_reasoning_efforts)
VALUES
  ('deepseek-chat', 'deepseek', 'DeepSeek V3', 65536, FALSE, '["text"]', NULL, NULL, NULL),
  ('deepseek-reasoner', 'deepseek', 'DeepSeek R1', 65536, TRUE, '["text"]', NULL, NULL, NULL)
ON CONFLICT (id, provider_id) DO NOTHING;

-- OpenRouter
INSERT INTO llm_providers (id, name, base_url, api_key, is_default, compat, created_at, updated_at)
VALUES ('openrouter', 'OpenRouter', 'https://openrouter.ai/api/v1', 'sk-or-****DEMO', FALSE,
        '{"thinkingFormat":"openrouter","supportsReasoningEffort":true,"supportsTools":true}'::jsonb,
        EXTRACT(EPOCH FROM NOW()) * 1000, EXTRACT(EPOCH FROM NOW()) * 1000)
ON CONFLICT (id) DO NOTHING;

INSERT INTO llm_models (id, provider_id, name, context_window, reasoning, input_types, thinking_format, thinking_level_map, supported_reasoning_efforts)
VALUES
  ('anthropic/claude-sonnet-4', 'openrouter', 'Claude Sonnet 4', 200000, FALSE, '["text","image"]', NULL, NULL, NULL),
  ('google/gemini-2.5-pro-preview', 'openrouter', 'Gemini 2.5 Pro', 1048576, TRUE, '["text","image"]', NULL, NULL, '["low","medium","high"]'),
  ('meta-llama/llama-4-maverick', 'openrouter', 'Llama 4 Maverick', 1048576, FALSE, '["text","image"]', NULL, NULL, NULL)
ON CONFLICT (id, provider_id) DO NOTHING;

-- NVIDIA NIM: 补充额外模型（需与 NVIDIA API 实际可用的模型 ID 一致）
INSERT INTO llm_models (id, provider_id, name, context_window, reasoning, input_types, thinking_format, thinking_level_map, supported_reasoning_efforts)
VALUES
  ('meta/llama-3.1-8b-instruct', 'nvidia', 'Llama 3.1 8B Instruct', 128000, FALSE, '["text"]', NULL, NULL, NULL),
  ('nvidia/nemotron-3-nano-30b-a3b', 'nvidia', 'Nemotron 3 Nano 30B', 128000, FALSE, '["text"]', NULL, NULL, NULL),
  ('google/gemma-2-2b-it', 'nvidia', 'Gemma 2 2B IT', 8192, FALSE, '["text"]', NULL, NULL, NULL)
ON CONFLICT (id, provider_id) DO NOTHING;

COMMIT;
