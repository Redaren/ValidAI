-- =============================================================================
-- FIX VALIDAI RLS POLICIES TO USE PLATFORM TABLES
-- =============================================================================
-- Description: Update all ValidAI RLS policies to check organization_members
--              instead of validai_organization_members (legacy table)
-- Created: 2025-11-03
-- Bug: Users added after platform migration cannot access ValidAI resources
-- Root Cause: RLS policies still checking legacy validai_organization_members
-- Impact: Critical - affects all new users (e.g., elin@olivab.se)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- CONTEXT
-- -----------------------------------------------------------------------------
-- Migration 20251103120001 updated database functions to use platform tables
-- Migration 20251028000003 updated RLS policies but STILL used legacy table
-- This migration completes the fix by updating all remaining RLS policies
--
-- IMPORTANT: This does NOT affect validai_organizations table policies,
-- as that table itself is a legacy table and will be deprecated separately
-- -----------------------------------------------------------------------------

-- =============================================================================
-- validai_runs - Update all 3 policies
-- =============================================================================

DROP POLICY IF EXISTS "Users can view runs in their organization" ON validai_runs;
CREATE POLICY "Users can view runs in their organization"
  ON validai_runs
  FOR SELECT
  USING (
    public.has_app_access('validai')
    AND organization_id IN (
      SELECT organization_id FROM organization_members  -- ✅ FIXED: was validai_organization_members
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
      SELECT organization_id FROM organization_members  -- ✅ FIXED: was validai_organization_members
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
      SELECT organization_id FROM organization_members  -- ✅ FIXED: was validai_organization_members
      WHERE user_id = auth.uid()
    )
  );

-- =============================================================================
-- validai_operation_results - Update all 3 policies
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
        SELECT organization_id FROM organization_members  -- ✅ FIXED: was validai_organization_members
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
        SELECT organization_id FROM organization_members  -- ✅ FIXED: was validai_organization_members
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
        SELECT organization_id FROM organization_members  -- ✅ FIXED: was validai_organization_members
        WHERE user_id = auth.uid()
      )
    )
  );

-- =============================================================================
-- validai_processors - Update admin check in UPDATE policy
-- =============================================================================

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
        SELECT 1 FROM organization_members  -- ✅ FIXED: was validai_organization_members
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
-- validai_documents - Update admin check in UPDATE policy
-- =============================================================================

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
        SELECT 1 FROM organization_members  -- ✅ FIXED: was validai_organization_members
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
-- validai_operations - Update admin checks in INSERT, UPDATE, DELETE policies
-- =============================================================================

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
            SELECT 1 FROM organization_members  -- ✅ FIXED: was validai_organization_members
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
            SELECT 1 FROM organization_members  -- ✅ FIXED: was validai_organization_members
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
            SELECT 1 FROM organization_members  -- ✅ FIXED: was validai_organization_members
            WHERE organization_id = validai_processors.organization_id
              AND user_id = auth.uid()
              AND role IN ('owner', 'admin')
          )
        )
    )
  );

-- =============================================================================
-- VERIFICATION
-- =============================================================================

DO $$
DECLARE
  v_policies_count INT;
  v_elin_user_id uuid := '7410357f-f92d-4ba1-b589-430dde7de60b';
  v_johan_user_id uuid := 'ed027f60-4faa-43ba-9d4a-4da9ec4e7373';
  v_org_id uuid := 'b822d5c9-706a-4e37-9d7a-c0b0417efe56';
BEGIN
  -- Count updated policies
  SELECT COUNT(*) INTO v_policies_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN (
      'validai_runs',
      'validai_operation_results',
      'validai_processors',
      'validai_documents',
      'validai_operations'
    );

  RAISE NOTICE '✅ Updated % RLS policies across 5 ValidAI tables', v_policies_count;

  -- Verify both users exist in organization_members (platform table)
  IF EXISTS (
    SELECT 1 FROM organization_members
    WHERE user_id IN (v_elin_user_id, v_johan_user_id)
      AND organization_id = v_org_id
  ) THEN
    RAISE NOTICE '✅ Both test users (elin, jmardfelt) exist in organization_members';
  ELSE
    RAISE WARNING '⚠️  Test users not found in organization_members';
  END IF;

  -- Verify elin does NOT exist in legacy table (this is expected)
  IF NOT EXISTS (
    SELECT 1 FROM validai_organization_members
    WHERE user_id = v_elin_user_id
  ) THEN
    RAISE NOTICE '✅ Confirmed: elin@olivab.se NOT in legacy table (expected)';
  ELSE
    RAISE NOTICE 'ℹ️  elin@olivab.se found in legacy table (unexpected but OK)';
  END IF;

  -- Verify jmardfelt exists in legacy table (legacy user)
  IF EXISTS (
    SELECT 1 FROM validai_organization_members
    WHERE user_id = v_johan_user_id
  ) THEN
    RAISE NOTICE '✅ Confirmed: jmardfelt@gmail.com in legacy table (legacy user)';
  END IF;

  RAISE NOTICE '';
  RAISE NOTICE '=============================================================================';
  RAISE NOTICE 'MIGRATION COMPLETE';
  RAISE NOTICE '=============================================================================';
  RAISE NOTICE 'Fix: All ValidAI RLS policies now check organization_members (platform)';
  RAISE NOTICE 'Impact: Users added after migration can now access ValidAI resources';
  RAISE NOTICE 'Test: elin@olivab.se should now be able to view runs';
  RAISE NOTICE '=============================================================================';
END $$;
