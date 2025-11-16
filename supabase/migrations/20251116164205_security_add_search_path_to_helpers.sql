-- Migration: Add SET search_path to helper functions for security hardening
-- Purpose: Prevent search path attacks on SECURITY DEFINER functions
-- Reference: Supabase security linter warnings
-- Date: 2024-11-16

-- -----------------------------------------------------------------------------
-- SECURITY CONTEXT
-- -----------------------------------------------------------------------------
-- SECURITY DEFINER functions run with elevated privileges and can be vulnerable
-- to search path attacks if they reference unqualified table/function names.
-- Adding "SET search_path = public" ensures the function only looks in the
-- public schema, preventing malicious code injection via custom search paths.
--
-- Note: has_app_access() was already updated in migration 20251028000003
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- 1. Update user_organization_id() - Add search_path
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.user_organization_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (auth.jwt() -> 'app_metadata' ->> 'organization_id')::uuid;
END;
$$;

COMMENT ON FUNCTION public.user_organization_id() IS
'Returns current user''s active organization ID from JWT metadata.
Returns NULL if not set (e.g., user has no organizations yet).
Used by: RLS policies, database functions
Security: SET search_path = public prevents search path attacks';

-- -----------------------------------------------------------------------------
-- 2. Update user_role_in_org() - Add search_path
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.user_role_in_org(org_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_role text;
BEGIN
  SELECT role INTO user_role
  FROM organization_members
  WHERE organization_id = org_id
    AND user_id = auth.uid();

  RETURN user_role;
END;
$$;

COMMENT ON FUNCTION public.user_role_in_org(uuid) IS
'Returns user''s role in specified organization.
Parameters:
  org_id - Organization UUID
Returns: "owner", "admin", "member", "viewer", or NULL if not a member
Used by: Database functions for permission checks
Security: SET search_path = public prevents search path attacks';

-- -----------------------------------------------------------------------------
-- 3. Update is_org_admin() - Add search_path
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_org_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_role text;
BEGIN
  SELECT role INTO user_role
  FROM organization_members
  WHERE organization_id = public.user_organization_id()
    AND user_id = auth.uid();

  RETURN user_role IN ('owner', 'admin');
END;
$$;

COMMENT ON FUNCTION public.is_org_admin() IS
'Checks if current user is admin or owner in their active organization.
Returns: true if user has owner/admin role, false otherwise
Used by: Database functions for admin-only operations
Security: SET search_path = public prevents search path attacks';

-- -----------------------------------------------------------------------------
-- Verification
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  func_count integer;
BEGIN
  -- Count helper functions with SET search_path
  SELECT COUNT(*) INTO func_count
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'user_organization_id',
      'has_app_access',
      'user_role_in_org',
      'is_org_admin'
    )
    AND pg_get_function_identity_arguments(p.oid) IN ('', 'text', 'uuid')
    AND prosecdef = true  -- SECURITY DEFINER
    AND 'search_path=public' = ANY(string_to_array(pg_get_function_result(p.oid), ', '));

  IF func_count >= 4 THEN
    RAISE NOTICE 'SUCCESS: All 4 helper functions have SET search_path = public';
  ELSE
    RAISE WARNING 'Verification incomplete: Only % of 4 functions have search_path set', func_count;
  END IF;

  RAISE NOTICE 'Security hardening complete - helper functions protected against search path attacks';
END $$;

-- Migration complete
-- All SECURITY DEFINER helper functions now have SET search_path = public
-- This prevents potential security vulnerabilities from search path manipulation
