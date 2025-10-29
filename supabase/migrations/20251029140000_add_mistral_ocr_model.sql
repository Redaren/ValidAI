-- =============================================================================
-- ADD MISTRAL OCR MODEL TO LLM GLOBAL SETTINGS
-- =============================================================================
-- Description: Add Mistral OCR Latest model for document OCR processing in workbench
-- Author: ValidAI Team
-- Created: 2025-10-29
-- Risk: Low (adding new data only, no schema changes)
-- Rollback: DELETE FROM validai_llm_global_settings WHERE model_name = 'mistral-ocr-latest'
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ADD MISTRAL OCR LATEST (Specialized OCR model for workbench)
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
  'mistral-ocr-latest',
  'Mistral OCR Latest',
  false,  -- Not default
  true,   -- Active and available for selection
  jsonb_build_object(
    'default_temperature', 0.7,
    'default_max_tokens', 4096,
    'context_window', 128000,
    'supports_top_p', true,
    'supports_caching', false,
    'supports_thinking', false,
    'notes', 'OCR model for document processing. Use in Advanced Mode workbench for converting documents to markdown with optional structured annotations. Supports: PDF, TXT, HTML, MD, DOC, DOCX.'
  )
);

-- -----------------------------------------------------------------------------
-- VERIFY MIGRATION
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  ocr_count integer;
BEGIN
  -- Count OCR model
  SELECT COUNT(*) INTO ocr_count
  FROM validai_llm_global_settings
  WHERE provider = 'mistral' AND model_name = 'mistral-ocr-latest' AND is_active = true;

  -- Verify exactly 1 OCR model was added
  ASSERT ocr_count = 1,
    format('Expected 1 active Mistral OCR model, found %s', ocr_count);

  RAISE NOTICE '✅ Successfully added Mistral OCR model to global settings';
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
  (configuration->>'notes')::text as notes
FROM validai_llm_global_settings
WHERE provider = 'mistral' AND model_name = 'mistral-ocr-latest';

-- =============================================================================
-- NOTES ON MISTRAL OCR INTEGRATION
-- =============================================================================
--
-- ## OCR Model Usage
--
-- The Mistral OCR model is accessed ONLY through the Advanced Mode in the workbench:
-- 1. User enables Advanced Mode toggle
-- 2. User selects "Mistral OCR Latest" from model dropdown
-- 3. WorkbenchOCRMode component appears with file upload
-- 4. User uploads document and selects annotation format
-- 5. Document is processed via OCR and results displayed
--
-- ## Annotation Formats
--
-- - **None**: Basic markdown conversion only
-- - **Chapters**: Extract chapter titles, sections, and URLs
-- - **Dates**: Extract key dates and parties (contract analysis)
-- - **Items**: Extract line items and amounts (invoice processing)
--
-- ## Architecture
--
-- - **No database storage**: Files uploaded directly to Mistral, no Supabase Storage
-- - **Edge Function routing**: execute-workbench-test detects OCR model and routes accordingly
-- - **Result display**: Truncated markdown preview + full download options
-- - **Separate flow**: OCR uses distinct component and execution path from regular LLM workbench
--
-- =============================================================================
