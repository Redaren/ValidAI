-- =============================================================================
-- PHASE 3: FIX ORGANIZATION FUNCTIONS TO USE PLATFORM TABLES
-- =============================================================================
-- Description: Update 3 functions that manage organizations
-- Created: 2025-11-03
-- Part of: Complete Legacy Table Cleanup Plan
-- Priority: HIGH (affects org creation flow)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- FUNCTION 1: create_organization
-- -----------------------------------------------------------------------------
-- Purpose: Create new organization with user as owner
-- Updated: validai_organizations → organizations
--          validai_organization_members → organization_members

CREATE OR REPLACE FUNCTION create_organization(
  org_name text,
  org_slug text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  new_org_id UUID;
  final_slug TEXT;
  result json;
BEGIN
  -- Validate user is authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  -- Note: Platform organizations table doesn't have slug column
  -- Organizations are identified by UUID only

  -- Create organization in PLATFORM table
  INSERT INTO organizations (name, created_by)  -- ✅ FIXED: was validai_organizations (removed slug)
  VALUES (org_name, auth.uid())
  RETURNING id INTO new_org_id;

  -- Add creator as owner in PLATFORM table
  INSERT INTO organization_members (organization_id, user_id, role)  -- ✅ FIXED: was validai_organization_members
  VALUES (new_org_id, auth.uid(), 'owner');

  -- Return the created organization
  SELECT row_to_json(o.*) INTO result
  FROM organizations o  -- ✅ FIXED: was validai_organizations
  WHERE o.id = new_org_id;

  RETURN result;
END;
$$;

COMMENT ON FUNCTION create_organization(text, text) IS
  'Updated to use platform organizations and organization_members tables - Phase 3 Legacy Cleanup (2025-11-03). Note: slug parameter deprecated as platform table does not use slugs.';

-- -----------------------------------------------------------------------------
-- FUNCTION 2: generate_unique_org_slug
-- -----------------------------------------------------------------------------
-- Purpose: Generate unique slug for organization
-- Updated: validai_organizations → organizations
-- NOTE: This function is now deprecated as platform table doesn't use slugs

CREATE OR REPLACE FUNCTION generate_unique_org_slug(base_slug text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  final_slug text;
  counter int := 0;
BEGIN
  -- Note: Platform organizations table doesn't have slug column
  -- This function is kept for backward compatibility but returns the input
  -- Organizations are now identified by UUID only

  RETURN base_slug;

  -- Legacy implementation (commented out):
  -- final_slug := lower(regexp_replace(base_slug, '[^a-zA-Z0-9-]', '-', 'g'));
  -- WHILE EXISTS (SELECT 1 FROM organizations WHERE slug = final_slug) LOOP
  --   counter := counter + 1;
  --   final_slug := lower(regexp_replace(base_slug, '[^a-zA-Z0-9-]', '-', 'g')) || '-' || counter::text;
  -- END LOOP;
  -- RETURN final_slug;
END;
$$;

COMMENT ON FUNCTION generate_unique_org_slug(text) IS
  'DEPRECATED - Platform organizations table does not use slugs. Returns input unchanged for backward compatibility. Phase 3 Legacy Cleanup (2025-11-03)';

-- -----------------------------------------------------------------------------
-- FUNCTION 3: user_can_view_org_members
-- -----------------------------------------------------------------------------
-- Purpose: Check if user can view organization members
-- Updated: validai_organization_members → organization_members

CREATE OR REPLACE FUNCTION user_can_view_org_members(
  user_uuid uuid,
  org_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- User can view members if they are a member of the organization
  RETURN EXISTS (
    SELECT 1
    FROM organization_members om  -- ✅ FIXED: was validai_organization_members
    WHERE om.user_id = user_uuid
    AND om.organization_id = org_id
  );
END;
$$;

COMMENT ON FUNCTION user_can_view_org_members(uuid, uuid) IS
  'Updated to use platform organization_members table - Phase 3 Legacy Cleanup (2025-11-03)';

-- -----------------------------------------------------------------------------
-- DATA VERIFICATION
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_missing_orgs int;
  v_missing_members int;
BEGIN
  -- Check for any organizations in legacy table not in platform table
  SELECT COUNT(*) INTO v_missing_orgs
  FROM validai_organizations vo
  WHERE NOT EXISTS (
    SELECT 1 FROM organizations o WHERE o.id = vo.id
  );

  IF v_missing_orgs > 0 THEN
    RAISE WARNING '⚠️  Found % organizations in legacy table not in platform table', v_missing_orgs;
    -- Copy missing organizations
    INSERT INTO organizations (id, name, is_active, created_at, updated_at, created_by, llm_configuration)
    SELECT id, name, true, created_at, updated_at, created_by, llm_configuration
    FROM validai_organizations vo
    WHERE NOT EXISTS (
      SELECT 1 FROM organizations o WHERE o.id = vo.id
    );
    RAISE NOTICE '   - Copied % missing organizations to platform table', v_missing_orgs;
  END IF;

  -- Check for any members in legacy table not in platform table
  SELECT COUNT(*) INTO v_missing_members
  FROM validai_organization_members vom
  WHERE NOT EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = vom.organization_id
      AND om.user_id = vom.user_id
  );

  IF v_missing_members > 0 THEN
    RAISE WARNING '⚠️  Found % members in legacy table not in platform table', v_missing_members;
    -- Copy missing members
    INSERT INTO organization_members (organization_id, user_id, role, joined_at)
    SELECT organization_id, user_id, role, joined_at
    FROM validai_organization_members vom
    WHERE NOT EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = vom.organization_id
        AND om.user_id = vom.user_id
    );
    RAISE NOTICE '   - Copied % missing members to platform table', v_missing_members;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- VERIFICATION
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_functions_fixed int := 0;
  v_orgs_synced int := 0;
  v_members_synced int := 0;
BEGIN
  -- Verify functions updated (excluding generate_unique_org_slug which still mentions orgs in comments)
  SELECT COUNT(*) INTO v_functions_fixed
  FROM information_schema.routines
  WHERE routine_schema = 'public'
    AND routine_name IN (
      'create_organization',
      'user_can_view_org_members'
    )
    AND routine_definition NOT LIKE '%validai_organizations%'
    AND routine_definition NOT LIKE '%validai_organization_members%';

  -- Count synced data
  SELECT COUNT(*) INTO v_orgs_synced FROM organizations;
  SELECT COUNT(*) INTO v_members_synced FROM organization_members;

  RAISE NOTICE '✅ Phase 3 Complete: Organization Functions';
  RAISE NOTICE '   - Functions fixed: %/3 (generate_unique_org_slug deprecated)', v_functions_fixed;
  RAISE NOTICE '   - Organizations in platform table: %', v_orgs_synced;
  RAISE NOTICE '   - Members in platform table: %', v_members_synced;

  IF v_functions_fixed < 2 THEN
    RAISE WARNING '⚠️  Expected 2 functions fixed, found %', v_functions_fixed;
  END IF;
END $$;
