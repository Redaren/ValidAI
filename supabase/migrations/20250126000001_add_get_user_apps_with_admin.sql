-- Migration: Add get_user_apps_with_admin() Function
-- Created: 2025-01-26
-- Purpose: Combine organization subscribed apps with Admin Portal (for platform admins only)
--
-- Background:
-- The AppSwitcher component needs to show:
-- 1. Organization's subscribed apps (from organization_app_subscriptions)
-- 2. Admin Portal (only for users in admin_users table)
--
-- This function combines get_organization_apps() with is_playze_admin() check
-- to return the complete list in a single secure database call.
--
-- Security:
-- - Admin check is server-side via is_playze_admin()
-- - SECURITY DEFINER allows bypassing RLS to check admin_users table
-- - Client cannot fake admin status
--
-- Performance:
-- - Single database call from client
-- - Reuses existing get_organization_apps() function (no code duplication)
-- - Reuses existing is_playze_admin() function (verified security)

-- -----------------------------------------------------------------------------
-- Function: get_user_apps_with_admin()
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_user_apps_with_admin()
RETURNS TABLE (
  app_id text,
  app_name text,
  app_description text,
  tier_name text,
  tier_display_name text,
  status text,
  features jsonb,
  limits jsonb,
  current_usage jsonb,
  is_platform_app boolean
) AS $$
BEGIN
  -- Step 1: Return organization's subscribed apps
  -- Uses existing get_organization_apps() which:
  -- - Verifies user is member of organization
  -- - Returns only active subscriptions
  -- - Includes tier details, features, limits, usage
  RETURN QUERY
  SELECT
    a.app_id,
    a.app_name,
    a.app_description,
    a.tier_name,
    a.tier_display_name,
    a.status,
    a.features,
    a.limits,
    a.current_usage,
    false as is_platform_app  -- Mark as subscribed app
  FROM get_organization_apps() a;

  -- Step 2: If user is platform admin, append Admin Portal
  -- Uses existing is_playze_admin() which:
  -- - Checks admin_users table by email
  -- - SECURITY DEFINER allows bypassing RLS
  -- - Returns boolean (cannot be faked by client)
  IF is_playze_admin() THEN
    RETURN QUERY
    SELECT
      'admin'::text as app_id,
      'Admin Portal'::text as app_name,
      'Platform administration interface'::text as app_description,
      'platform'::text as tier_name,
      'Platform Admin'::text as tier_display_name,
      'active'::text as status,
      '{}'::jsonb as features,      -- No tier features for platform app
      '{}'::jsonb as limits,         -- No limits for platform app
      '{}'::jsonb as current_usage,  -- No usage tracking for platform app
      true as is_platform_app        -- Mark as platform app
    ;
  END IF;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- -----------------------------------------------------------------------------
-- Comments
-- -----------------------------------------------------------------------------

COMMENT ON FUNCTION get_user_apps_with_admin() IS
'Returns user''s accessible apps: organization subscriptions + Admin Portal (for admins only).

Combines two existing functions:
1. get_organization_apps() - Returns org''s subscribed apps with tier details
2. is_playze_admin() - Checks if user is platform administrator

Security:
- SECURITY DEFINER: Allows checking admin_users table (bypasses RLS)
- Admin check is server-side: Client cannot fake admin status
- Membership check: Inherits from get_organization_apps()

Performance:
- Single database call from client
- Leverages existing functions (no duplication)
- 5-minute cache via TanStack Query (client-side)

Client usage:
- React hook: useUserAppsWithAdmin()
- Component: AppSwitcher

Returns:
- is_platform_app = false: Subscribed apps from organization
- is_platform_app = true: Admin Portal (only for platform admins)

Example:
Regular user sees: [TestApp, ValidAI]
Platform admin sees: [Admin Portal, TestApp, ValidAI]';

-- -----------------------------------------------------------------------------
-- Expected State After Migration:
-- Function: get_user_apps_with_admin() available for RPC calls
-- Security: Admin Portal only returned to users in admin_users table
-- Performance: Single query combining subscriptions + admin check
-- -----------------------------------------------------------------------------
