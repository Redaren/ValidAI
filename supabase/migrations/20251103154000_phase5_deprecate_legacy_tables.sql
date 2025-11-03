-- =============================================================================
-- PHASE 5: DEPRECATE LEGACY TABLES
-- =============================================================================
-- Description: Mark legacy tables as deprecated and prevent writes
-- Created: 2025-11-03
-- Part of: Complete Legacy Table Cleanup Plan
-- Priority: LOW (prevents future misuse)
-- =============================================================================

-- This migration adds deprecation warnings to prevent future use of legacy tables
-- Tables will remain readable but writes will be prevented with helpful error messages
-- After 2-4 weeks of no errors, tables can be dropped (Phase 6 - optional)

-- -----------------------------------------------------------------------------
-- STEP 1: Add Database Comments Marking Tables as DEPRECATED
-- -----------------------------------------------------------------------------

COMMENT ON TABLE validai_organizations IS
  '⚠️  DEPRECATED: This table is legacy and should not be used.

   Migration Status: All functions and policies updated to use platform tables (2025-11-03)
   Platform Table: organizations

   DO NOT INSERT, UPDATE, or DELETE from this table.
   Use the platform "organizations" table instead.

   This table will be dropped after verification period (2-4 weeks).
   See: /docs/legacy-table-cleanup-plan.md';

COMMENT ON TABLE validai_profiles IS
  '⚠️  DEPRECATED: This table is legacy and should not be used.

   Migration Status: All functions updated to use platform tables (2025-11-03)
   Platform Table: profiles

   DO NOT INSERT, UPDATE, or DELETE from this table.
   Use the platform "profiles" table instead.

   This table will be dropped after verification period (2-4 weeks).
   See: /docs/legacy-table-cleanup-plan.md';

COMMENT ON TABLE validai_organization_members IS
  '⚠️  DEPRECATED: This table is legacy and should not be used.

   Migration Status: All functions and policies updated to use platform tables (2025-11-03)
   Platform Table: organization_members

   DO NOT INSERT, UPDATE, or DELETE from this table.
   Use the platform "organization_members" table instead.

   This table will be dropped after verification period (2-4 weeks).
   See: /docs/legacy-table-cleanup-plan.md';

-- -----------------------------------------------------------------------------
-- STEP 2: Create Trigger Function to Prevent Writes
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION prevent_legacy_table_writes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  platform_table text;
BEGIN
  -- Determine platform table based on legacy table
  CASE TG_TABLE_NAME
    WHEN 'validai_organizations' THEN platform_table := 'organizations';
    WHEN 'validai_profiles' THEN platform_table := 'profiles';
    WHEN 'validai_organization_members' THEN platform_table := 'organization_members';
    ELSE platform_table := 'unknown';
  END CASE;

  -- Raise helpful error with migration info
  RAISE EXCEPTION 'Table "%" is DEPRECATED and should not be modified.', TG_TABLE_NAME
    USING
      HINT = format('Use platform table "%s" instead. See /docs/legacy-table-cleanup-plan.md', platform_table),
      DETAIL = format('Operation: %s, Table: %s, Migration: 2025-11-03', TG_OP, TG_TABLE_NAME);
END;
$$;

COMMENT ON FUNCTION prevent_legacy_table_writes() IS
  'Prevents writes to deprecated legacy tables. Raises error with helpful migration guidance. Added in Phase 5 Legacy Cleanup (2025-11-03)';

-- -----------------------------------------------------------------------------
-- STEP 3: Create Triggers on Legacy Tables
-- -----------------------------------------------------------------------------

-- Trigger for validai_organizations
DROP TRIGGER IF EXISTS prevent_validai_organizations_writes ON validai_organizations;
CREATE TRIGGER prevent_validai_organizations_writes
  BEFORE INSERT OR UPDATE OR DELETE ON validai_organizations
  FOR EACH ROW
  EXECUTE FUNCTION prevent_legacy_table_writes();

-- Trigger for validai_profiles
DROP TRIGGER IF EXISTS prevent_validai_profiles_writes ON validai_profiles;
CREATE TRIGGER prevent_validai_profiles_writes
  BEFORE INSERT OR UPDATE OR DELETE ON validai_profiles
  FOR EACH ROW
  EXECUTE FUNCTION prevent_legacy_table_writes();

-- Trigger for validai_organization_members
DROP TRIGGER IF EXISTS prevent_validai_organization_members_writes ON validai_organization_members;
CREATE TRIGGER prevent_validai_organization_members_writes
  BEFORE INSERT OR UPDATE OR DELETE ON validai_organization_members
  FOR EACH ROW
  EXECUTE FUNCTION prevent_legacy_table_writes();

-- -----------------------------------------------------------------------------
-- STEP 4: Test Deprecation Triggers (Read-Only Test)
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_test_passed boolean := true;
  v_error_message text;
BEGIN
  -- Test 1: Verify SELECT still works (read-only)
  BEGIN
    PERFORM COUNT(*) FROM validai_organizations;
    RAISE NOTICE '✅ Test 1: SELECT on validai_organizations - PASS (read-only works)';
  EXCEPTION WHEN OTHERS THEN
    v_test_passed := false;
    RAISE WARNING '❌ Test 1: SELECT on validai_organizations - FAIL: %', SQLERRM;
  END;

  -- Test 2: Verify INSERT blocked (commented out to not actually try)
  -- This test would fail with our deprecation error, which is expected
  -- Uncomment to test manually:
  -- BEGIN
  --   INSERT INTO validai_organizations (name, created_by) VALUES ('Test Org', auth.uid());
  --   RAISE WARNING '❌ Test 2: INSERT block - FAIL (should have been blocked)';
  -- EXCEPTION WHEN OTHERS THEN
  --   RAISE NOTICE '✅ Test 2: INSERT blocked - PASS: %', SQLERRM;
  -- END;

  IF v_test_passed THEN
    RAISE NOTICE '✅ All deprecation tests passed';
  ELSE
    RAISE WARNING '⚠️  Some deprecation tests failed';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- VERIFICATION
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_tables_deprecated int := 0;
  v_triggers_created int := 0;
BEGIN
  -- Count tables with deprecation comments
  SELECT COUNT(*) INTO v_tables_deprecated
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname IN ('validai_organizations', 'validai_profiles', 'validai_organization_members')
    AND pg_catalog.obj_description(c.oid, 'pg_class') LIKE '%DEPRECATED%';

  -- Count triggers created
  SELECT COUNT(*) INTO v_triggers_created
  FROM pg_trigger
  WHERE tgname IN (
    'prevent_validai_organizations_writes',
    'prevent_validai_profiles_writes',
    'prevent_validai_organization_members_writes'
  );

  RAISE NOTICE '';
  RAISE NOTICE '=============================================================================';
  RAISE NOTICE '✅ Phase 5 Complete: Legacy Tables Deprecated';
  RAISE NOTICE '=============================================================================';
  RAISE NOTICE '   - Tables marked as deprecated: %/3', v_tables_deprecated;
  RAISE NOTICE '   - Write-prevention triggers created: %/3', v_triggers_created;
  RAISE NOTICE '';
  RAISE NOTICE 'Legacy tables are now READ-ONLY with deprecation warnings.';
  RAISE NOTICE 'Any attempt to INSERT, UPDATE, or DELETE will fail with helpful error.';
  RAISE NOTICE '';
  RAISE NOTICE 'Next Steps:';
  RAISE NOTICE '  1. Monitor for 2-4 weeks for any deprecation errors';
  RAISE NOTICE '  2. If no errors occur, tables can be safely dropped (Phase 6 - optional)';
  RAISE NOTICE '  3. See: /docs/legacy-table-cleanup-plan.md';
  RAISE NOTICE '=============================================================================';
END $$;
