-- Migration: Add Gemini 3 Flash and Pro models with thinking_level support
-- Date: 2026-01-01
-- Description: Adds gemini-3-flash-preview and gemini-3-pro-preview models,
--              sets Gemini 3 Flash as the new default model.
--              Gemini 3 uses thinking_level (enum) instead of thinking_budget (numeric).

-- Step 1: Remove default from current model (Gemini 2.5 Flash)
UPDATE validai_llm_global_settings
SET is_default = false, updated_at = now()
WHERE model_name = 'gemini-2.5-flash' AND is_default = true;

-- Step 2: Add Gemini 3 Flash Preview (NEW DEFAULT)
INSERT INTO validai_llm_global_settings (
  provider, model_name, display_name, is_default, is_active,
  configuration, execution_config
) VALUES (
  'google',
  'gemini-3-flash-preview',
  'Gemini 3 Flash (Preview)',
  true,  -- NEW DEFAULT
  true,
  '{
    "notes": "Pro-level intelligence at Flash speed. Uses thinking_level instead of thinking_budget. Levels: low, medium (Flash-only), high (default), minimal (Flash-only). 64K max output tokens.",
    "context_window": 1000000,
    "default_max_tokens": 64000,
    "default_temperature": 1.0,
    "supports_top_p": true,
    "supports_top_k": true,
    "default_top_p": 0.95,
    "default_top_k": 40,
    "supports_caching": true,
    "supports_thinking": true,
    "thinking_level": "high",
    "include_thoughts": false
  }'::jsonb,
  '{
    "execution_mode": "parallel",
    "max_concurrency": 100,
    "chunk_size": 100,
    "batch_delay_ms": 500,
    "rate_limit_safety": true,
    "warmup_operations": 0,
    "description": "Optimized for paid tier - 100 concurrent operations"
  }'::jsonb
);

-- Step 3: Add Gemini 3 Pro Preview
INSERT INTO validai_llm_global_settings (
  provider, model_name, display_name, is_default, is_active,
  configuration, execution_config
) VALUES (
  'google',
  'gemini-3-pro-preview',
  'Gemini 3 Pro (Preview)',
  false,
  true,
  '{
    "notes": "Advanced reasoning for complex tasks. Uses thinking_level instead of thinking_budget. Levels: low, high (default). Medium/minimal NOT supported on Pro. 64K max output tokens.",
    "context_window": 1000000,
    "default_max_tokens": 64000,
    "default_temperature": 1.0,
    "supports_top_p": true,
    "supports_top_k": true,
    "default_top_p": 0.95,
    "default_top_k": 40,
    "supports_caching": true,
    "supports_thinking": true,
    "thinking_level": "high",
    "include_thoughts": false
  }'::jsonb,
  '{
    "execution_mode": "parallel",
    "max_concurrency": 25,
    "chunk_size": 25,
    "batch_delay_ms": 500,
    "rate_limit_safety": true,
    "warmup_operations": 0,
    "description": "Optimized for paid tier - 25 concurrent operations"
  }'::jsonb
);
