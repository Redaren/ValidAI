-- Migration: Add execution configuration for parallel operation execution
-- Created: 2025-11-08
-- Description: Adds execution_config column to validai_llm_global_settings to support
--              provider-aware parallel execution modes (serial, parallel, hybrid)

-- Add execution_config column to LLM global settings
ALTER TABLE validai_llm_global_settings
ADD COLUMN IF NOT EXISTS execution_config JSONB DEFAULT jsonb_build_object(
  'execution_mode', 'serial',
  'max_concurrency', 1,
  'warmup_operations', 0,
  'batch_delay_ms', 0,
  'rate_limit_safety', true
);

COMMENT ON COLUMN validai_llm_global_settings.execution_config IS
'Configuration for parallel execution: execution_mode (serial|parallel|hybrid), max_concurrency (1-20), warmup_operations (0-5), batch_delay_ms (0-10000), rate_limit_safety (boolean)';

-- Update Anthropic models with hybrid execution config
-- Hybrid mode: First operation creates cache (serial), then rest execute in parallel
UPDATE validai_llm_global_settings
SET execution_config = jsonb_build_object(
  'execution_mode', 'hybrid',
  'max_concurrency', 5,           -- Conservative for Tier 1 (50 RPM = ~1 req/sec)
  'warmup_operations', 1,          -- First operation must complete before parallelization
  'batch_delay_ms', 200,           -- 200ms between batches = max 5 req/sec
  'rate_limit_safety', true,       -- Auto-reduce concurrency on 429 errors
  'description', 'Hybrid execution preserves prompt caching efficiency (90% savings) while enabling parallelization after cache warmup'
)
WHERE provider = 'anthropic';

-- Update Google Gemini models with full parallel execution config
-- Gemini Cache API creates cache upfront, so all operations can execute in parallel
UPDATE validai_llm_global_settings
SET execution_config = jsonb_build_object(
  'execution_mode', 'parallel',
  'max_concurrency', 5,            -- Conservative for Free tier (Gemini 2.5 Pro: 5 RPM, Flash: 10 RPM)
  'warmup_operations', 0,          -- No warmup needed (cache already created in initial invocation)
  'batch_delay_ms', 6000,          -- 6 seconds between batches = 10 req/min (safe for free tier)
  'rate_limit_safety', true,
  'description', 'Full parallel execution with explicit cache API (75-90% savings maintained)'
)
WHERE provider = 'google';

-- Update Mistral models with parallel execution config
-- Mistral has no caching, but signed URL can be reused by concurrent requests
UPDATE validai_llm_global_settings
SET execution_config = jsonb_build_object(
  'execution_mode', 'parallel',
  'max_concurrency', 3,            -- Very conservative for Free tier (~1 RPS)
  'warmup_operations', 0,          -- No warmup needed (no caching)
  'batch_delay_ms', 1000,          -- 1 second between batches = max 3 req/sec
  'rate_limit_safety', true,
  'description', 'Parallel execution with no caching (signed URL reused across operations)'
)
WHERE provider = 'mistral';

-- Create index for faster config lookups during edge function execution
CREATE INDEX IF NOT EXISTS idx_llm_global_settings_provider_active
ON validai_llm_global_settings(provider, is_active)
WHERE is_active = true;

-- Verify configurations
DO $$
DECLARE
  anthropic_count INTEGER;
  google_count INTEGER;
  mistral_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO anthropic_count FROM validai_llm_global_settings
  WHERE provider = 'anthropic' AND execution_config->>'execution_mode' = 'hybrid';

  SELECT COUNT(*) INTO google_count FROM validai_llm_global_settings
  WHERE provider = 'google' AND execution_config->>'execution_mode' = 'parallel';

  SELECT COUNT(*) INTO mistral_count FROM validai_llm_global_settings
  WHERE provider = 'mistral' AND execution_config->>'execution_mode' = 'parallel';

  RAISE NOTICE 'Execution config migration complete:';
  RAISE NOTICE '  Anthropic models with hybrid mode: %', anthropic_count;
  RAISE NOTICE '  Google models with parallel mode: %', google_count;
  RAISE NOTICE '  Mistral models with parallel mode: %', mistral_count;

  IF anthropic_count = 0 OR google_count = 0 OR mistral_count = 0 THEN
    RAISE WARNING 'Some providers have no execution config set. Verify model seeding.';
  END IF;
END $$;
