-- ============================================================================
-- Migration: Playbook Catalog Table for Discovery Portal
-- Purpose: Separate table for public discovery metadata (marketplace pattern)
--
-- Architecture Decision:
-- - validai_playbook_catalog: public discovery (name, description, tags, etc.)
-- - validai_playbook_snapshots: restricted content (actual playbook config)
--
-- Key Behavior: Catalog entry is FROZEN at publish time and does NOT sync
-- with processor profile edits. To update discovery info, user must re-publish.
-- ============================================================================

-- ============================================================================
-- Step 1: Create the catalog table
-- ============================================================================

CREATE TABLE validai_playbook_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Link to the published snapshot
  snapshot_id uuid NOT NULL UNIQUE REFERENCES validai_playbook_snapshots(id) ON DELETE CASCADE,
  processor_id uuid NOT NULL REFERENCES validai_processors(id) ON DELETE CASCADE,

  -- Organization ownership
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users(id),

  -- Discovery metadata (frozen at publish time)
  name text NOT NULL,
  description text,
  usage_description text,
  tags text[],

  -- Tracking
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Add comments
COMMENT ON TABLE validai_playbook_catalog IS
'Discovery metadata for the playbook portal/marketplace. Contains frozen profile data from publish time. Separate from snapshots for RLS separation: catalog is public read, snapshots are access-controlled.';

COMMENT ON COLUMN validai_playbook_catalog.snapshot_id IS
'Reference to the published snapshot. One-to-one relationship (unique constraint).';

COMMENT ON COLUMN validai_playbook_catalog.name IS
'Playbook name frozen at publish time. Does not sync with processor profile edits.';

COMMENT ON COLUMN validai_playbook_catalog.usage_description IS
'User-facing description of how to use the playbook, frozen at publish time.';

COMMENT ON COLUMN validai_playbook_catalog.tags IS
'Searchable tags for discovery, frozen at publish time.';

-- ============================================================================
-- Step 2: Enable RLS with public read, org write policies
-- ============================================================================

ALTER TABLE validai_playbook_catalog ENABLE ROW LEVEL SECURITY;

-- Policy 1: Anyone authenticated can browse the catalog (public read)
CREATE POLICY "Anyone can browse catalog"
  ON validai_playbook_catalog
  FOR SELECT
  USING (
    -- Requires ValidAI app access to browse catalog
    has_app_access('validai')
  );

-- Policy 2: Only creator org can manage their entries (insert, update, delete)
CREATE POLICY "Creator org manages catalog entries"
  ON validai_playbook_catalog
  FOR ALL
  USING (
    organization_id = (auth.jwt() -> 'app_metadata' ->> 'organization_id')::uuid
    AND has_app_access('validai')
  );

-- ============================================================================
-- Step 3: Create indexes for efficient discovery queries
-- ============================================================================

-- Full-text search on name and usage_description
CREATE INDEX idx_catalog_search ON validai_playbook_catalog
  USING gin(to_tsvector('english', name || ' ' || COALESCE(usage_description, '')));

-- Tags array search (for tag filtering)
CREATE INDEX idx_catalog_tags ON validai_playbook_catalog USING gin(tags);

-- Organization lookup (for "my published playbooks")
CREATE INDEX idx_catalog_org ON validai_playbook_catalog(organization_id);

-- Processor lookup (for finding catalog entry by processor)
CREATE INDEX idx_catalog_processor ON validai_playbook_catalog(processor_id);

-- Snapshot lookup (for reverse lookup)
CREATE INDEX idx_catalog_snapshot ON validai_playbook_catalog(snapshot_id);

-- ============================================================================
-- Step 4: Auto-update updated_at timestamp
-- ============================================================================

CREATE OR REPLACE FUNCTION update_validai_playbook_catalog_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_validai_playbook_catalog_updated_at
  BEFORE UPDATE ON validai_playbook_catalog
  FOR EACH ROW
  EXECUTE FUNCTION update_validai_playbook_catalog_updated_at();

-- ============================================================================
-- Step 5: Verification
-- ============================================================================

DO $$
DECLARE
  v_table_exists boolean;
  v_rls_enabled boolean;
  v_index_count int;
BEGIN
  -- Check table exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'validai_playbook_catalog'
  ) INTO v_table_exists;

  -- Check RLS is enabled
  SELECT relrowsecurity INTO v_rls_enabled
  FROM pg_class
  WHERE relname = 'validai_playbook_catalog';

  -- Check indexes created
  SELECT COUNT(*) INTO v_index_count
  FROM pg_indexes
  WHERE tablename = 'validai_playbook_catalog'
    AND indexname LIKE 'idx_catalog_%';

  RAISE NOTICE '=========================================';
  RAISE NOTICE 'Playbook Catalog Migration Complete';
  RAISE NOTICE '=========================================';
  RAISE NOTICE '  Table created: %', CASE WHEN v_table_exists THEN 'YES' ELSE 'NO' END;
  RAISE NOTICE '  RLS enabled: %', CASE WHEN v_rls_enabled THEN 'YES' ELSE 'NO' END;
  RAISE NOTICE '  Search indexes: %/5', v_index_count;
END $$;
