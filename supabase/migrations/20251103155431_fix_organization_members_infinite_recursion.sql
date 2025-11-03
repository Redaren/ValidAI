-- =============================================================================
-- FIX INFINITE RECURSION IN ORGANIZATION_MEMBERS RLS POLICY
-- =============================================================================
-- Description: Replace recursive RLS policy with simple non-recursive policy
-- Created: 2025-11-03
-- Bug: Infinite recursion error when ValidAI policies check membership
-- Error: "infinite recursion detected in policy for relation organization_members"
-- Root Cause: Policy queries organization_members from within organization_members
-- Impact: CRITICAL - All ValidAI updates/creates fail silently
-- =============================================================================

-- -----------------------------------------------------------------------------
-- CONTEXT
-- -----------------------------------------------------------------------------
-- The organization_members table had this BROKEN policy:
--
-- CREATE POLICY "Users can view members of their organizations"
--   ON organization_members FOR SELECT
--   USING (
--     EXISTS (
--       SELECT 1 FROM organization_members om  -- ❌ RECURSIVE!
--       WHERE om.organization_id = organization_members.organization_id
--         AND om.user_id = auth.uid()
--     )
--   );
--
-- When ValidAI RLS policies check membership like:
--   EXISTS (SELECT 1 FROM organization_members WHERE ...)
-- They trigger the recursive policy → infinite loop → all operations fail
--
-- SOLUTION: Use simple non-recursive policy (matches legacy pattern)
-- -----------------------------------------------------------------------------

-- =============================================================================
-- STEP 1: Drop the broken recursive policy
-- =============================================================================

DROP POLICY IF EXISTS "Users can view members of their organizations" ON organization_members;

-- =============================================================================
-- STEP 2: Create simple non-recursive policy
-- =============================================================================

CREATE POLICY "Users can view their own memberships"
  ON organization_members
  FOR SELECT
  USING (
    user_id = auth.uid()  -- ✅ Non-recursive! Just checks current user
  );

COMMENT ON POLICY "Users can view their own memberships" ON organization_members IS
  'Non-recursive policy that allows users to see their own organization memberships.
   This policy MUST NOT query organization_members to avoid infinite recursion
   when other table policies perform nested membership checks.

   Pattern matches legacy validai_organization_members policy for consistency.

   Created: 2025-11-03 to fix infinite recursion bug';

-- =============================================================================
-- VERIFICATION
-- =============================================================================

DO $$
DECLARE
  v_policy_count int;
  v_recursive_check text;
BEGIN
  -- Count policies on organization_members
  SELECT COUNT(*) INTO v_policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'organization_members';

  -- Check if the new policy is non-recursive
  SELECT qual INTO v_recursive_check
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'organization_members'
    AND policyname = 'Users can view their own memberships';

  IF v_policy_count = 1 THEN
    RAISE NOTICE '✅ Step 1: Recursive policy dropped, new policy created';
  ELSE
    RAISE WARNING '⚠️  Expected 1 policy on organization_members, found %', v_policy_count;
  END IF;

  -- Verify policy is non-recursive (should not contain "FROM organization_members")
  IF v_recursive_check NOT LIKE '%FROM organization_members%'
     AND v_recursive_check NOT LIKE '%FROM om%' THEN
    RAISE NOTICE '✅ Step 2: New policy is non-recursive';
  ELSE
    RAISE WARNING '⚠️  Policy may still be recursive: %', v_recursive_check;
  END IF;

  RAISE NOTICE '';
  RAISE NOTICE '=============================================================================';
  RAISE NOTICE 'MIGRATION COMPLETE: Infinite Recursion Fixed';
  RAISE NOTICE '=============================================================================';
  RAISE NOTICE 'Fix: Replaced recursive policy with simple user_id = auth.uid() check';
  RAISE NOTICE 'Impact: All ValidAI updates/creates should now work';
  RAISE NOTICE 'Test: Try reordering operations, creating areas, updating descriptions';
  RAISE NOTICE '=============================================================================';
END $$;
