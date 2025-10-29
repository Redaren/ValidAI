-- =============================================================================
-- ADD MISTRAL MODELS TO LLM GLOBAL SETTINGS
-- =============================================================================
-- Description: Add Mistral AI models to global LLM settings for ValidAI
-- Author: ValidAI Team
-- Created: 2025-10-29
-- Risk: Low (adding new data only, no schema changes)
-- Rollback: DELETE FROM validai_llm_global_settings WHERE provider = 'mistral'
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ADD MISTRAL SMALL (Recommended for cost-effectiveness)
-- -----------------------------------------------------------------------------

INSERT INTO validai_llm_global_settings (
  provider,
  model_name,
  display_name,
  is_default,
  is_active,
  configuration
) VALUES (
  'mistral',
  'mistral-small-latest',
  'Mistral Small Latest',
  false,  -- Not default (keep Claude as default)
  true,   -- Active and available for selection
  jsonb_build_object(
    'default_temperature', 0.7,
    'default_max_tokens', 4096,
    'default_top_p', 1.0,
    'context_window', 128000,
    'supports_top_p', true,
    'supports_caching', false,
    'supports_thinking', false,
    'notes', 'Cost-effective model with multimodal capabilities. Best for: routine document processing, multilingual tasks, cost-sensitive workloads. Limitations: No prompt caching (higher costs for multi-operation runs), no extended thinking mode.'
  )
);

-- -----------------------------------------------------------------------------
-- ADD MISTRAL LARGE (Most capable Mistral model)
-- -----------------------------------------------------------------------------

INSERT INTO validai_llm_global_settings (
  provider,
  model_name,
  display_name,
  is_default,
  is_active,
  configuration
) VALUES (
  'mistral',
  'mistral-large-latest',
  'Mistral Large Latest',
  false,  -- Not default
  true,   -- Active and available
  jsonb_build_object(
    'default_temperature', 0.7,
    'default_max_tokens', 4096,
    'default_top_p', 1.0,
    'context_window', 128000,
    'supports_top_p', true,
    'supports_caching', false,
    'supports_thinking', false,
    'notes', 'Most capable Mistral model for complex tasks. Best for: complex document analysis, high-accuracy extraction, multilingual processing. Limitations: Higher cost than Small, no prompt caching, no extended thinking.'
  )
);

-- -----------------------------------------------------------------------------
-- VERIFY MIGRATION
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  mistral_count integer;
BEGIN
  -- Count Mistral models
  SELECT COUNT(*) INTO mistral_count
  FROM validai_llm_global_settings
  WHERE provider = 'mistral' AND is_active = true;

  -- Verify exactly 2 models were added
  ASSERT mistral_count = 2,
    format('Expected 2 active Mistral models, found %s', mistral_count);

  RAISE NOTICE '✅ Successfully added % Mistral models to global settings', mistral_count;
END $$;

-- -----------------------------------------------------------------------------
-- DISPLAY SUMMARY
-- -----------------------------------------------------------------------------

SELECT
  provider,
  model_name,
  display_name,
  is_default,
  is_active,
  (configuration->>'default_temperature')::text as temperature,
  (configuration->>'context_window')::text as context_window,
  (configuration->>'supports_caching')::text as caching,
  (configuration->>'supports_thinking')::text as thinking
FROM validai_llm_global_settings
WHERE provider = 'mistral'
ORDER BY model_name;

-- =============================================================================
-- NOTES ON MISTRAL INTEGRATION
-- =============================================================================
--
-- ## Mistral Model Capabilities
--
-- **Supported Features:**
-- - ✅ Multimodal document processing (PDF, text via Files API)
-- - ✅ Structured output via JSON mode
-- - ✅ Temperature, max_tokens, top_p parameters
-- - ✅ 128k context window
--
-- **Limitations (compared to Anthropic):**
-- - ❌ No prompt caching (higher API costs for multi-operation runs)
-- - ❌ No extended thinking/reasoning mode
-- - ❌ Less strict structured output validation
-- - ⚠️  Requires document upload step (2-3s overhead per run)
--
-- ## Cost Implications
--
-- Mistral models do NOT support prompt caching, which means:
-- - Single-operation runs: Similar cost to Anthropic
-- - Multi-operation runs: ~7x more expensive than Anthropic with caching
-- - Example: 100 operations on same document
--   - Anthropic with caching: ~$1.50 (90% cache hits)
--   - Mistral without caching: ~$10.50 (full tokens every time)
--
-- ## Recommended Use Cases
--
-- **Use Mistral when:**
-- - Cost-sensitive single-operation workloads (Mistral Small is cheaper than Claude)
-- - Multilingual document processing requirements
-- - Regulatory requirements mandate using specific providers
-- - Testing provider diversity/redundancy
--
-- **Use Anthropic when:**
-- - Multi-operation processor runs (caching saves 90% on costs)
-- - Complex reasoning tasks requiring thinking mode
-- - Maximum structured output reliability needed
-- - Document processing speed is critical (no upload overhead)
--
-- ## Integration Architecture
--
-- The Mistral integration follows a provider-routing architecture:
-- - Router pattern: `llm-executor-router.ts` dispatches to provider-specific executors
-- - Mistral executor: `llm-executor-mistral.ts` handles document upload and API calls
-- - Provider detection: Automatic based on model selection in UI
-- - API key resolution: Organization-specific or global `MISTRAL_API_KEY` fallback
-- - Signed URL caching: Document uploaded once per run, URL reused for all operations
--
-- ## Migration Impact
--
-- This migration is **additive only** with no breaking changes:
-- - ✅ Adds 2 new model options to UI dropdowns
-- - ✅ Existing processors continue using Anthropic models unchanged
-- - ✅ Users can optionally select Mistral models for new processors
-- - ✅ Rollback: Simply delete Mistral rows from validai_llm_global_settings
--
-- =============================================================================
