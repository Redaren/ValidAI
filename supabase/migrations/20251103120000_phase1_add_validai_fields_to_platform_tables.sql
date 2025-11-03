-- =============================================================================
-- PHASE 1: ADD VALIDAI FIELDS TO PLATFORM TABLES
-- =============================================================================
-- Description: Add ValidAI-specific fields to platform organizations table
--              and synchronize data from validai_organizations
-- Created: 2025-11-03
-- Risk: LOW (non-destructive, additive only)
-- Related: Migration plan - Fix ValidAI Organization Tables Architecture
-- =============================================================================

-- -----------------------------------------------------------------------------
-- STEP 1: Add Columns to organizations Table
-- -----------------------------------------------------------------------------

-- Add ValidAI-specific fields to platform organizations table
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS llm_configuration jsonb;

-- Add column comments for documentation
COMMENT ON COLUMN organizations.created_by IS
  'User who created this organization (audit trail, ValidAI-originated)';

COMMENT ON COLUMN organizations.llm_configuration IS
  'JSONB configuration for LLM settings including API keys and available models.
   Structure: {
     "api_keys_encrypted": { "provider": "encrypted_key" },
     "available_models": [{ "id", "provider", "model", "display_name" }],
     "default_model_id": "model_id"
   }
   Used by ValidAI app, other apps can use or ignore.';

-- -----------------------------------------------------------------------------
-- STEP 2: Migrate Data from validai_organizations
-- -----------------------------------------------------------------------------

-- Copy ValidAI-specific data to platform table
UPDATE organizations o
SET
  created_by = vo.created_by,
  llm_configuration = vo.llm_configuration
FROM validai_organizations vo
WHERE o.id = vo.id;

-- -----------------------------------------------------------------------------
-- STEP 3: Synchronize Missing Users
-- -----------------------------------------------------------------------------

-- Sync missing users from validai_organization_members to organization_members
-- This ensures all users in validai tables are also in platform tables
INSERT INTO organization_members (organization_id, user_id, role, joined_at)
SELECT
  vom.organization_id,
  vom.user_id,
  vom.role,
  vom.joined_at
FROM validai_organization_members vom
WHERE NOT EXISTS (
  SELECT 1 FROM organization_members om
  WHERE om.organization_id = vom.organization_id
    AND om.user_id = vom.user_id
)
ON CONFLICT (organization_id, user_id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- VERIFICATION
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_org_count int;
  v_member_count int;
  v_columns_added int;
BEGIN
  -- Verify columns added successfully
  SELECT COUNT(*) INTO v_columns_added
  FROM information_schema.columns
  WHERE table_name = 'organizations'
    AND column_name IN ('created_by', 'llm_configuration');

  IF v_columns_added != 2 THEN
    RAISE EXCEPTION 'Column addition failed: expected 2 columns, found %', v_columns_added;
  END IF;

  -- Verify data migration
  SELECT COUNT(*) INTO v_org_count
  FROM organizations o
  INNER JOIN validai_organizations vo ON o.id = vo.id
  WHERE o.created_by = vo.created_by
    AND o.llm_configuration = vo.llm_configuration;

  IF v_org_count = 0 AND EXISTS (SELECT 1 FROM validai_organizations LIMIT 1) THEN
    RAISE WARNING 'Data migration may have failed: no matching records found';
  END IF;

  RAISE NOTICE '✅ Phase 1 Migration Complete:';
  RAISE NOTICE '   - Columns added to organizations table';
  RAISE NOTICE '   - Data migrated from validai_organizations';
  RAISE NOTICE '   - Organization members synchronized';
  RAISE NOTICE '   - Organizations with migrated data: %', v_org_count;
END $$;
