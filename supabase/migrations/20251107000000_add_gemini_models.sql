-- ============================================================================
-- Migration: Add Google Gemini 2.5 Models to LLM Global Settings
-- ============================================================================
-- Description: Adds Gemini 2.5 Flash and Pro models to the platform's
--              available LLM providers with caching and thinking support
-- Date: 2025-11-07
-- ============================================================================

-- Add Gemini 2.5 Flash model
INSERT INTO validai_llm_global_settings (
  provider,
  model_name,
  display_name,
  is_default,
  is_active,
  configuration
)
VALUES (
  'google',
  'gemini-2.5-flash',
  'Gemini 2.5 Flash',
  false,
  true,
  jsonb_build_object(
    'default_temperature', 1.0,
    'default_max_tokens', 8192,
    'default_top_p', 0.95,
    'default_top_k', 40,
    'context_window', 1000000,
    'supports_top_p', true,
    'supports_top_k', true,
    'supports_caching', true,
    'supports_thinking', true,
    'thinking_budget', -1,
    'include_thoughts', false,
    'notes', 'Fast and efficient with 1M token context. Best for high-volume processing with explicit caching support (5min TTL). Thinking budget: -1 (dynamic), 0 (disabled), or 512-24576 (fixed).'
  )
)
ON CONFLICT (provider, model_name) DO NOTHING;

-- Add Gemini 2.5 Pro model
INSERT INTO validai_llm_global_settings (
  provider,
  model_name,
  display_name,
  is_default,
  is_active,
  configuration
)
VALUES (
  'google',
  'gemini-2.5-pro',
  'Gemini 2.5 Pro',
  false,
  true,
  jsonb_build_object(
    'default_temperature', 1.0,
    'default_max_tokens', 8192,
    'default_top_p', 0.95,
    'default_top_k', 40,
    'context_window', 1000000,
    'supports_top_p', true,
    'supports_top_k', true,
    'supports_caching', true,
    'supports_thinking', true,
    'thinking_budget', -1,
    'include_thoughts', false,
    'notes', 'Most capable Gemini model with advanced reasoning and 1M token context. Best for complex analysis and large documents. Thinking budget: 128-32768 (cannot disable). Explicit caching with 5min TTL.'
  )
)
ON CONFLICT (provider, model_name) DO NOTHING;

-- Verify insertion
DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM validai_llm_global_settings
  WHERE provider = 'google';

  RAISE NOTICE 'Gemini models added. Total Google models: %', v_count;
END $$;
