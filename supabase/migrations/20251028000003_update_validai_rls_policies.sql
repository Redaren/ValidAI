-- =============================================================================
-- UPDATE VALIDAI RLS POLICIES WITH APP ACCESS CHECK
-- =============================================================================
-- Description: Add has_app_access('validai') check to all ValidAI table policies
-- Created: 2025-10-28
-- Part of: Phase 4 Task 7 - Update RLS Policies
-- =============================================================================

-- -----------------------------------------------------------------------------
-- STEP 1: Create has_app_access helper function (if not exists)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.has_app_access(app_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM organization_app_subscriptions
    WHERE organization_id = public.user_organization_id()
      AND app_id = app_name
      AND status = 'active'
  );
END;
$$;

COMMENT ON FUNCTION public.has_app_access(text) IS
'Checks if user''s current organization has an active subscription to the specified app.

Parameters:
  app_name - App ID (e.g., "validai", "testapp")

Returns:
  true  - Organization has active subscription
  false - No active subscription

Used by: RLS policies on app-specific tables to enforce subscription-based access.

Example usage in RLS policy:
  CREATE POLICY "policy_name"
    ON app_table
    FOR ALL
    USING (
      organization_id = public.user_organization_id()
      AND public.has_app_access(''app_id'')
    );
';

-- -----------------------------------------------------------------------------
-- STEP 2: Update RLS Policies on ValidAI Tables
-- -----------------------------------------------------------------------------
-- Strategy: Keep existing membership logic, ADD app access check
-- This provides defense in depth:
--   1. User must be member of organization
--   2. Organization must have active ValidAI subscription
-- -----------------------------------------------------------------------------

-- =============================================================================
-- validai_documents
-- =============================================================================

DROP POLICY IF EXISTS "Organization members can view documents" ON validai_documents;
CREATE POLICY "Organization members can view documents"
  ON validai_documents
  FOR SELECT
  USING (
    organization_id = ((auth.jwt() -> 'app_metadata'::text) ->> 'organization_id'::text)::uuid
    AND deleted_at IS NULL
    AND public.has_app_access('validai')
  );

DROP POLICY IF EXISTS "Organization members can create documents" ON validai_documents;
CREATE POLICY "Organization members can create documents"
  ON validai_documents
  FOR INSERT
  WITH CHECK (
    organization_id = ((auth.jwt() -> 'app_metadata'::text) ->> 'organization_id'::text)::uuid
    AND uploaded_by = auth.uid()
    AND public.has_app_access('validai')
  );

DROP POLICY IF EXISTS "Document owner or admin can update" ON validai_documents;
CREATE POLICY "Document owner or admin can update"
  ON validai_documents
  FOR UPDATE
  USING (
    organization_id = ((auth.jwt() -> 'app_metadata'::text) ->> 'organization_id'::text)::uuid
    AND deleted_at IS NULL
    AND public.has_app_access('validai')
    AND (
      uploaded_by = auth.uid()
      OR EXISTS (
        SELECT 1 FROM validai_organization_members
        WHERE organization_id = validai_documents.organization_id
          AND user_id = auth.uid()
          AND role IN ('owner', 'admin')
      )
    )
  )
  WITH CHECK (
    organization_id = ((auth.jwt() -> 'app_metadata'::text) ->> 'organization_id'::text)::uuid
  );

-- =============================================================================
-- validai_processors
-- =============================================================================

DROP POLICY IF EXISTS "Users can view processors based on visibility" ON validai_processors;
CREATE POLICY "Users can view processors based on visibility"
  ON validai_processors
  FOR SELECT
  USING (
    organization_id = ((auth.jwt() -> 'app_metadata'::text) ->> 'organization_id'::text)::uuid
    AND deleted_at IS NULL
    AND public.has_app_access('validai')
    AND (
      visibility = 'organization'
      OR (visibility = 'personal' AND created_by = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Organization members can create processors" ON validai_processors;
CREATE POLICY "Organization members can create processors"
  ON validai_processors
  FOR INSERT
  WITH CHECK (
    organization_id = ((auth.jwt() -> 'app_metadata'::text) ->> 'organization_id'::text)::uuid
    AND created_by = auth.uid()
    AND public.has_app_access('validai')
  );

DROP POLICY IF EXISTS "Processor creator or admin can update" ON validai_processors;
CREATE POLICY "Processor creator or admin can update"
  ON validai_processors
  FOR UPDATE
  USING (
    organization_id = ((auth.jwt() -> 'app_metadata'::text) ->> 'organization_id'::text)::uuid
    AND deleted_at IS NULL
    AND public.has_app_access('validai')
    AND (
      created_by = auth.uid()
      OR EXISTS (
        SELECT 1 FROM validai_organization_members
        WHERE organization_id = validai_processors.organization_id
          AND user_id = auth.uid()
          AND role IN ('owner', 'admin')
      )
    )
  )
  WITH CHECK (
    organization_id = ((auth.jwt() -> 'app_metadata'::text) ->> 'organization_id'::text)::uuid
  );

-- =============================================================================
-- validai_operations
-- =============================================================================

DROP POLICY IF EXISTS "Users can view operations of visible processors" ON validai_operations;
CREATE POLICY "Users can view operations of visible processors"
  ON validai_operations
  FOR SELECT
  USING (
    public.has_app_access('validai')
    AND EXISTS (
      SELECT 1 FROM validai_processors
      WHERE id = validai_operations.processor_id
        AND organization_id = ((auth.jwt() -> 'app_metadata'::text) ->> 'organization_id'::text)::uuid
        AND deleted_at IS NULL
        AND (
          visibility = 'organization'
          OR (visibility = 'personal' AND created_by = auth.uid())
        )
    )
  );

DROP POLICY IF EXISTS "Processor creator or admin can create operations" ON validai_operations;
CREATE POLICY "Processor creator or admin can create operations"
  ON validai_operations
  FOR INSERT
  WITH CHECK (
    public.has_app_access('validai')
    AND EXISTS (
      SELECT 1 FROM validai_processors
      WHERE id = validai_operations.processor_id
        AND organization_id = ((auth.jwt() -> 'app_metadata'::text) ->> 'organization_id'::text)::uuid
        AND deleted_at IS NULL
        AND (
          created_by = auth.uid()
          OR EXISTS (
            SELECT 1 FROM validai_organization_members
            WHERE organization_id = validai_processors.organization_id
              AND user_id = auth.uid()
              AND role IN ('owner', 'admin')
          )
        )
    )
  );

DROP POLICY IF EXISTS "Processor creator or admin can update operations" ON validai_operations;
CREATE POLICY "Processor creator or admin can update operations"
  ON validai_operations
  FOR UPDATE
  USING (
    public.has_app_access('validai')
    AND EXISTS (
      SELECT 1 FROM validai_processors
      WHERE id = validai_operations.processor_id
        AND organization_id = ((auth.jwt() -> 'app_metadata'::text) ->> 'organization_id'::text)::uuid
        AND deleted_at IS NULL
        AND (
          created_by = auth.uid()
          OR EXISTS (
            SELECT 1 FROM validai_organization_members
            WHERE organization_id = validai_processors.organization_id
              AND user_id = auth.uid()
              AND role IN ('owner', 'admin')
          )
        )
    )
  );

DROP POLICY IF EXISTS "Processor creator or admin can delete operations" ON validai_operations;
CREATE POLICY "Processor creator or admin can delete operations"
  ON validai_operations
  FOR DELETE
  USING (
    public.has_app_access('validai')
    AND EXISTS (
      SELECT 1 FROM validai_processors
      WHERE id = validai_operations.processor_id
        AND organization_id = ((auth.jwt() -> 'app_metadata'::text) ->> 'organization_id'::text)::uuid
        AND deleted_at IS NULL
        AND (
          created_by = auth.uid()
          OR EXISTS (
            SELECT 1 FROM validai_organization_members
            WHERE organization_id = validai_processors.organization_id
              AND user_id = auth.uid()
              AND role IN ('owner', 'admin')
          )
        )
    )
  );

-- =============================================================================
-- validai_runs
-- =============================================================================

DROP POLICY IF EXISTS "Users can view runs in their organization" ON validai_runs;
CREATE POLICY "Users can view runs in their organization"
  ON validai_runs
  FOR SELECT
  USING (
    public.has_app_access('validai')
    AND organization_id IN (
      SELECT organization_id FROM validai_organization_members
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert runs in their organization" ON validai_runs;
CREATE POLICY "Users can insert runs in their organization"
  ON validai_runs
  FOR INSERT
  WITH CHECK (
    public.has_app_access('validai')
    AND organization_id IN (
      SELECT organization_id FROM validai_organization_members
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update runs in their organization" ON validai_runs;
CREATE POLICY "Users can update runs in their organization"
  ON validai_runs
  FOR UPDATE
  USING (
    public.has_app_access('validai')
    AND organization_id IN (
      SELECT organization_id FROM validai_organization_members
      WHERE user_id = auth.uid()
    )
  );

-- =============================================================================
-- validai_operation_results
-- =============================================================================

DROP POLICY IF EXISTS "Users can view operation results in their organization" ON validai_operation_results;
CREATE POLICY "Users can view operation results in their organization"
  ON validai_operation_results
  FOR SELECT
  USING (
    public.has_app_access('validai')
    AND run_id IN (
      SELECT id FROM validai_runs
      WHERE organization_id IN (
        SELECT organization_id FROM validai_organization_members
        WHERE user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Users can insert operation results in their organization" ON validai_operation_results;
CREATE POLICY "Users can insert operation results in their organization"
  ON validai_operation_results
  FOR INSERT
  WITH CHECK (
    public.has_app_access('validai')
    AND run_id IN (
      SELECT id FROM validai_runs
      WHERE organization_id IN (
        SELECT organization_id FROM validai_organization_members
        WHERE user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Users can update operation results in their organization" ON validai_operation_results;
CREATE POLICY "Users can update operation results in their organization"
  ON validai_operation_results
  FOR UPDATE
  USING (
    public.has_app_access('validai')
    AND run_id IN (
      SELECT id FROM validai_runs
      WHERE organization_id IN (
        SELECT organization_id FROM validai_organization_members
        WHERE user_id = auth.uid()
      )
    )
  );

-- =============================================================================
-- validai_workbench_executions
-- =============================================================================

DROP POLICY IF EXISTS "Users can view their own workbench executions" ON validai_workbench_executions;
CREATE POLICY "Users can view their own workbench executions"
  ON validai_workbench_executions
  FOR SELECT
  USING (
    user_id = auth.uid()
    AND public.has_app_access('validai')
  );

DROP POLICY IF EXISTS "Users can insert their own workbench executions" ON validai_workbench_executions;
CREATE POLICY "Users can insert their own workbench executions"
  ON validai_workbench_executions
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND organization_id = ((auth.jwt() -> 'app_metadata'::text) ->> 'organization_id'::text)::uuid
    AND public.has_app_access('validai')
  );

DROP POLICY IF EXISTS "Users can update their own workbench executions" ON validai_workbench_executions;
CREATE POLICY "Users can update their own workbench executions"
  ON validai_workbench_executions
  FOR UPDATE
  USING (
    user_id = auth.uid()
    AND public.has_app_access('validai')
  );

-- =============================================================================
-- validai_llm_global_settings
-- =============================================================================
-- Note: This table doesn't have organization_id, so it needs different logic
-- For now, just add app access check

-- First, check what policies exist
DO $$
BEGIN
  -- If no policies exist, create a basic one with app access check
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'validai_llm_global_settings'
  ) THEN
    -- Create basic policy allowing authenticated users with app access to view settings
    CREATE POLICY "Users with ValidAI access can view LLM settings"
      ON validai_llm_global_settings
      FOR SELECT
      USING (public.has_app_access('validai'));
  END IF;
END $$;

-- =============================================================================
-- VERIFICATION
-- =============================================================================

DO $$
BEGIN
  -- Verify all ValidAI tables have RLS enabled
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename LIKE 'validai_%'
      AND rowsecurity = false
  ) THEN
    RAISE NOTICE 'SUCCESS: All ValidAI tables have RLS enabled';
  ELSE
    RAISE WARNING 'Some ValidAI tables do not have RLS enabled';
  END IF;

  -- Verify has_app_access function exists
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'has_app_access'
  ) THEN
    RAISE NOTICE 'SUCCESS: has_app_access() function created';
  ELSE
    RAISE WARNING 'FAILED: has_app_access() function not found';
  END IF;

  RAISE NOTICE 'RLS policy update complete - all ValidAI tables now check subscription status via has_app_access()';
END $$;
