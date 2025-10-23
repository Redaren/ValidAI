-- =============================================================================
-- VALIDAI REMAINING TABLES RENAME MIGRATION (CORRECTIVE)
-- =============================================================================
-- Description: Rename remaining ValidAI platform-like tables with validai_ prefix
-- Author: Migration Team
-- Created: 2025-01-23
-- Risk: Medium (table renames, database function updates required)
-- Rollback: Rename tables back to original names
-- Note: This corrects the incomplete migration from 20250123000000
-- =============================================================================

-- -----------------------------------------------------------------------------
-- RENAME REMAINING TABLES
-- -----------------------------------------------------------------------------

-- Platform-like tables that belong to ValidAI app (not Playze Core platform)
ALTER TABLE organizations RENAME TO validai_organizations;
ALTER TABLE organization_members RENAME TO validai_organization_members;
ALTER TABLE profiles RENAME TO validai_profiles;

-- -----------------------------------------------------------------------------
-- VERIFY RENAMES
-- -----------------------------------------------------------------------------

-- Check all tables exist with new names
DO $$
BEGIN
  -- Verify each table exists
  ASSERT (SELECT EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = 'validai_organizations'
  )), 'validai_organizations table not found';

  ASSERT (SELECT EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = 'validai_organization_members'
  )), 'validai_organization_members table not found';

  ASSERT (SELECT EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = 'validai_profiles'
  )), 'validai_profiles table not found';

  RAISE NOTICE 'All remaining tables renamed successfully!';
  RAISE NOTICE 'Total ValidAI tables now with validai_ prefix: 10';
END $$;

-- -----------------------------------------------------------------------------
-- NOTES ON AUTOMATIC UPDATES
-- -----------------------------------------------------------------------------
-- PostgreSQL automatically updates:
-- - Foreign key constraints (already pointing to these tables from validai_* tables)
-- - Indexes (table references)
-- - RLS policies (table references in USING/WITH CHECK clauses)
--
-- Manual updates required:
-- - Database functions that reference these tables directly
-- - Application code (.from('organizations') calls)
-- -----------------------------------------------------------------------------
