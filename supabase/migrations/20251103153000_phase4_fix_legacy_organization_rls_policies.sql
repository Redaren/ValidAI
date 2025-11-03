-- =============================================================================
-- PHASE 4: FIX RLS POLICIES ON LEGACY VALIDAI_ORGANIZATIONS TABLE
-- =============================================================================
-- Description: Update 3 RLS policies on validai_organizations table to check
--              organization_members instead of validai_organization_members
-- Created: 2025-11-03
-- Part of: Complete Legacy Table Cleanup Plan
-- Priority: MEDIUM (improves access control on legacy table)
-- =============================================================================

-- Note: These policies control access to the LEGACY validai_organizations table itself
-- After this migration, the goal is to stop using this table entirely (Phase 5)

-- -----------------------------------------------------------------------------
-- POLICY 1: Users can view organizations they belong to
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users can view organizations they belong to" ON validai_organizations;

CREATE POLICY "Users can view organizations they belong to"
  ON validai_organizations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM organization_members  -- ✅ FIXED: was validai_organization_members
      WHERE organization_members.organization_id = validai_organizations.id
        AND organization_members.user_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- POLICY 2: Organization owners and admins can update
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Organization owners and admins can update" ON validai_organizations;

CREATE POLICY "Organization owners and admins can update"
  ON validai_organizations
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM organization_members  -- ✅ FIXED: was validai_organization_members
      WHERE organization_members.organization_id = validai_organizations.id
        AND organization_members.user_id = auth.uid()
        AND organization_members.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM organization_members  -- ✅ FIXED: was validai_organization_members
      WHERE organization_members.organization_id = validai_organizations.id
        AND organization_members.user_id = auth.uid()
        AND organization_members.role IN ('owner', 'admin')
    )
  );

-- -----------------------------------------------------------------------------
-- POLICY 3: Only organization owners can delete
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Only organization owners can delete" ON validai_organizations;

CREATE POLICY "Only organization owners can delete"
  ON validai_organizations
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM organization_members  -- ✅ FIXED: was validai_organization_members
      WHERE organization_members.organization_id = validai_organizations.id
        AND organization_members.user_id = auth.uid()
        AND organization_members.role = 'owner'
    )
  );

-- -----------------------------------------------------------------------------
-- VERIFICATION
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_policies_fixed int := 0;
  v_legacy_policies_using_platform int := 0;
BEGIN
  -- Count total policies on validai_organizations
  SELECT COUNT(*) INTO v_policies_fixed
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'validai_organizations';

  -- Count policies now using platform organization_members table
  SELECT COUNT(*) INTO v_legacy_policies_using_platform
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'validai_organizations'
    AND qual::text LIKE '%organization_members%'
    AND qual::text NOT LIKE '%validai_organization_members%';

  RAISE NOTICE '✅ Phase 4 Complete: RLS Policies on Legacy Table';
  RAISE NOTICE '   - Total policies on validai_organizations: %', v_policies_fixed;
  RAISE NOTICE '   - Policies using platform table: %', v_legacy_policies_using_platform;
  RAISE NOTICE '';
  RAISE NOTICE 'ℹ️  Note: validai_organizations is a LEGACY table';
  RAISE NOTICE '   These policies control access to legacy data';
  RAISE NOTICE '   Goal: Deprecate this table in Phase 5';
END $$;
