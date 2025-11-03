-- =============================================================================
-- PHASE 2.5: UPDATE FOREIGN KEY CONSTRAINTS TO PLATFORM TABLES
-- =============================================================================
-- Description: Update all ValidAI tables to reference platform organizations
-- Created: 2025-11-03
-- Risk: MEDIUM-HIGH (structural changes, non-destructive)
-- Related: Migration plan - Phase 2.5
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- STEP 1: Drop existing foreign keys referencing validai_organizations
-- -----------------------------------------------------------------------------

ALTER TABLE validai_documents
  DROP CONSTRAINT IF EXISTS documents_organization_id_fkey;

ALTER TABLE validai_processors
  DROP CONSTRAINT IF EXISTS processors_organization_id_fkey;

ALTER TABLE validai_runs
  DROP CONSTRAINT IF EXISTS runs_organization_id_fkey;

ALTER TABLE validai_workbench_executions
  DROP CONSTRAINT IF EXISTS workbench_executions_organization_id_fkey;

ALTER TABLE validai_organization_members
  DROP CONSTRAINT IF EXISTS organization_members_organization_id_fkey;

RAISE NOTICE '✅ Step 1: Old foreign keys dropped';

-- -----------------------------------------------------------------------------
-- STEP 2: Add new foreign keys referencing platform organizations
-- -----------------------------------------------------------------------------

ALTER TABLE validai_documents
  ADD CONSTRAINT validai_documents_organization_id_fkey
    FOREIGN KEY (organization_id)
    REFERENCES organizations(id)
    ON DELETE CASCADE;

ALTER TABLE validai_processors
  ADD CONSTRAINT validai_processors_organization_id_fkey
    FOREIGN KEY (organization_id)
    REFERENCES organizations(id)
    ON DELETE CASCADE;

ALTER TABLE validai_runs
  ADD CONSTRAINT validai_runs_organization_id_fkey
    FOREIGN KEY (organization_id)
    REFERENCES organizations(id)
    ON DELETE CASCADE;

ALTER TABLE validai_workbench_executions
  ADD CONSTRAINT validai_workbench_executions_organization_id_fkey
    FOREIGN KEY (organization_id)
    REFERENCES organizations(id)
    ON DELETE CASCADE;

ALTER TABLE validai_organization_members
  ADD CONSTRAINT validai_organization_members_organization_id_fkey
    FOREIGN KEY (organization_id)
    REFERENCES organizations(id)
    ON DELETE CASCADE;

RAISE NOTICE '✅ Step 2: New foreign keys created';

-- -----------------------------------------------------------------------------
-- STEP 3: Verify foreign keys
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_fk_count int;
BEGIN
  -- Count foreign keys referencing organizations (should be 5)
  SELECT COUNT(*) INTO v_fk_count
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
  JOIN information_schema.constraint_column_usage ccu
    ON ccu.constraint_name = tc.constraint_name
  WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = 'public'
    AND tc.table_name IN (
      'validai_documents',
      'validai_processors',
      'validai_runs',
      'validai_workbench_executions',
      'validai_organization_members'
    )
    AND ccu.table_name = 'organizations';

  IF v_fk_count = 5 THEN
    RAISE NOTICE '✅ Step 3: All 5 foreign keys updated successfully';
  ELSE
    RAISE EXCEPTION '❌ Expected 5 foreign keys, found %', v_fk_count;
  END IF;
END $$;

COMMIT;

-- -----------------------------------------------------------------------------
-- VERIFICATION QUERIES
-- -----------------------------------------------------------------------------

-- List all foreign keys now referencing organizations
SELECT
  tc.table_name,
  tc.constraint_name,
  kcu.column_name,
  ccu.table_name AS references_table
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
  AND tc.table_name LIKE 'validai_%'
  AND kcu.column_name = 'organization_id'
ORDER BY tc.table_name;

-- Expected: 5 rows showing all validai tables → organizations
