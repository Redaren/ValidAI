-- =============================================================================
-- CREATE MIDDLEWARE SUBSCRIPTION CHECK FUNCTION
-- =============================================================================
-- Description: Create SECURITY DEFINER function for middleware to check ValidAI access
-- Created: 2025-10-28
-- Part of: Phase 4 Task 7 - Fix middleware RLS circular dependency
-- Pattern: Follows Admin Portal's is_playze_admin() pattern
-- =============================================================================

-- -----------------------------------------------------------------------------
-- PROBLEM SOLVED:
-- -----------------------------------------------------------------------------
-- Middleware needs to check if organization has active ValidAI subscription.
-- Direct query to organization_app_subscriptions fails because:
-- 1. Table has RLS policy requiring auth.uid()
-- 2. In middleware context, auth.uid() may not be established
-- 3. RLS blocks the query → users get incorrectly redirected to /no-access
--
-- SOLUTION:
-- Use SECURITY DEFINER function that bypasses RLS (like is_playze_admin)
-- Input: organization_id from JWT (trusted source, cannot be spoofed)
-- Output: boolean (true if active subscription, false otherwise)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.check_validai_access(p_org_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER  -- Bypasses RLS with elevated privileges
STABLE             -- Can be optimized by query planner
SET search_path = public
AS $$
BEGIN
  -- Simple check: Does organization have active ValidAI subscription?
  -- SECURITY DEFINER runs with elevated privileges, bypassing RLS
  RETURN EXISTS (
    SELECT 1
    FROM organization_app_subscriptions
    WHERE organization_id = p_org_id
      AND app_id = 'validai'
      AND status = 'active'
  );
END;
$$;

-- Add function comment
COMMENT ON FUNCTION public.check_validai_access(uuid) IS
'Checks if organization has active ValidAI subscription for middleware access control.

Purpose: Enable middleware to verify app access without RLS interference
Pattern: Follows Admin Portal''s is_playze_admin() pattern
Security: SECURITY DEFINER bypasses RLS (safe because org_id from trusted JWT)

Parameters:
  p_org_id - Organization UUID from JWT app_metadata.organization_id

Returns:
  true  - Organization has active ValidAI subscription
  false - No active subscription found

Usage in middleware:
  const { data: hasAccess } = await supabase
    .rpc(''check_validai_access'', { p_org_id: orgId })

  if (!hasAccess) {
    return NextResponse.redirect(''/no-access'')
  }

Security considerations:
- Input (p_org_id) comes from JWT metadata (cannot be spoofed by user)
- Output is boolean only (no sensitive data exposed)
- Function is simple and auditable
- RLS still active on all data tables (this only bypasses subscription check)';

-- -----------------------------------------------------------------------------
-- VERIFICATION
-- -----------------------------------------------------------------------------

DO $$
BEGIN
  -- Verify function exists and is SECURITY DEFINER
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname = 'check_validai_access'
      AND p.prosecdef = true  -- SECURITY DEFINER flag
  ) THEN
    RAISE EXCEPTION 'Function check_validai_access not created correctly';
  END IF;

  RAISE NOTICE 'check_validai_access function created successfully';
  RAISE NOTICE 'Middleware can now check subscriptions without RLS interference';
END $$;
