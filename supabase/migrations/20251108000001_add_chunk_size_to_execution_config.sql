-- Migration: Add chunk_size to execution configuration
-- Created: 2025-11-08
-- Description: Adds chunk_size field to validai_llm_global_settings.execution_config
--              to support provider-specific Edge Function chunk sizing.
--
-- Background:
-- Previously, chunk size was hardcoded to CHUNK_SIZE=4 in execute-processor-run Edge Function.
-- This was too conservative for providers with high rate limits (e.g., Gemini 150 RPM).
--
-- Solution:
-- Move chunk_size to execution_config, set to match max_concurrency for optimal performance.
-- This allows Gemini to process 25 operations per chunk instead of 4 (6x speedup).

-- Add chunk_size to Gemini configuration (150 RPM paid tier)
UPDATE validai_llm_global_settings
SET execution_config = execution_config || jsonb_build_object(
  'chunk_size', 25
)
WHERE provider = 'google';

-- Add chunk_size to Anthropic configuration (50 RPM Tier 1)
UPDATE validai_llm_global_settings
SET execution_config = execution_config || jsonb_build_object(
  'chunk_size', 5
)
WHERE provider = 'anthropic';

-- Add chunk_size to Mistral configuration (Conservative free tier)
UPDATE validai_llm_global_settings
SET execution_config = execution_config || jsonb_build_object(
  'chunk_size', 3
)
WHERE provider = 'mistral';

-- Verify the updates
SELECT
  provider,
  model_name,
  execution_config->>'execution_mode' as mode,
  (execution_config->>'max_concurrency')::int as concurrency,
  (execution_config->>'chunk_size')::int as chunk_size,
  (execution_config->>'batch_delay_ms')::int as batch_delay
FROM validai_llm_global_settings
WHERE is_active = true
ORDER BY provider, model_name;

-- Add comment explaining the field
COMMENT ON COLUMN validai_llm_global_settings.execution_config IS
'Configuration for parallel execution: execution_mode (serial|parallel|hybrid), max_concurrency (1-20), chunk_size (operations per Edge Function invocation), warmup_operations (0-5), batch_delay_ms (0-10000), rate_limit_safety (boolean)';
