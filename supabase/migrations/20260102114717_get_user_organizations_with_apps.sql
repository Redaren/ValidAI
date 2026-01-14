-- Migration: Add function to get user's organizations with their accessible apps
-- Purpose: Support multi-org login flow by returning all orgs a user belongs to with their active app subscriptions

-- This function is used by auth callbacks to determine:
-- 1. If user has 0 orgs → redirect to login with error
-- 2. If user has 1 org → auto-select and call switch-organization
-- 3. If user has 2+ orgs → show org picker in login page

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
    AND o.is_active = true;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_user_organizations_with_apps(uuid) TO authenticated;

-- Add comment for documentation
COMMENT ON FUNCTION public.get_user_organizations_with_apps IS 'Returns all organizations a user belongs to along with their active app subscriptions. Used by auth callbacks to determine login flow (0 orgs = error, 1 org = auto-select, 2+ orgs = show picker).';
