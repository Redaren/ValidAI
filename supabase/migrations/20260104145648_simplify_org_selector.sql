-- Migration: Simplify organization selector for login flow
-- Purpose:
--   1. Add default_app_url to get_user_organizations_with_apps() return
--   2. Filter out organizations with no active subscriptions
--
-- This supports the simplified org picker UX where users see only org names
-- and are redirected to the org's default app after selection.

-- =============================================================================
-- UPDATE get_user_organizations_with_apps() FUNCTION
-- =============================================================================

-- Drop existing function first (changing return type requires this)
DROP FUNCTION IF EXISTS public.get_user_organizations_with_apps(uuid);

CREATE FUNCTION public.get_user_organizations_with_apps(p_user_id uuid)
RETURNS TABLE (
  organization_id uuid,
  organization_name text,
  user_role text,
  accessible_apps text[],
  is_active boolean,
  default_app_url text  -- NEW: URL of org's default app for redirect
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
    o.is_active,
    default_app.app_url  -- NEW: Get default app URL
  FROM organization_members om
  JOIN organizations o ON o.id = om.organization_id
  LEFT JOIN apps default_app ON default_app.id = o.default_app_id  -- NEW: Join to get default app URL
  WHERE om.user_id = p_user_id
    AND o.is_active = true
    AND om.is_active = true
    AND EXISTS (  -- NEW: Only include orgs with at least one active subscription
      SELECT 1 FROM organization_app_subscriptions oas
      JOIN apps a ON a.id = oas.app_id
      WHERE oas.organization_id = o.id
        AND oas.status = 'active'
        AND a.is_active = true
    );
END;
$$;

-- Update comment to document the new functionality
COMMENT ON FUNCTION public.get_user_organizations_with_apps IS
'Returns all organizations a user belongs to along with their active app subscriptions and default app URL.
Filters by:
  - organization.is_active = true
  - organization_members.is_active = true
  - At least one active app subscription exists
Used by login flow org picker to show only valid organizations and redirect to default app.';
