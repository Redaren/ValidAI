-- =============================================================================
-- PLAYZE CORE - PHASE 2: HELPER FUNCTIONS
-- =============================================================================
-- Description: Helper functions for auth, permissions, and organization context
-- Created: 2025-01-17
-- Updated: 2025-01-22 - Corrected to use public schema (auth schema is Supabase-reserved)
-- Security: All functions use SECURITY DEFINER with STABLE where appropriate
-- =============================================================================
-- IMPORTANT: Custom functions MUST be in public schema. The auth schema is
-- Supabase-managed and contains only built-in functions (uid, jwt, email, role).
-- We cannot create custom functions in the auth schema due to permissions.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. HELPER: Get Current User's Organization ID from JWT
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.user_organization_id()
RETURNS uuid AS $$
BEGIN
  RETURN (auth.jwt() -> 'app_metadata' ->> 'organization_id')::uuid;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION public.user_organization_id() IS
'Returns current user''s active organization ID from JWT metadata.
Returns NULL if not set (e.g., user has no organizations yet).
Used by: RLS policies, database functions';

-- -----------------------------------------------------------------------------
-- 2. HELPER: Check if User''s Org Has Active App Access
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.has_app_access(app_name text)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM organization_app_subscriptions
    WHERE organization_id = public.user_organization_id()
      AND app_id = app_name
      AND status = 'active'
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION public.has_app_access(text) IS
'Checks if user''s current organization has an active subscription to the specified app.
Parameters:
  app_name - App ID (e.g., "roadcloud", "projectx")
Returns: true if active subscription exists, false otherwise
Used by: RLS policies for app-specific tables';

-- Example usage in RLS policy:
-- USING (
--   organization_id = public.user_organization_id()
--   AND public.has_app_access('roadcloud')
-- )

-- -----------------------------------------------------------------------------
-- 3. HELPER: Get User''s Role in Specific Organization
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.user_role_in_org(org_id uuid)
RETURNS text AS $$
DECLARE
  user_role text;
BEGIN
  SELECT role INTO user_role
  FROM organization_members
  WHERE organization_id = org_id
    AND user_id = auth.uid();

  RETURN user_role;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION public.user_role_in_org(uuid) IS
'Returns user''s role in specified organization.
Parameters:
  org_id - Organization UUID
Returns: "owner", "admin", "member", "viewer", or NULL if not a member
Used by: Database functions for permission checks';

-- Example usage:
-- SELECT public.user_role_in_org('some-org-uuid');
-- Returns: 'admin'

-- -----------------------------------------------------------------------------
-- 4. HELPER: Check if User is Admin or Owner in Current Org
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_org_admin()
RETURNS boolean AS $$
DECLARE
  user_role text;
BEGIN
  SELECT role INTO user_role
  FROM organization_members
  WHERE organization_id = public.user_organization_id()
    AND user_id = auth.uid();

  RETURN user_role IN ('owner', 'admin');
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION public.is_org_admin() IS
'Checks if current user is admin or owner in their active organization.
Returns: true if user has owner/admin role, false otherwise
Used by: Database functions for admin-only operations';

-- Example usage:
-- IF NOT public.is_org_admin() THEN
--   RAISE EXCEPTION 'Permission denied: Admin role required';
-- END IF;

-- =============================================================================
-- END OF HELPER FUNCTIONS
-- =============================================================================
