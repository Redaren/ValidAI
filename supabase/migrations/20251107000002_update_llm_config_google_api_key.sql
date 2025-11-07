-- ============================================================================
-- Migration: Update get_llm_config_for_run for Google Provider Support
-- ============================================================================
-- Description: Adds Google provider support with environment variable fallback
--              (same behavior as Anthropic and Mistral)
-- Date: 2025-11-07
-- ============================================================================

CREATE OR REPLACE FUNCTION get_llm_config_for_run(p_processor_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org_id uuid;
  v_org_config jsonb;
  v_proc_config jsonb;
  v_selected_model_id text;
  v_selected_model jsonb;
  v_api_key_encrypted text;
  v_result jsonb;
  v_default_settings jsonb;
  v_provider text;
BEGIN
  -- Get organization ID from processor (primary) or JWT (fallback)
  IF p_processor_id IS NOT NULL THEN
    -- Use processor's organization_id
    SELECT p.organization_id, p.configuration
    INTO v_org_id, v_proc_config
    FROM public.validai_processors p
    WHERE p.id = p_processor_id;

    IF v_org_id IS NULL THEN
      RAISE EXCEPTION 'Processor not found or has no organization';
    END IF;
  ELSE
    -- Fall back to JWT if no processor specified
    v_org_id := (auth.jwt() -> 'app_metadata' ->> 'organization_id')::uuid;

    IF v_org_id IS NULL THEN
      RAISE EXCEPTION 'No organization context found';
    END IF;
  END IF;

  -- Get organization configuration from PLATFORM table
  SELECT llm_configuration
  INTO v_org_config
  FROM public.organizations
  WHERE id = v_org_id;

  -- Determine which model to use (processor override > org default)
  IF v_proc_config IS NOT NULL AND v_proc_config ? 'selected_model_id' THEN
    v_selected_model_id := v_proc_config ->> 'selected_model_id';
  ELSIF v_org_config IS NOT NULL AND v_org_config ? 'default_model_id' THEN
    v_selected_model_id := v_org_config ->> 'default_model_id';
  END IF;

  -- Try to use organization configuration
  IF v_org_config IS NOT NULL AND v_selected_model_id IS NOT NULL THEN
    -- Find the selected model in organization's available models
    SELECT jsonb_array_elements(v_org_config -> 'available_models') AS model
    INTO v_selected_model
    FROM (
      SELECT jsonb_array_elements(v_org_config -> 'available_models') AS model
    ) m
    WHERE model ->> 'id' = v_selected_model_id
    LIMIT 1;

    IF v_selected_model IS NOT NULL THEN
      -- Extract provider
      v_provider := v_selected_model ->> 'provider';

      -- Get encrypted API key for the provider
      v_api_key_encrypted := v_org_config -> 'api_keys_encrypted' ->> v_provider;

      -- Note: If org key is NULL, Edge Functions will fall back to environment variables
      -- (ANTHROPIC_API_KEY, MISTRAL_API_KEY, GOOGLE_API_KEY)

      -- Get default settings from global config
      SELECT configuration
      INTO v_default_settings
      FROM public.validai_llm_global_settings
      WHERE provider = v_provider
        AND model_name = (v_selected_model ->> 'model')
        AND is_active = true;

      -- Build result with organization config
      v_result := jsonb_build_object(
        'provider', v_provider,
        'model', v_selected_model ->> 'model',
        'display_name', v_selected_model ->> 'display_name',
        'api_key_encrypted', v_api_key_encrypted,
        'organization_id', v_org_id,
        'settings', COALESCE(
          v_proc_config -> 'settings_override',
          v_default_settings,
          '{}'::jsonb
        )
      );

      RETURN v_result;
    END IF;
  END IF;

  -- Fall back to global default (no API key)
  SELECT provider, model_name, display_name, configuration
  INTO v_provider, v_selected_model_id, v_api_key_encrypted, v_default_settings
  FROM public.validai_llm_global_settings
  WHERE is_default = true
    AND is_active = true
  LIMIT 1;

  -- Note: api_key_encrypted will be NULL for global defaults
  -- Edge Functions will use environment variables as fallback

  v_result := jsonb_build_object(
    'provider', v_provider,
    'model', v_selected_model_id,
    'display_name', v_api_key_encrypted,
    'api_key_encrypted', NULL,
    'organization_id', v_org_id,
    'settings', v_default_settings
  );

  -- If no default found, return error config
  IF v_result IS NULL THEN
    RETURN jsonb_build_object(
      'error', 'No LLM configuration available',
      'organization_id', v_org_id
    );
  END IF;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION get_llm_config_for_run(uuid) IS
  'Updated to support Google provider with env var fallback - Gemini Integration (2025-11-07)';

-- Verification
DO $$
BEGIN
  RAISE NOTICE '✅ get_llm_config_for_run updated for Google provider support';
  RAISE NOTICE '   - Google provider added (same fallback behavior as Anthropic/Mistral)';
  RAISE NOTICE '   - Supports org-specific API keys with encryption';
  RAISE NOTICE '   - Falls back to environment variables when org key not configured';
END $$;
