-- ============================================================================
-- Migration: Refactor Playbook Snapshot Architecture
-- Purpose: Make snapshot table self-contained and marketplace-ready
--
-- Changes:
-- 1. Simplify processor status: add 'active' value, migrate data from draft/published
-- 2. Add unique constraint for one published snapshot per processor
-- 3. Remove active_snapshot_id from processors (snapshot table is source of truth)
-- 4. Add trigger to unpublish snapshots when processor is archived
-- 5. Update RPC functions to work with new architecture
--
-- Note: PostgreSQL doesn't support removing enum values, so 'draft' and 'published'
-- remain in the enum but are no longer used. The application uses 'active' | 'archived'.
-- ============================================================================

-- ============================================================================
-- Step 1: Update processor_status enum
-- Add 'active' value and migrate all draft/published processors to 'active'
-- ============================================================================

-- Add 'active' to existing enum (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'processor_status')
    AND enumlabel = 'active'
  ) THEN
    ALTER TYPE processor_status ADD VALUE 'active';
  END IF;
END $$;

-- Update all processors to use 'active' instead of 'draft' or 'published'
UPDATE validai_processors
SET status = 'active'::processor_status
WHERE status IN ('draft'::processor_status, 'published'::processor_status);

-- Update the default to 'active'
ALTER TABLE validai_processors
  ALTER COLUMN status SET DEFAULT 'active'::processor_status;

-- ============================================================================
-- Step 2: Add unique constraint for published snapshots
-- Ensures only one published snapshot per processor at a time
-- ============================================================================

-- First, clean up any existing duplicates (keep only the latest version)
WITH ranked AS (
  SELECT id, processor_id, version_number,
         ROW_NUMBER() OVER (PARTITION BY processor_id ORDER BY version_number DESC) as rn
  FROM validai_playbook_snapshots
  WHERE is_published = true
)
UPDATE validai_playbook_snapshots s
SET is_published = false, unpublished_at = now()
FROM ranked r
WHERE s.id = r.id AND r.rn > 1;

-- Create partial unique index (only one published snapshot per processor)
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_published_snapshot_per_processor
  ON validai_playbook_snapshots (processor_id)
  WHERE is_published = true;

COMMENT ON INDEX idx_one_published_snapshot_per_processor IS
'Ensures only one snapshot can be published per processor at any time. Marketplace queries can rely on this constraint.';

-- ============================================================================
-- Step 3: Remove active_snapshot_id from processors
-- Snapshot table becomes the source of truth for "published" state
-- ============================================================================

-- Drop the index first (if exists)
DROP INDEX IF EXISTS idx_processors_active_snapshot;

-- Drop the foreign key constraint and column
ALTER TABLE validai_processors
  DROP COLUMN IF EXISTS active_snapshot_id;

-- ============================================================================
-- Step 4: Add trigger to unpublish snapshots when processor is archived
-- ============================================================================

CREATE OR REPLACE FUNCTION unpublish_snapshots_on_archive()
RETURNS TRIGGER AS $$
BEGIN
  -- When processor is archived, unpublish all its snapshots
  IF NEW.status = 'archived' AND OLD.status != 'archived' THEN
    UPDATE validai_playbook_snapshots
    SET
      is_published = false,
      unpublished_at = now(),
      updated_at = now()
    WHERE processor_id = NEW.id AND is_published = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION unpublish_snapshots_on_archive() IS
'Automatically unpublishes all snapshots when a processor is archived. Ensures archived processors have no live published versions.';

-- Create trigger (drop first if exists to avoid duplicates)
DROP TRIGGER IF EXISTS trg_unpublish_on_archive ON validai_processors;

CREATE TRIGGER trg_unpublish_on_archive
  AFTER UPDATE ON validai_processors
  FOR EACH ROW
  EXECUTE FUNCTION unpublish_snapshots_on_archive();

-- ============================================================================
-- Step 5: Update publish_playbook function
-- No longer sets active_snapshot_id, auto-unpublishes existing published snapshot
-- ============================================================================

CREATE OR REPLACE FUNCTION publish_playbook(
  p_processor_id uuid,
  p_visibility text DEFAULT 'private'
)
RETURNS TABLE (
  snapshot_id uuid,
  version_number integer,
  operation_count integer,
  message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_org_id uuid;
  v_processor record;
  v_operations jsonb;
  v_operation_count integer;
  v_next_version integer;
  v_snapshot_id uuid;
  v_snapshot jsonb;
BEGIN
  -- Get current user and organization from JWT
  v_user_id := auth.uid();
  v_org_id := (auth.jwt() -> 'app_metadata' ->> 'organization_id')::uuid;

  IF v_user_id IS NULL OR v_org_id IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated with an active organization';
  END IF;

  -- Validate visibility
  IF p_visibility NOT IN ('private', 'organization', 'public') THEN
    RAISE EXCEPTION 'Invalid visibility. Must be: private, organization, or public';
  END IF;

  -- Fetch processor (must belong to user's organization)
  SELECT *
  INTO v_processor
  FROM validai_processors
  WHERE id = p_processor_id
    AND organization_id = v_org_id
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Processor not found or access denied';
  END IF;

  -- Check processor is not archived
  IF v_processor.status = 'archived' THEN
    RAISE EXCEPTION 'Cannot publish an archived processor';
  END IF;

  -- Fetch and build operations array (no deleted_at column on operations table)
  SELECT
    jsonb_agg(
      jsonb_build_object(
        'id', op.id,
        'name', op.name,
        'description', op.description,
        'operation_type', op.operation_type,
        'prompt', op.prompt,
        'position', op.position,
        'area', op.area,
        'configuration', op.configuration,
        'output_schema', op.output_schema
      ) ORDER BY op.position
    ),
    COUNT(*)::integer
  INTO v_operations, v_operation_count
  FROM validai_operations op
  WHERE op.processor_id = p_processor_id;

  -- Check for at least one operation
  IF v_operation_count = 0 THEN
    RAISE EXCEPTION 'Cannot publish processor with no operations';
  END IF;

  -- Unpublish any existing published snapshot for this processor
  -- (Enforces the one-published-per-processor rule)
  UPDATE validai_playbook_snapshots
  SET
    is_published = false,
    unpublished_at = now(),
    updated_at = now()
  WHERE processor_id = p_processor_id AND is_published = true;

  -- Calculate next version number for this processor
  SELECT COALESCE(MAX(version_number), 0) + 1
  INTO v_next_version
  FROM validai_playbook_snapshots
  WHERE processor_id = p_processor_id;

  -- Build the complete snapshot
  v_snapshot := jsonb_build_object(
    'processor', jsonb_build_object(
      'id', v_processor.id,
      'name', v_processor.name,
      'description', v_processor.description,
      'system_prompt', v_processor.system_prompt,
      'configuration', v_processor.configuration
    ),
    'operations', COALESCE(v_operations, '[]'::jsonb)
  );

  -- Insert the snapshot
  INSERT INTO validai_playbook_snapshots (
    processor_id,
    creator_organization_id,
    created_by,
    name,
    description,
    version_number,
    visibility,
    is_published,
    snapshot,
    published_at
  )
  VALUES (
    p_processor_id,
    v_org_id,
    v_user_id,
    v_processor.name,
    v_processor.description,
    v_next_version,
    p_visibility,
    true,
    v_snapshot,
    now()
  )
  RETURNING id INTO v_snapshot_id;

  -- Note: No longer updating processor.active_snapshot_id or status
  -- Snapshot table is now the source of truth for "published" state

  -- Return result
  RETURN QUERY SELECT
    v_snapshot_id AS snapshot_id,
    v_next_version AS version_number,
    v_operation_count AS operation_count,
    format('Published version %s with %s operations', v_next_version, v_operation_count) AS message;
END;
$$;

COMMENT ON FUNCTION publish_playbook(uuid, text) IS
'Creates a frozen snapshot of a processor and its operations. Auto-unpublishes any existing published snapshot for this processor.';

-- ============================================================================
-- Step 6: Update unpublish_playbook function
-- Simplified: just sets is_published = false on the snapshot
-- ============================================================================

CREATE OR REPLACE FUNCTION unpublish_playbook(
  p_snapshot_id uuid
)
RETURNS TABLE (
  success boolean,
  message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_snapshot record;
BEGIN
  -- Get current organization from JWT
  v_org_id := (auth.jwt() -> 'app_metadata' ->> 'organization_id')::uuid;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated with an active organization';
  END IF;

  -- Fetch snapshot (must belong to user's organization)
  SELECT *
  INTO v_snapshot
  FROM validai_playbook_snapshots
  WHERE id = p_snapshot_id
    AND creator_organization_id = v_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Snapshot not found or access denied';
  END IF;

  IF NOT v_snapshot.is_published THEN
    RETURN QUERY SELECT true, 'Snapshot is already unpublished'::text;
    RETURN;
  END IF;

  -- Update snapshot to unpublished
  UPDATE validai_playbook_snapshots
  SET
    is_published = false,
    unpublished_at = now(),
    updated_at = now()
  WHERE id = p_snapshot_id;

  -- Note: No longer updating processor.active_snapshot_id or status
  -- Snapshot table is now the source of truth

  RETURN QUERY SELECT
    true AS success,
    format('Version %s unpublished successfully', v_snapshot.version_number) AS message;
END;
$$;

COMMENT ON FUNCTION unpublish_playbook(uuid) IS
'Hides a published snapshot without deleting it. Snapshot table is the source of truth for published state.';

-- ============================================================================
-- Step 7: Update republish_playbook function
-- Unpublishes any other published snapshot before republishing target
-- ============================================================================

CREATE OR REPLACE FUNCTION republish_playbook(
  p_snapshot_id uuid
)
RETURNS TABLE (
  success boolean,
  message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_snapshot record;
  v_processor_id uuid;
BEGIN
  -- Get current organization from JWT
  v_org_id := (auth.jwt() -> 'app_metadata' ->> 'organization_id')::uuid;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated with an active organization';
  END IF;

  -- Fetch snapshot (must belong to user's organization)
  SELECT *
  INTO v_snapshot
  FROM validai_playbook_snapshots
  WHERE id = p_snapshot_id
    AND creator_organization_id = v_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Snapshot not found or access denied';
  END IF;

  IF v_snapshot.is_published THEN
    RETURN QUERY SELECT true, 'Snapshot is already published'::text;
    RETURN;
  END IF;

  -- Get processor_id from snapshot
  v_processor_id := v_snapshot.processor_id;

  -- Check if processor is archived (if linked)
  IF v_processor_id IS NOT NULL THEN
    PERFORM 1 FROM validai_processors
    WHERE id = v_processor_id AND status = 'archived';

    IF FOUND THEN
      RAISE EXCEPTION 'Cannot republish snapshot for an archived processor';
    END IF;
  END IF;

  -- Unpublish any existing published snapshot for this processor
  IF v_processor_id IS NOT NULL THEN
    UPDATE validai_playbook_snapshots
    SET
      is_published = false,
      unpublished_at = now(),
      updated_at = now()
    WHERE processor_id = v_processor_id AND is_published = true;
  END IF;

  -- Republish target snapshot
  UPDATE validai_playbook_snapshots
  SET
    is_published = true,
    unpublished_at = NULL,
    updated_at = now()
  WHERE id = p_snapshot_id;

  -- Note: No longer updating processor.active_snapshot_id or status
  -- Snapshot table is now the source of truth

  RETURN QUERY SELECT
    true AS success,
    format('Version %s republished successfully', v_snapshot.version_number) AS message;
END;
$$;

COMMENT ON FUNCTION republish_playbook(uuid) IS
'Re-activates a previously unpublished snapshot. Auto-unpublishes any other published snapshot for the same processor.';

-- ============================================================================
-- Step 8: Add helper function to get published snapshot for a processor
-- ============================================================================

CREATE OR REPLACE FUNCTION get_published_snapshot(p_processor_id uuid)
RETURNS TABLE (
  id uuid,
  version_number integer,
  visibility text,
  published_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.id,
    s.version_number,
    s.visibility,
    s.published_at
  FROM validai_playbook_snapshots s
  WHERE s.processor_id = p_processor_id
    AND s.is_published = true
  LIMIT 1;
$$;

COMMENT ON FUNCTION get_published_snapshot(uuid) IS
'Returns the published snapshot for a processor, or empty if none. Used by UI to check publish status.';

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_published_snapshot(uuid) TO authenticated;

-- ============================================================================
-- Step 9: Update published_at column comment
-- The published state is now tracked in snapshots, not processors
-- ============================================================================

-- Keep published_at column for historical reference but make it independent of status
-- It can track when the processor was first published (historical data)
COMMENT ON COLUMN validai_processors.published_at IS
'Historical: when the processor was first published. Current publish state is tracked in validai_playbook_snapshots.';
