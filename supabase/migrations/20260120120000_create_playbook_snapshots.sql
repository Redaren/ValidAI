-- ============================================================================
-- Migration: Create Playbook Snapshots Table
-- Purpose: Store frozen, published versions of playbooks/processors
-- ============================================================================

-- New table for published playbook snapshots
-- Separate from validai_processors to support:
-- - Different RLS policies for creators vs. runners
-- - Public portal showing all published snapshots (future)
-- - Billing that follows the runner (not the creator)
-- - Copy/fork capability for portal visitors (future)
CREATE TABLE validai_playbook_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Link to source processor (nullable for copied/orphaned snapshots)
  processor_id uuid REFERENCES validai_processors(id) ON DELETE SET NULL,

  -- Ownership: who created this snapshot
  creator_organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users(id),

  -- Snapshot metadata
  name text NOT NULL,
  description text,
  version_number integer NOT NULL DEFAULT 1,

  -- Visibility control for portal/marketplace (MVP: private, organization only)
  visibility text NOT NULL DEFAULT 'private'
    CHECK (visibility IN ('private', 'organization', 'public')),
  is_published boolean NOT NULL DEFAULT true,  -- Toggle without deleting

  -- Frozen configuration (same structure as validai_runs.snapshot)
  -- {
  --   "processor": { "id", "name", "system_prompt", "configuration" },
  --   "operations": [{ "id", "name", "prompt", "operation_type", ... }]
  -- }
  snapshot jsonb NOT NULL,

  -- Timestamps
  published_at timestamptz NOT NULL DEFAULT now(),
  unpublished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Unique constraint: one version number per processor
  UNIQUE (processor_id, version_number)
);

-- Add comment explaining the table purpose
COMMENT ON TABLE validai_playbook_snapshots IS
'Stores frozen, published versions of playbooks/processors. Separate from validai_processors to support different RLS policies for creators vs. runners, enabling future portal/marketplace functionality.';

COMMENT ON COLUMN validai_playbook_snapshots.visibility IS
'Access control: private (creator org only), organization (all org members), public (everyone - portal phase)';

COMMENT ON COLUMN validai_playbook_snapshots.is_published IS
'Toggle to unpublish without deleting. Unpublished snapshots are hidden from galleries/portal but data is preserved.';

COMMENT ON COLUMN validai_playbook_snapshots.snapshot IS
'Frozen configuration containing processor settings and all operations at time of publish. Same structure as validai_runs.snapshot for consistency.';

-- ============================================================================
-- Add reference to active snapshot on processor table
-- ============================================================================

-- Add column to track the currently active published snapshot
ALTER TABLE validai_processors
ADD COLUMN active_snapshot_id uuid REFERENCES validai_playbook_snapshots(id) ON DELETE SET NULL;

COMMENT ON COLUMN validai_processors.active_snapshot_id IS
'Reference to the currently active published snapshot. NULL = no published version (draft only).';

-- ============================================================================
-- Add snapshot reference to runs table for portal/gallery runs
-- ============================================================================

-- Add column to track which snapshot was used for the run
ALTER TABLE validai_runs
ADD COLUMN playbook_snapshot_id uuid REFERENCES validai_playbook_snapshots(id) ON DELETE SET NULL;

COMMENT ON COLUMN validai_runs.playbook_snapshot_id IS
'Reference to the published snapshot used for this run. NULL = used live processor data (legacy or draft run).';

-- ============================================================================
-- Indexes for common queries
-- ============================================================================

-- Find snapshots for a processor
CREATE INDEX idx_playbook_snapshots_processor ON validai_playbook_snapshots(processor_id);

-- Find snapshots by creator organization
CREATE INDEX idx_playbook_snapshots_creator_org ON validai_playbook_snapshots(creator_organization_id);

-- Find published snapshots by visibility (for galleries/portal)
CREATE INDEX idx_playbook_snapshots_visibility ON validai_playbook_snapshots(visibility, is_published)
  WHERE is_published = true;

-- Find active snapshot for processor quickly
CREATE INDEX idx_processors_active_snapshot ON validai_processors(active_snapshot_id)
  WHERE active_snapshot_id IS NOT NULL;

-- Find runs by snapshot (for analytics/usage tracking)
CREATE INDEX idx_runs_snapshot ON validai_runs(playbook_snapshot_id)
  WHERE playbook_snapshot_id IS NOT NULL;

-- ============================================================================
-- RLS Policies
-- ============================================================================

ALTER TABLE validai_playbook_snapshots ENABLE ROW LEVEL SECURITY;

-- Policy 1: Creators can manage their org's snapshots (full CRUD)
CREATE POLICY "Creators manage own org snapshots"
  ON validai_playbook_snapshots
  FOR ALL
  USING (
    creator_organization_id = (auth.jwt() -> 'app_metadata' ->> 'organization_id')::uuid
    AND has_app_access('validai')
  );

-- Policy 2: Organization members can READ org-visible snapshots from same org
-- (They can see snapshots marked as 'organization' visibility from their org)
CREATE POLICY "Org snapshots readable by org members"
  ON validai_playbook_snapshots
  FOR SELECT
  USING (
    visibility = 'organization'
    AND is_published = true
    AND creator_organization_id = (auth.jwt() -> 'app_metadata' ->> 'organization_id')::uuid
    AND has_app_access('validai')
  );

-- Policy 3: Anyone can READ public published snapshots (portal access - future)
-- Note: Public visibility is deferred to portal phase, but policy is ready
CREATE POLICY "Public snapshots readable by all authenticated"
  ON validai_playbook_snapshots
  FOR SELECT
  USING (
    visibility = 'public'
    AND is_published = true
    AND has_app_access('validai')
  );

-- ============================================================================
-- Updated_at trigger
-- ============================================================================

-- Auto-update updated_at timestamp for playbook snapshots
CREATE OR REPLACE FUNCTION update_validai_playbook_snapshots_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_validai_playbook_snapshots_updated_at
  BEFORE UPDATE ON validai_playbook_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION update_validai_playbook_snapshots_updated_at();
