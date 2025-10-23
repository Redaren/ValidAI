-- =============================================================================
-- FIX CURRENT ORGANIZATION QUERY
-- =============================================================================
-- Purpose: Fix infinite recursion in useCurrentOrganization() hook
-- Issue: Direct PostgREST query to organizations table triggers RLS recursion
-- Solution: Create SECURITY DEFINER function to bypass RLS (standard pattern)
-- Created: 2025-01-22
-- =============================================================================

-- -----------------------------------------------------------------------------
-- PROBLEM ANALYSIS
-- -----------------------------------------------------------------------------
-- useCurrentOrganization() queries organizations table directly via PostgREST:
--   1. Query organizations WHERE id = organization_id_from_jwt
--   2. RLS policy on organizations checks: EXISTS (SELECT FROM organization_members WHERE user_id = auth.uid())
--   3. RLS policy on organization_members checks: EXISTS (SELECT FROM organization_members AS om WHERE om.user_id = auth.uid())
--   4. PostgreSQL detects infinite recursion in policy evaluation
--   5. Query fails, hook stuck in "Loading..." state
--
-- Why OrgSwitcher works but Organization Context doesn't:
--   - OrgSwitcher uses get_user_organizations() which is SECURITY DEFINER (bypasses RLS)
--   - Organization Context uses direct PostgREST query (triggers RLS recursion)
--
-- Architectural Pattern (used throughout codebase):
--   - Simple queries → Direct PostgREST with RLS
--   - Complex/recursive queries → SECURITY DEFINER functions via RPC
--
-- Examples of SECURITY DEFINER pattern:
--   - get_user_organizations() (line 14-37, migration 20250117000003)
--   - get_organization_apps() (line 49-101, migration 20250117000003)
--   - All admin_*() functions (migration 20250120000005)
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- SOLUTION: Create SECURITY DEFINER Function
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_current_organization()
RETURNS TABLE (
  id uuid,
  name text,
  description text,
  is_active boolean,
  created_at timestamptz,
  updated_at timestamptz
) AS $$
DECLARE
  current_org_id uuid;
BEGIN
  -- Get organization_id from JWT metadata
  current_org_id := (auth.jwt() -> 'app_metadata' ->> 'organization_id')::uuid;

  -- Return empty result if no organization set in JWT
  IF current_org_id IS NULL THEN
    RETURN;
  END IF;

  -- Security check: Verify user is actually a member of this organization
  -- This prevents JWT tampering or stale JWT with old organization_id
  IF NOT EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_id = current_org_id
      AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied: User is not a member of organization specified in JWT';
  END IF;

  -- Return organization details
  -- SECURITY DEFINER bypasses RLS policies, preventing recursion
  RETURN QUERY
  SELECT
    o.id,
    o.name,
    o.description,
    o.is_active,
    o.created_at,
    o.updated_at
  FROM organizations o
  WHERE o.id = current_org_id;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION get_current_organization() IS
'Returns current active organization from JWT app_metadata.organization_id.
Uses SECURITY DEFINER to bypass RLS and avoid infinite recursion.
Validates user membership before returning data.
Returns: Single organization or empty result if no org set in JWT
Access: All authenticated users via PostgREST
Client usage: supabase.rpc("get_current_organization").single()
Used by: useCurrentOrganization() hook in @playze/shared-auth';

-- -----------------------------------------------------------------------------
-- VERIFICATION
-- -----------------------------------------------------------------------------
-- Test the function:
-- SELECT * FROM get_current_organization();
--
-- Should return:
-- - Current organization if user has organization_id in JWT and is a member
-- - Empty result if no organization_id in JWT
-- - Exception if organization_id in JWT but user is not a member
-- =============================================================================
