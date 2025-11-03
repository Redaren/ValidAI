-- =============================================================================
-- PHASE 2: FIX USER/PROFILE FUNCTIONS TO USE PLATFORM TABLES
-- =============================================================================
-- Description: Update 4 functions that reference validai_profiles
-- Created: 2025-11-03
-- Part of: Complete Legacy Table Cleanup Plan
-- Priority: HIGH (affects user creation trigger)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- FUNCTION 1: handle_new_user (TRIGGER FUNCTION - CRITICAL)
-- -----------------------------------------------------------------------------
-- Purpose: Automatically create profile and organization for new users
-- Updated: validai_profiles → profiles
--          validai_organizations → organizations
--          validai_organization_members → organization_members

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  new_org_id uuid;
  user_display_name text;
BEGIN
  -- Create user profile in PLATFORM table
  INSERT INTO profiles (id, full_name)  -- ✅ FIXED: was validai_profiles
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1))
  );

  -- Determine display name for organization
  user_display_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    split_part(NEW.email, '@', 1)
  );

  -- Create personal organization for new user in PLATFORM table
  INSERT INTO organizations (name, created_by)  -- ✅ FIXED: was validai_organizations (removed slug)
  VALUES (
    user_display_name || '''s Organization',
    NEW.id
  )
  RETURNING id INTO new_org_id;

  -- Add user as owner of their organization in PLATFORM table
  INSERT INTO organization_members (organization_id, user_id, role)  -- ✅ FIXED: was validai_organization_members
  VALUES (new_org_id, NEW.id, 'owner');

  -- Note: JWT app_metadata updated separately by auth flow

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION handle_new_user() IS
  'Updated to use platform profiles, organizations, and organization_members tables - Phase 2 Legacy Cleanup (2025-11-03)';

-- -----------------------------------------------------------------------------
-- FUNCTION 2: get_processor_with_operations
-- -----------------------------------------------------------------------------
-- Purpose: Get processor details with all operations and creator profile
-- Updated: validai_profiles → profiles

CREATE OR REPLACE FUNCTION get_processor_with_operations(p_processor_id uuid)
RETURNS TABLE (
  processor_id uuid,
  processor_name text,
  processor_description text,
  processor_usage_description text,
  processor_status text,
  processor_visibility text,
  processor_system_prompt text,
  processor_area_configuration jsonb,
  processor_configuration jsonb,
  processor_tags text[],
  processor_created_at timestamptz,
  processor_updated_at timestamptz,
  processor_published_at timestamptz,
  creator_name text,
  operation_id uuid,
  operation_name text,
  operation_description text,
  operation_type text,
  operation_prompt text,
  operation_output_schema jsonb,
  operation_validation_rules jsonb,
  operation_area text,
  operation_position numeric,
  operation_required boolean,
  operation_configuration jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.name,
    p.description,
    p.usage_description,
    p.status::text,
    p.visibility::text,
    p.system_prompt,
    p.area_configuration,
    p.configuration,
    p.tags,
    p.created_at,
    p.updated_at,
    p.published_at,
    prof.full_name,  -- ✅ FIXED: now from profiles table
    o.id,
    o.name,
    o.description,
    o.operation_type::text,
    o.prompt,
    o.output_schema,
    o.validation_rules,
    o.area,
    o.position,
    o.required,
    o.configuration
  FROM validai_processors p
  LEFT JOIN profiles prof ON prof.id = p.created_by  -- ✅ FIXED: was validai_profiles
  LEFT JOIN validai_operations o ON o.processor_id = p.id
  WHERE p.id = p_processor_id
    AND p.deleted_at IS NULL
  ORDER BY o.area, o.position;
END;
$$;

COMMENT ON FUNCTION get_processor_with_operations(uuid) IS
  'Updated to use platform profiles table - Phase 2 Legacy Cleanup (2025-11-03)';

-- -----------------------------------------------------------------------------
-- FUNCTION 3: get_user_processors
-- -----------------------------------------------------------------------------
-- Purpose: Get all processors visible to current user with creator info
-- Updated: validai_profiles → profiles

CREATE OR REPLACE FUNCTION get_user_processors()
RETURNS TABLE (
  id uuid,
  organization_id uuid,
  name text,
  description text,
  usage_description text,
  status text,
  visibility text,
  tags text[],
  created_by uuid,
  creator_name text,
  created_at timestamptz,
  updated_at timestamptz,
  published_at timestamptz,
  operation_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid;
  v_org_id uuid;
BEGIN
  v_user_id := auth.uid();
  v_org_id := (auth.jwt() -> 'app_metadata' ->> 'organization_id')::uuid;

  RETURN QUERY
  SELECT
    p.id,
    p.organization_id,
    p.name,
    p.description,
    p.usage_description,
    p.status::text,
    p.visibility::text,
    p.tags,
    p.created_by,
    prof.full_name,  -- ✅ FIXED: now from profiles table
    p.created_at,
    p.updated_at,
    p.published_at,
    COUNT(o.id) as operation_count
  FROM validai_processors p
  LEFT JOIN profiles prof ON prof.id = p.created_by  -- ✅ FIXED: was validai_profiles
  LEFT JOIN validai_operations o ON o.processor_id = p.id
  WHERE p.organization_id = v_org_id
    AND p.deleted_at IS NULL
    AND (
      p.visibility = 'organization'
      OR (p.visibility = 'personal' AND p.created_by = v_user_id)
    )
  GROUP BY p.id, prof.full_name
  ORDER BY p.updated_at DESC;
END;
$$;

COMMENT ON FUNCTION get_user_processors() IS
  'Updated to use platform profiles table - Phase 2 Legacy Cleanup (2025-11-03)';

-- -----------------------------------------------------------------------------
-- FUNCTION 4: get_user_processors_debug
-- -----------------------------------------------------------------------------
-- Purpose: Debug version with detailed authorization info
-- Updated: validai_profiles → profiles

CREATE OR REPLACE FUNCTION get_user_processors_debug()
RETURNS TABLE (
  processor_id uuid,
  processor_name text,
  processor_visibility text,
  processor_created_by uuid,
  creator_name text,
  current_user_id uuid,
  current_org_id uuid,
  processor_org_id uuid,
  is_creator boolean,
  visibility_check text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid;
  v_org_id uuid;
BEGIN
  v_user_id := auth.uid();
  v_org_id := (auth.jwt() -> 'app_metadata' ->> 'organization_id')::uuid;

  RETURN QUERY
  SELECT
    p.id,
    p.name,
    p.visibility::text,
    p.created_by,
    prof.full_name,  -- ✅ FIXED: now from profiles table
    v_user_id,
    v_org_id,
    p.organization_id,
    (p.created_by = v_user_id) as is_creator,
    CASE
      WHEN p.visibility = 'organization' THEN 'visible to all org members'
      WHEN p.visibility = 'personal' AND p.created_by = v_user_id THEN 'visible to creator only (YOU)'
      WHEN p.visibility = 'personal' AND p.created_by != v_user_id THEN 'hidden (not creator)'
      ELSE 'unknown'
    END as visibility_check
  FROM validai_processors p
  LEFT JOIN profiles prof ON prof.id = p.created_by  -- ✅ FIXED: was validai_profiles
  WHERE p.organization_id = v_org_id
    AND p.deleted_at IS NULL
  ORDER BY p.updated_at DESC;
END;
$$;

COMMENT ON FUNCTION get_user_processors_debug() IS
  'Updated to use platform profiles table - Phase 2 Legacy Cleanup (2025-11-03)';

-- -----------------------------------------------------------------------------
-- DATA VERIFICATION
-- -----------------------------------------------------------------------------
-- Verify all profile data exists in platform table

DO $$
DECLARE
  v_missing_profiles int;
BEGIN
  -- Check for any profiles in legacy table not in platform table
  SELECT COUNT(*) INTO v_missing_profiles
  FROM validai_profiles vp
  WHERE NOT EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = vp.id
  );

  IF v_missing_profiles > 0 THEN
    RAISE WARNING '⚠️  Found % profiles in legacy table not in platform table', v_missing_profiles;
    -- Copy missing profiles
    INSERT INTO profiles (id, full_name, avatar_url, created_at, updated_at)
    SELECT id, full_name, avatar_url, created_at, updated_at
    FROM validai_profiles vp
    WHERE NOT EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = vp.id
    );
    RAISE NOTICE '   - Copied % missing profiles to platform table', v_missing_profiles;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- VERIFICATION
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_functions_fixed int := 0;
  v_profiles_synced int := 0;
BEGIN
  -- Verify functions updated
  SELECT COUNT(*) INTO v_functions_fixed
  FROM information_schema.routines
  WHERE routine_schema = 'public'
    AND routine_name IN (
      'handle_new_user',
      'get_processor_with_operations',
      'get_user_processors',
      'get_user_processors_debug'
    )
    AND routine_definition NOT LIKE '%validai_profiles%'
    AND routine_definition NOT LIKE '%validai_organizations%'
    AND routine_definition NOT LIKE '%validai_organization_members%';

  -- Count synced profiles
  SELECT COUNT(*) INTO v_profiles_synced
  FROM profiles;

  RAISE NOTICE '✅ Phase 2 Complete: User/Profile Functions';
  RAISE NOTICE '   - Functions fixed: %/4', v_functions_fixed;
  RAISE NOTICE '   - Profiles in platform table: %', v_profiles_synced;

  IF v_functions_fixed < 4 THEN
    RAISE WARNING '⚠️  Expected 4 functions fixed, found %', v_functions_fixed;
  END IF;
END $$;
