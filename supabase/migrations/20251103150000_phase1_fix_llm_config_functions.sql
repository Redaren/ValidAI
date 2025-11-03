-- =============================================================================
-- PHASE 1: FIX LLM CONFIGURATION FUNCTIONS TO USE PLATFORM TABLES
-- =============================================================================
-- Description: Update 3 LLM configuration functions to read/write from
--              organizations table instead of validai_organizations
-- Created: 2025-11-03
-- Part of: Complete Legacy Table Cleanup Plan
-- Priority: CRITICAL (prevents future data divergence)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- FUNCTION 1: get_available_llm_models
-- -----------------------------------------------------------------------------
-- Purpose: Get available LLM models for current organization
-- Updated: validai_organizations → organizations

CREATE OR REPLACE FUNCTION get_available_llm_models()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org_id uuid;
  v_org_config jsonb;
  v_global_models jsonb;
BEGIN
  -- Get current organization
  v_org_id := (auth.jwt() -> 'app_metadata' ->> 'organization_id')::uuid;

  -- Get organization configuration from PLATFORM table
  SELECT llm_configuration
  INTO v_org_config
  FROM public.organizations  -- ✅ FIXED: was validai_organizations
  WHERE id = v_org_id;

  -- If org has configured models, return them
  IF v_org_config IS NOT NULL AND v_org_config ? 'available_models' THEN
    RETURN jsonb_build_object(
      'source', 'organization',
      'models', v_org_config -> 'available_models',
      'default_model_id', v_org_config ->> 'default_model_id'
    );
  END IF;

  -- Otherwise return global models
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', model_name,
      'provider', provider,
      'model', model_name,
      'display_name', display_name,
      'is_default', is_default
    )
    ORDER BY is_default DESC, display_name
  ) INTO v_global_models
  FROM public.validai_llm_global_settings
  WHERE is_active = true;

  RETURN jsonb_build_object(
    'source', 'global',
    'models', COALESCE(v_global_models, '[]'::jsonb),
    'default_model_id', NULL
  );
END;
$$;

COMMENT ON FUNCTION get_available_llm_models() IS
  'Updated to use platform organizations table - Phase 1 Legacy Cleanup (2025-11-03)';

-- -----------------------------------------------------------------------------
-- FUNCTION 2: get_llm_config_for_run
-- -----------------------------------------------------------------------------
-- Purpose: Get LLM configuration for a specific processor run
-- Updated: validai_organizations → organizations (2 references)

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
  FROM public.organizations  -- ✅ FIXED: was validai_organizations
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
      -- Get encrypted API key for the provider
      v_api_key_encrypted := v_org_config -> 'api_keys_encrypted' ->> (v_selected_model ->> 'provider');

      -- Get default settings from global config
      SELECT configuration
      INTO v_default_settings
      FROM public.validai_llm_global_settings
      WHERE provider = (v_selected_model ->> 'provider')
        AND model_name = (v_selected_model ->> 'model')
        AND is_active = true;

      -- Build result with organization config
      v_result := jsonb_build_object(
        'provider', v_selected_model ->> 'provider',
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
  SELECT jsonb_build_object(
    'provider', provider,
    'model', model_name,
    'display_name', display_name,
    'api_key_encrypted', NULL,
    'organization_id', v_org_id,
    'settings', configuration
  ) INTO v_result
  FROM public.validai_llm_global_settings
  WHERE is_default = true
    AND is_active = true
  LIMIT 1;

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
  'Updated to use platform organizations table - Phase 1 Legacy Cleanup (2025-11-03)';

-- -----------------------------------------------------------------------------
-- FUNCTION 3: set_organization_llm_config
-- -----------------------------------------------------------------------------
-- Purpose: Set LLM configuration for current organization
-- Updated: validai_organizations → organizations

CREATE OR REPLACE FUNCTION set_organization_llm_config(
  p_api_keys jsonb,
  p_available_models jsonb,
  p_default_model_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org_id uuid;
  v_encrypted_keys jsonb = '{}'::jsonb;
  v_key text;
  v_value text;
BEGIN
  -- Get current organization
  v_org_id := (auth.jwt() -> 'app_metadata' ->> 'organization_id')::uuid;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'No organization context found';
  END IF;

  -- Encrypt each API key
  FOR v_key, v_value IN SELECT * FROM jsonb_each_text(p_api_keys)
  LOOP
    v_encrypted_keys := v_encrypted_keys ||
      jsonb_build_object(v_key, public.encrypt_api_key(v_value, v_org_id));
  END LOOP;

  -- Update organization configuration in PLATFORM table
  UPDATE public.organizations  -- ✅ FIXED: was validai_organizations
  SET
    llm_configuration = jsonb_build_object(
      'api_keys_encrypted', v_encrypted_keys,
      'available_models', p_available_models,
      'default_model_id', p_default_model_id
    ),
    updated_at = now()
  WHERE id = v_org_id;

  -- Return success
  RETURN jsonb_build_object(
    'success', true,
    'organization_id', v_org_id,
    'models_configured', jsonb_array_length(p_available_models)
  );
END;
$$;

COMMENT ON FUNCTION set_organization_llm_config(jsonb, jsonb, text) IS
  'Updated to use platform organizations table - Phase 1 Legacy Cleanup (2025-11-03)';

-- -----------------------------------------------------------------------------
-- DATA SYNCHRONIZATION
-- -----------------------------------------------------------------------------
-- Copy any existing LLM configuration from legacy to platform table
-- (Currently both are NULL, but this ensures safety)

UPDATE organizations o
SET llm_configuration = vo.llm_configuration
FROM validai_organizations vo
WHERE o.id = vo.id
  AND vo.llm_configuration IS NOT NULL
  AND (o.llm_configuration IS NULL OR o.llm_configuration != vo.llm_configuration);

-- -----------------------------------------------------------------------------
-- VERIFICATION
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_functions_fixed int := 0;
  v_data_synced int := 0;
BEGIN
  -- Verify functions updated (check if they now reference organizations)
  SELECT COUNT(*) INTO v_functions_fixed
  FROM information_schema.routines
  WHERE routine_schema = 'public'
    AND routine_name IN (
      'get_available_llm_models',
      'get_llm_config_for_run',
      'set_organization_llm_config'
    )
    AND routine_definition NOT LIKE '%validai_organizations%';

  -- Verify data synchronized
  SELECT COUNT(*) INTO v_data_synced
  FROM organizations o
  INNER JOIN validai_organizations vo ON o.id = vo.id
  WHERE (o.llm_configuration IS NULL AND vo.llm_configuration IS NULL)
     OR (o.llm_configuration = vo.llm_configuration);

  RAISE NOTICE '✅ Phase 1 Complete: LLM Configuration Functions';
  RAISE NOTICE '   - Functions fixed: %/3', v_functions_fixed;
  RAISE NOTICE '   - Data synchronized: % organizations', v_data_synced;

  IF v_functions_fixed < 3 THEN
    RAISE WARNING '⚠️  Expected 3 functions fixed, found %', v_functions_fixed;
  END IF;
END $$;
