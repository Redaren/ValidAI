-- ============================================================================
-- Migration: Update validai_runs.snapshot Documentation for Gemini
-- ============================================================================
-- Description: Updates the comment on the snapshot column to document
--              Gemini-specific fields for file URI and cache name
-- Date: 2025-11-07
-- ============================================================================

-- Update snapshot column documentation
COMMENT ON COLUMN validai_runs.snapshot IS
'Immutable snapshot storing run-time configuration and provider-specific references:
- processor_id, document_id, organization_id
- LLM config: provider, model_name, api_key_encrypted, settings
- operations: array of operation configs
- Anthropic: anthropic_file_id (indefinite reuse)
- Mistral: mistral_document_url (24h signed URL)
- Google: gemini_file_uri (48h), gemini_cache_name (5min TTL), gemini_file_mime_type';

-- Verify column exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'validai_runs'
    AND column_name = 'snapshot'
  ) THEN
    RAISE NOTICE 'validai_runs.snapshot column documentation updated for Gemini support';
  ELSE
    RAISE EXCEPTION 'validai_runs.snapshot column not found!';
  END IF;
END $$;
