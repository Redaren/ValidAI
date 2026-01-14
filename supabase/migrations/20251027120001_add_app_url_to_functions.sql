-- Migration: Add app_url to database functions
-- Created: 2025-10-27
-- Purpose: Update get_organization_apps() and get_user_apps_with_admin() to return app_url
--
-- Background:
-- The AppSwitcher component needs app URLs from the database instead of hardcoded mappings.
-- This migration updates both functions to include app_url in their return types.
--
-- Functions Updated:
-- 1. get_organization_apps() - Add app_url to return type and SELECT
-- 2. get_user_apps_with_admin() - Add app_url to return type and both SELECT statements

-- -----------------------------------------------------------------------------
-- 1. Update get_organization_apps() to include app_url
-- -----------------------------------------------------------------------------

-- Drop existing function first (can't change return type with CREATE OR REPLACE)
DROP FUNCTION IF EXISTS get_organization_apps(uuid);

CREATE OR REPLACE FUNCTION get_organization_apps(org_id uuid DEFAULT NULL)
RETURNS TABLE (
  app_id text,
  app_name text,
  app_description text,
  app_url text,              -- NEW: App URL for navigation
  tier_name text,
  tier_display_name text,
  status text,
  features jsonb,
  limits jsonb,
  current_usage jsonb
) AS $$
DECLARE
  target_org_id uuid;
BEGIN
  -- Use provided org_id or fall back to current user's org
  target_org_id := COALESCE(org_id, public.user_organization_id());

  -- Verify user has access to this organization
  IF NOT EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_id = target_org_id
      AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied: Not a member of this organization';
  END IF;

  RETURN QUERY
  SELECT
    a.id,
    a.name,
    a.description,
    a.app_url,               -- NEW: Include app_url from apps table
    oas.tier_name,
    at.display_name,
    oas.status,
    at.features,
    at.limits,
    COALESCE(
      (SELECT jsonb_object_agg(usage_type, quantity)
       FROM organization_app_usage
       WHERE subscription_id = oas.id
         AND period_start >= date_trunc('month', now())
         AND period_end <= date_trunc('month', now()) + interval '1 month'),
      '{}'::jsonb
    ) AS current_usage
  FROM organization_app_subscriptions oas
  JOIN apps a ON a.id = oas.app_id
  JOIN app_tiers at ON at.id = oas.tier_id
  WHERE oas.organization_id = target_org_id
    AND oas.status = 'active'
    AND a.is_active = true   -- NEW: Only return active apps
  ORDER BY a.name;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION get_organization_apps(uuid) IS
'Returns organization''s app subscriptions with features, limits, usage, and URLs.
Parameters:
  org_id - Organization UUID (optional, defaults to current user''s org)
Returns: TABLE with app details, tier info, usage metrics, and app_url
Access: Organization members via PostgREST
Client usage: supabase.rpc("get_organization_apps", { org_id: "..." })';

-- -----------------------------------------------------------------------------
-- 2. Update get_user_apps_with_admin() to include app_url
-- -----------------------------------------------------------------------------

-- Drop existing function first (can't change return type with CREATE OR REPLACE)
DROP FUNCTION IF EXISTS get_user_apps_with_admin();

CREATE OR REPLACE FUNCTION get_user_apps_with_admin()
RETURNS TABLE (
  app_id text,
  app_name text,
  app_description text,
  app_url text,              -- NEW: App URL for navigation
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
  -- Uses existing get_organization_apps() which now includes app_url
  RETURN QUERY
  SELECT
    a.app_id,
    a.app_name,
    a.app_description,
    a.app_url,               -- NEW: Include app_url from get_organization_apps()
    a.tier_name,
    a.tier_display_name,
    a.status,
    a.features,
    a.limits,
    a.current_usage,
    false as is_platform_app  -- Mark as subscribed app
  FROM get_organization_apps() a;

  -- Step 2: If user is platform admin, append Admin Portal
  IF is_playze_admin() THEN
    RETURN QUERY
    SELECT
      'admin'::text as app_id,
      'Admin Portal'::text as app_name,
      'Platform administration interface'::text as app_description,
      'http://localhost:3001'::text as app_url,  -- NEW: Admin portal URL
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

COMMENT ON FUNCTION get_user_apps_with_admin() IS
'Returns user''s accessible apps: organization subscriptions + Admin Portal (for admins only).

Combines two existing functions:
1. get_organization_apps() - Returns org''s subscribed apps with tier details and URLs
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
- app_url: Full URL for navigation (e.g., http://localhost:3002)

Example:
Regular user sees: [RoadCloud (http://localhost:3002)]
Platform admin sees: [Admin Portal (http://localhost:3001), RoadCloud (http://localhost:3002)]';

-- -----------------------------------------------------------------------------
-- Expected State After Migration:
-- - get_organization_apps() returns app_url field
-- - get_user_apps_with_admin() returns app_url field
-- - Admin Portal URL: http://localhost:3001
-- - All subscribed apps include their app_url from apps table
-- -----------------------------------------------------------------------------
