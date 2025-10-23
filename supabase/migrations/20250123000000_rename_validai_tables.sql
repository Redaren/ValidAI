-- =============================================================================
-- VALIDAI TABLE RENAME MIGRATION
-- =============================================================================
-- Description: Rename all ValidAI domain tables with validai_ prefix
-- Author: Migration Team
-- Created: 2025-01-23
-- Risk: Medium (table renames, code changes required)
-- Rollback: Rename tables back to original names
-- =============================================================================

-- -----------------------------------------------------------------------------
-- RENAME TABLES
-- -----------------------------------------------------------------------------

-- Core ValidAI domain tables
ALTER TABLE documents RENAME TO validai_documents;
ALTER TABLE processors RENAME TO validai_processors;
ALTER TABLE operations RENAME TO validai_operations;
ALTER TABLE runs RENAME TO validai_runs;
ALTER TABLE operation_results RENAME TO validai_operation_results;
ALTER TABLE workbench_executions RENAME TO validai_workbench_executions;
ALTER TABLE llm_global_settings RENAME TO validai_llm_global_settings;

-- -----------------------------------------------------------------------------
-- VERIFY RENAMES
-- -----------------------------------------------------------------------------

-- Check all tables exist with new names
DO $$
BEGIN
  -- Verify each table exists
  ASSERT (SELECT EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = 'validai_documents'
  )), 'validai_documents table not found';

  ASSERT (SELECT EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = 'validai_processors'
  )), 'validai_processors table not found';

  ASSERT (SELECT EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = 'validai_operations'
  )), 'validai_operations table not found';

  ASSERT (SELECT EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = 'validai_runs'
  )), 'validai_runs table not found';

  ASSERT (SELECT EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = 'validai_operation_results'
  )), 'validai_operation_results table not found';

  ASSERT (SELECT EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = 'validai_workbench_executions'
  )), 'validai_workbench_executions table not found';

  ASSERT (SELECT EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = 'validai_llm_global_settings'
  )), 'validai_llm_global_settings table not found';

  RAISE NOTICE 'All tables renamed successfully!';
END $$;

-- -----------------------------------------------------------------------------
-- NOTES ON AUTOMATIC UPDATES
-- -----------------------------------------------------------------------------
-- PostgreSQL automatically updates:
-- - Foreign key constraints (table references)
-- - Indexes (table references)
-- - RLS policies (table references in USING/WITH CHECK clauses)
-- - Views (table references)
-- - Functions (if they use dynamic SQL, will fail - must update manually)
--
-- PostgreSQL does NOT update:
-- - Application code (.from('documents') calls)
-- - Hardcoded table names in functions (rare)
-- -----------------------------------------------------------------------------
