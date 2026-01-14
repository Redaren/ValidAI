-- Migration: Add functions for app access control
-- Purpose: Support JWT-based app access checking by storing accessible apps in metadata

-- Function to get list of active app IDs for an organization
-- Used by Edge Functions to populate app_metadata.accessible_apps
CREATE OR REPLACE FUNCTION public.get_org_accessible_apps(org_id uuid)
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  RETURN ARRAY(
    SELECT oas.app_id
    FROM organization_app_subscriptions oas
    JOIN apps a ON a.id = oas.app_id
    WHERE oas.organization_id = org_id
      AND oas.status = 'active'
      AND a.is_active = true
  );
END;
$$;

-- Grant execute to authenticated users (Edge Functions use service role anyway)
GRANT EXECUTE ON FUNCTION public.get_org_accessible_apps(uuid) TO authenticated;

-- Function to get detailed app info for accessible apps
-- Used by unauthorized page to show app switcher with names and URLs
CREATE OR REPLACE FUNCTION public.get_user_accessible_apps(org_id uuid)
RETURNS TABLE (app_id text, app_name text, app_url text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT a.id, a.name, a.app_url
  FROM organization_app_subscriptions oas
  JOIN apps a ON a.id = oas.app_id
  WHERE oas.organization_id = org_id
    AND oas.status = 'active'
    AND a.is_active = true;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.get_user_accessible_apps(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_org_accessible_apps(uuid) IS
'Returns array of app IDs that an organization has active subscriptions for. Used to populate JWT app_metadata.accessible_apps.';

COMMENT ON FUNCTION public.get_user_accessible_apps(uuid) IS
'Returns detailed app info (id, name, url) for apps the organization can access. Used by unauthorized page to show app switcher.';
