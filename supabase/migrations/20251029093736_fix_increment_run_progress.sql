-- =============================================================================
-- FIX INCREMENT_RUN_PROGRESS FUNCTION - CRITICAL BUG
-- =============================================================================
-- Description: Fix incorrect table reference in increment_run_progress function
-- Author: ValidAI Team
-- Created: 2025-10-29
-- Risk: Low (fixes critical bug)
-- Rollback: Revert to previous version (broken version)
-- =============================================================================
--
-- BUG: Function was referencing 'runs' instead of 'validai_runs'
-- This caused silent failures - progress counters never updated
-- Impact: All runs show completed_operations = 0 and failed_operations = 0
--
-- =============================================================================

-- Drop and recreate the function with correct table name
DROP FUNCTION IF EXISTS public.increment_run_progress(uuid, text);

CREATE OR REPLACE FUNCTION public.increment_run_progress(
  p_run_id uuid,
  p_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  -- Update progress counters on validai_runs table
  UPDATE validai_runs
  SET
    completed_operations = CASE
      WHEN p_status = 'completed' THEN completed_operations + 1
      ELSE completed_operations
    END,
    failed_operations = CASE
      WHEN p_status = 'failed' THEN failed_operations + 1
      ELSE failed_operations
    END
  WHERE id = p_run_id;

  -- Log warning if run not found
  IF NOT FOUND THEN
    RAISE WARNING 'increment_run_progress: Run not found with id=%', p_run_id;
  END IF;
END;
$$;

-- Add helpful comment
COMMENT ON FUNCTION public.increment_run_progress IS
  'Atomically increment completed or failed operation counters on a run. Called after each operation completes.';

-- =============================================================================
-- VERIFICATION QUERY
-- =============================================================================
-- After applying this migration, verify the function references correct table:
--
-- SELECT prosrc
-- FROM pg_proc
-- WHERE proname = 'increment_run_progress';
--
-- Should contain: UPDATE validai_runs (not UPDATE runs)
-- =============================================================================

-- Test the function works
DO $$
DECLARE
  v_test_run_id uuid;
  v_completed_before int;
  v_completed_after int;
BEGIN
  -- Get a real run ID from the database
  SELECT id INTO v_test_run_id
  FROM validai_runs
  WHERE status IN ('completed', 'processing')
  LIMIT 1;

  IF v_test_run_id IS NOT NULL THEN
    -- Get current value
    SELECT completed_operations INTO v_completed_before
    FROM validai_runs
    WHERE id = v_test_run_id;

    -- Test increment
    PERFORM increment_run_progress(v_test_run_id, 'completed');

    -- Get new value
    SELECT completed_operations INTO v_completed_after
    FROM validai_runs
    WHERE id = v_test_run_id;

    -- Verify it incremented
    IF v_completed_after = v_completed_before + 1 THEN
      RAISE NOTICE '✅ increment_run_progress fix verified: % -> %', v_completed_before, v_completed_after;

      -- Rollback test change
      UPDATE validai_runs
      SET completed_operations = v_completed_before
      WHERE id = v_test_run_id;

      RAISE NOTICE '✅ Test value rolled back';
    ELSE
      RAISE EXCEPTION '❌ increment_run_progress still broken: expected %, got %',
        v_completed_before + 1, v_completed_after;
    END IF;
  ELSE
    RAISE NOTICE '⚠️ No runs found to test increment_run_progress, but function created successfully';
  END IF;
END $$;
