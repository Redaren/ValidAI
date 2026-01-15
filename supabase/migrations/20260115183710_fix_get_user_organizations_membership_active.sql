-- =============================================================================
-- FIX: Add membership is_active filter to get_user_organizations()
-- =============================================================================
-- Bug: OrgSwitcher showed organizations where membership was deactivated
-- Root cause: get_user_organizations() only filtered org.is_active, not member.is_active
-- Fix: Add om.is_active = true to WHERE clause
-- =============================================================================

CREATE OR REPLACE FUNCTION get_user_organizations()
RETURNS TABLE (
  organization_id uuid,
  organization_name text,
  organization_description text,
  user_role text,
  joined_at timestamptz,
  is_active boolean
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    o.id,
    o.name,
    o.description,
    om.role,
    om.joined_at,
    o.is_active
  FROM organizations o
  JOIN organization_members om ON om.organization_id = o.id
  WHERE om.user_id = auth.uid()
    AND o.is_active = true
    AND om.is_active = true  -- FIX: Filter deactivated memberships
  ORDER BY o.name;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION get_user_organizations() IS
'Returns all active organizations where the current user has an active membership.
Filters: org.is_active = true AND membership.is_active = true
Used by: OrgSwitcher, useUserOrganizations hook';
