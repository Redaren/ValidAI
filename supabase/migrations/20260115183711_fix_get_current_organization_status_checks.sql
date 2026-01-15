-- =============================================================================
-- FIX: Add status checks to get_current_organization()
-- =============================================================================
-- Bug: useCurrentOrganization could return inactive org or deactivated membership
-- Root cause: Function only checked membership existence, not status fields
-- Fix:
--   1. Add om.is_active = true to membership validation
--   2. Add o.is_active = true to organization filter
-- =============================================================================

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

  -- Security check: Verify user is an ACTIVE member of this organization
  -- FIX: Added is_active = true check
  IF NOT EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_id = current_org_id
      AND user_id = auth.uid()
      AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Access denied: User is not an active member of this organization';
  END IF;

  -- Return only ACTIVE organization details
  -- FIX: Added is_active = true filter
  RETURN QUERY
  SELECT
    o.id,
    o.name,
    o.description,
    o.is_active,
    o.created_at,
    o.updated_at
  FROM organizations o
  WHERE o.id = current_org_id
    AND o.is_active = true;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION get_current_organization() IS
'Returns current organization from JWT if:
  1. Organization is active (is_active = true)
  2. User has active membership (membership.is_active = true)
Returns empty result if org inactive or membership deactivated.
Raises exception if user not a member at all.
Used by: useCurrentOrganization hook';
