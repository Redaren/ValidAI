-- Migration: Remove duplicate RLS policies after performance optimization
-- Purpose: Clean up old inefficient policies that were replaced in previous migrations
-- Context: Migrations 20251116164156 and 20251116164200 created optimized policies
--          but old policies from migration 20251028000003 still exist
-- Date: 2024-11-16

-- -----------------------------------------------------------------------------
-- CONTEXT: Why Duplicates Exist
-- -----------------------------------------------------------------------------
-- The performance optimization migrations created new policies with the same
-- names but the DROP POLICY IF EXISTS statements used different names than
-- the actual existing policies. This resulted in both old and new policies
-- existing simultaneously.
--
-- Impact: Multiple policies are combined with OR logic, so the inefficient
-- old policies are still being evaluated. We need to remove them to get the
-- full performance benefit.
-- -----------------------------------------------------------------------------

-- =============================================================================
-- validai_operation_results - Remove old nested subquery policies
-- =============================================================================

-- Drop old INSERT policy with nested subquery (replaced with direct org check)
DROP POLICY IF EXISTS "Users can insert operation results in their organization"
  ON validai_operation_results;

-- Keep new optimized policies (created in migration 20251116164156):
-- ✅ "Users can view operation results in their organization" - direct org_id check
-- ✅ "Users can insert operation results for their runs" - direct org_id check
-- ✅ "Users can update operation results in their organization" - direct org_id check

-- =============================================================================
-- validai_operations - Remove old JOIN-based policies
-- =============================================================================

-- Drop old SELECT policy with complex JOIN (replaced with direct org check)
DROP POLICY IF EXISTS "Users can view operations of visible processors"
  ON validai_operations;

-- Drop old INSERT policy with complex JOIN
DROP POLICY IF EXISTS "Processor creator or admin can create operations"
  ON validai_operations;

-- Drop old UPDATE policy with complex JOIN
DROP POLICY IF EXISTS "Processor creator or admin can update operations"
  ON validai_operations;

-- Drop old DELETE policy with complex JOIN
DROP POLICY IF EXISTS "Processor creator or admin can delete operations"
  ON validai_operations;

-- Keep new optimized policies (created in migration 20251116164200):
-- ✅ "Users can view operations for their processors" - direct org_id check
-- ✅ "Users can insert operations for their processors" - direct org_id check + processor validation
-- ✅ "Users can update operations for their processors" - direct org_id check
-- ✅ "Users can delete operations for their processors" - direct org_id check

-- =============================================================================
-- Verification
-- =============================================================================

DO $$
DECLARE
  dup_count integer;
BEGIN
  -- Check for duplicate policies (same command type on same table)
  SELECT COUNT(*) INTO dup_count
  FROM (
    SELECT tablename, cmd, COUNT(*) as policy_count
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('validai_operation_results', 'validai_operations')
    GROUP BY tablename, cmd
    HAVING COUNT(*) > 1
  ) duplicates;

  IF dup_count = 0 THEN
    RAISE NOTICE 'SUCCESS: No duplicate policies found';
    RAISE NOTICE 'Policy cleanup complete - all inefficient policies removed';
  ELSE
    RAISE WARNING 'Found % duplicate policies (multiple policies for same operation)', dup_count;
  END IF;
END $$;

-- Policy count verification
DO $$
BEGIN
  RAISE NOTICE 'validai_operation_results policies: %', (
    SELECT COUNT(*) FROM pg_policies
    WHERE tablename = 'validai_operation_results'
  );

  RAISE NOTICE 'validai_operations policies: %', (
    SELECT COUNT(*) FROM pg_policies
    WHERE tablename = 'validai_operations'
  );
END $$;

-- Expected result:
-- validai_operation_results: 3 policies (SELECT, INSERT, UPDATE)
-- validai_operations: 4 policies (SELECT, INSERT, UPDATE, DELETE)

-- Migration complete
-- Old inefficient policies with nested subqueries and JOINs removed
-- Performance optimization now fully effective
