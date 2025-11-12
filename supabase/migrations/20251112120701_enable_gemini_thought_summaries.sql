-- Enable Gemini Thought Summaries by Default
--
-- Migration: 20251112120701_enable_gemini_thought_summaries
-- Description: Updates Gemini models to enable includeThoughts by default when thinking_budget is configured.
--              This allows the system to capture and store thought summaries for analysis and debugging.
--
-- Context:
-- - Gemini supports dynamic thinking via thinkingBudget (-1 = model-managed, 512-32768 = fixed budget)
-- - includeThoughts flag controls whether thought summaries are returned in the API response
-- - By default, thought summaries were disabled (false) which meant thinking happened but wasn't captured
-- - This migration enables thought summary capture for all Gemini models
--
-- Affected tables:
-- - validai_llm_global_settings (Google provider models only)

-- Update Gemini Flash model to enable thought summaries
UPDATE validai_llm_global_settings
SET configuration = jsonb_set(
  configuration,
  '{include_thoughts}',
  'true'::jsonb
)
WHERE provider = 'google'
  AND model_name = 'gemini-2.5-flash'
  AND is_active = true;

-- Update Gemini Pro model to enable thought summaries
UPDATE validai_llm_global_settings
SET configuration = jsonb_set(
  configuration,
  '{include_thoughts}',
  'true'::jsonb
)
WHERE provider = 'google'
  AND model_name = 'gemini-2.5-pro'
  AND is_active = true;

-- Log the changes
DO $$
DECLARE
  flash_updated INTEGER;
  pro_updated INTEGER;
BEGIN
  GET DIAGNOSTICS flash_updated = ROW_COUNT;

  SELECT COUNT(*) INTO pro_updated
  FROM validai_llm_global_settings
  WHERE provider = 'google'
    AND model_name = 'gemini-2.5-pro'
    AND is_active = true
    AND configuration->>'include_thoughts' = 'true';

  RAISE NOTICE 'Gemini thought summaries enabled: Flash models updated (if active), Pro models updated (if active)';
  RAISE NOTICE 'Thought summaries will now be captured and stored in validai_operation_results.thinking_blocks';
END $$;
