-- Migration: Enforce is_active check on organization_members during login/org-switch
-- Purpose: Deactivated members should not see or access organizations they've been deactivated from
--
-- This migration updates get_user_organizations_with_apps() to filter by om.is_active = true
-- The validateOrgMembership() Edge Function is updated separately in _shared/auth.ts

-- =============================================================================
-- UPDATE get_user_organizations_with_apps() FUNCTION
-- =============================================================================
-- Add om.is_active = true to WHERE clause so deactivated members don't see orgs at login

CREATE OR REPLACE FUNCTION public.get_user_organizations_with_apps(p_user_id uuid)
RETURNS TABLE (
  organization_id uuid,
  organization_name text,
  user_role text,
  accessible_apps text[],
  is_active boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    o.id,
    o.name,
    om.role,
    COALESCE(
      ARRAY(
        SELECT oas.app_id
        FROM organization_app_subscriptions oas
        JOIN apps a ON a.id = oas.app_id
        WHERE oas.organization_id = o.id
          AND oas.status = 'active'
          AND a.is_active = true
      ),
      '{}'::text[]
    ),
    o.is_active
  FROM organization_members om
  JOIN organizations o ON o.id = om.organization_id
  WHERE om.user_id = p_user_id
    AND o.is_active = true
    AND om.is_active = true;  -- NEW: Only return orgs where membership is active
END;
$$;

-- Update comment to document the is_active filtering
COMMENT ON FUNCTION public.get_user_organizations_with_apps IS
'Returns all organizations a user belongs to along with their active app subscriptions.
Filters by both organization.is_active and organization_members.is_active.
Used by auth callbacks to determine login flow (0 orgs = error, 1 org = auto-select, 2+ orgs = show picker).';
