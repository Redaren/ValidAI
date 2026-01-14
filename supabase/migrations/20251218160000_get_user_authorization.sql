-- =============================================================================
-- PLAYZE CORE - PHASE 6: USER AUTHORIZATION FUNCTION
-- =============================================================================
-- Description: Unified authorization function for tier-based features and role-based permissions
-- Created: 2025-12-18
-- Security: SECURITY DEFINER to access subscription and tier data
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. HELPER: Get Role Permissions for App
-- -----------------------------------------------------------------------------
--
-- CURRENT STATUS (MVP - Phase 1): Hardcoded Default Permissions
-- -----------------------------------------------------------------------------
-- This function currently returns the SAME permissions for ALL apps based solely
-- on the user's role. The p_app_id parameter is accepted for future use but not
-- currently utilized in the permission logic.
--
-- WHY HARDCODED:
-- - Provides working MVP functionality immediately
-- - Establishes standard permission structure across platform
-- - Allows authorization system to function end-to-end
-- - Can be enhanced later without breaking existing code
--
-- FUTURE ARCHITECTURE (Phase 2): Per-App Role Permissions
-- -----------------------------------------------------------------------------
-- When apps need custom role permissions, implement Option B:
-- Add a role_permissions JSONB column to the apps table.
--
-- MIGRATION STEPS:
-- 1. Add column to apps table:
--    ALTER TABLE apps ADD COLUMN role_permissions jsonb DEFAULT '{
--      "owner": {"can_edit": true, "can_delete": true, "can_export": true, ...},
--      "admin": {"can_edit": true, "can_delete": true, "can_export": true, ...},
--      "member": {"can_edit": true, "can_delete": false, "can_export": false, ...},
--      "viewer": {"can_edit": false, "can_delete": false, "can_export": false, ...}
--    }'::jsonb;
--
-- 2. Update this function to query the column:
--    SELECT a.role_permissions -> p_role
--    FROM apps a
--    WHERE a.id = p_app_id
--
-- 3. If NULL or missing, fall back to the defaults below
--
-- WHY OPTION B (apps table column) INSTEAD OF SEPARATE TABLE:
-- - Simpler schema - all app config in one place
-- - Fewer JOINs - role_permissions queried with app data anyway
-- - Sufficient flexibility - JSONB supports complex permission structures
-- - Easy migration - add column, populate, update function
--
-- EXAMPLE PER-APP PERMISSIONS:
-- RoadCloud might allow members to export: {"can_export": true}
-- TestApp might restrict members from exporting: {"can_export": false}
-- Admin Portal might have additional permissions: {"can_manage_platform": true}
--
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.role_permissions_for_role(
  p_app_id text,  -- Currently unused, reserved for future per-app permissions
  p_role text
)
RETURNS jsonb AS $$
BEGIN
  -- -------------------------------------------------------------------------
  -- DEFAULT PERMISSION STRUCTURE (Hardcoded MVP)
  -- -------------------------------------------------------------------------
  -- These are the standard permissions used across all apps until
  -- per-app permissions are implemented via apps.role_permissions column.
  -- -------------------------------------------------------------------------

  -- Owner and Admin have full permissions
  IF p_role IN ('owner', 'admin') THEN
    RETURN jsonb_build_object(
      'can_edit', true,
      'can_delete', true,
      'can_export', true,
      'can_invite', true,
      'can_manage_members', true,
      'can_manage_settings', true
    );
  END IF;

  -- Member has edit permission only
  IF p_role = 'member' THEN
    RETURN jsonb_build_object(
      'can_edit', true,
      'can_delete', false,
      'can_export', false,
      'can_invite', false,
      'can_manage_members', false,
      'can_manage_settings', false
    );
  END IF;

  -- Viewer has read-only access
  IF p_role = 'viewer' THEN
    RETURN jsonb_build_object(
      'can_edit', false,
      'can_delete', false,
      'can_export', false,
      'can_invite', false,
      'can_manage_members', false,
      'can_manage_settings', false
    );
  END IF;

  -- Default: no permissions
  RETURN '{}'::jsonb;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION public.role_permissions_for_role(text, text) IS
'Returns permission mappings for a given role in a specific app.

**CURRENT (MVP):** Returns hardcoded default permissions. All apps use the same permission structure.

**FUTURE:** Will query apps.role_permissions column for per-app custom permissions.

Parameters:
  p_app_id - App ID (e.g., "roadcloud", "projectx") - currently unused, reserved for Phase 2
  p_role - User role ("owner", "admin", "member", "viewer")

Returns: JSONB object with permission flags (e.g., {"can_edit": true, "can_delete": false})

Used by:
  - get_user_authorization() function
  - Admin portal role permissions matrix

See function header comments for migration path to per-app permissions.';

-- -----------------------------------------------------------------------------
-- 2. MAIN: Get User Authorization Context
-- -----------------------------------------------------------------------------
-- Returns complete authorization context for user in their organization for a specific app
-- This is the primary function called by client-side hooks

CREATE OR REPLACE FUNCTION public.get_user_authorization(
  p_org_id uuid DEFAULT NULL,  -- Optional: defaults to JWT organization
  p_app_id text DEFAULT NULL   -- Required: which app to check authorization for
)
RETURNS TABLE (
  organization_id uuid,
  organization_name text,
  user_role text,
  app_id text,
  app_name text,
  app_description text,        -- Added to match existing interface
  tier_name text,
  tier_display_name text,
  tier_features jsonb,
  role_permissions jsonb,
  tier_limits jsonb,
  current_usage jsonb,
  subscription_status text
) AS $$
DECLARE
  v_org_id uuid;
  v_user_id uuid;
BEGIN
  -- Get current user ID
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  -- Validate app_id is provided
  IF p_app_id IS NULL THEN
    RAISE EXCEPTION 'app_id is required';
  END IF;

  -- Determine which organization to use
  -- If p_org_id provided, use it; otherwise use JWT metadata
  v_org_id := COALESCE(p_org_id, public.user_organization_id());

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'No organization context available';
  END IF;

  -- Return authorization context with LEFT JOINS to handle missing subscriptions gracefully
  RETURN QUERY
  SELECT
    o.id AS organization_id,
    o.name AS organization_name,
    COALESCE(om.role, 'viewer') AS user_role,
    a.id AS app_id,
    a.name AS app_name,
    a.description AS app_description,  -- Added to match existing interface
    COALESCE(sub.tier_name, 'free') AS tier_name,
    COALESCE(at.display_name, 'Free') AS tier_display_name,
    COALESCE(at.features, '{}'::jsonb) AS tier_features,
    public.role_permissions_for_role(a.id, COALESCE(om.role, 'viewer')) AS role_permissions,
    COALESCE(at.limits, '{}'::jsonb) AS tier_limits,
    '{}'::jsonb AS current_usage,  -- Placeholder for future usage tracking
    COALESCE(sub.status, 'inactive') AS subscription_status
  FROM organizations o
  CROSS JOIN apps a
  LEFT JOIN organization_members om ON om.organization_id = o.id AND om.user_id = v_user_id
  LEFT JOIN organization_app_subscriptions sub ON sub.organization_id = o.id AND sub.app_id = a.id
  LEFT JOIN app_tiers at ON at.id = sub.tier_id
  WHERE o.id = v_org_id
    AND a.id = p_app_id
    AND a.is_active = true
  LIMIT 1;

END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION public.get_user_authorization(uuid, text) IS
'Returns complete authorization context for user including tier features and role permissions.
Parameters:
  p_org_id - Organization UUID (optional, defaults to JWT organization)
  p_app_id - App ID to check authorization for (required)
Returns: Single row with organization details, tier features, role permissions, and limits
Used by: Client-side authorization hooks (useAuthorization, useFeatureAccess, usePermission)

Example usage:
  SELECT * FROM public.get_user_authorization(NULL, ''roadcloud'');
  SELECT * FROM public.get_user_authorization(''some-org-uuid'', ''projectx'');';

-- -----------------------------------------------------------------------------
-- 3. HELPER: Check Specific Feature Access
-- -----------------------------------------------------------------------------
-- Convenience function to check if a feature is available (alternative to checking in client)

CREATE OR REPLACE FUNCTION public.check_org_feature_access(
  org_id uuid,
  app_id text,
  feature_name text
)
RETURNS boolean AS $$
DECLARE
  has_access boolean;
BEGIN
  -- Check if feature exists and is enabled for org's tier
  SELECT (at.features ->> feature_name)::boolean INTO has_access
  FROM organization_app_subscriptions oas
  JOIN app_tiers at ON at.id = oas.tier_id
  WHERE oas.organization_id = org_id
    AND oas.app_id = app_id
    AND oas.status = 'active';

  -- Return false if subscription not found or feature not enabled
  RETURN COALESCE(has_access, false);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION public.check_org_feature_access(uuid, text, text) IS
'Checks if a specific feature is available for an organization''s subscription tier.
Parameters:
  org_id - Organization UUID
  app_id - App ID (e.g., "roadcloud", "projectx")
  feature_name - Feature key from tier.features JSONB
Returns: true if feature is enabled, false otherwise
Used by: Server-side feature checks, can also be used in RLS policies

Example usage:
  SELECT public.check_org_feature_access(
    ''some-org-uuid'',
    ''roadcloud'',
    ''export_reports''
  ); -- Returns true/false';

-- =============================================================================
-- END OF USER AUTHORIZATION FUNCTIONS
-- =============================================================================
