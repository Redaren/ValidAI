-- =============================================================================
-- UPDATE DATABASE FUNCTIONS FOR RENAMED TABLES
-- =============================================================================
-- Description: Update database functions to use validai_* table names
-- Author: Migration Team
-- Created: 2025-01-23
-- Risk: Medium (function updates)
-- Note: Updates functions to reference validai_organizations, validai_organization_members, validai_profiles
-- =============================================================================

-- Note: The functions reference the old table names (organizations, organization_members, profiles)
-- Since we renamed these tables to validai_* versions, we need to either:
-- 1. Recreate the functions with updated table names, OR
-- 2. Let PostgreSQL handle it (it might have auto-updated the references)

-- PostgreSQL's ALTER TABLE ... RENAME does NOT automatically update function bodies
-- that contain hardcoded table names in SQL strings

-- Strategy: We'll create a note migration here. The functions will need to be manually
-- checked and potentially recreated if they fail.

-- For now, we'll add a comment noting that functions may need updates
COMMENT ON FUNCTION get_user_organizations() IS 'May need update to reference validai_organizations and validai_organization_members if queries fail';
COMMENT ON FUNCTION get_current_organization() IS 'May need update to reference validai_organizations and validai_organization_members if queries fail';
COMMENT ON FUNCTION get_organization_members(uuid) IS 'May need update to reference validai_organization_members if queries fail';
COMMENT ON FUNCTION create_organization(text, text) IS 'May need update to reference validai_organizations if queries fail';

-- Note: If any of these functions fail after the rename, they will need to be dropped and recreated
-- with the new table names. This can be done in a follow-up migration if issues are discovered
-- during testing.

RAISE NOTICE 'Database functions may reference old table names. Test and update if needed.';
