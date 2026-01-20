-- ============================================================================
-- Migration: Playbook Snapshot RPC Functions
-- Purpose: Functions for publishing, unpublishing, and managing playbook snapshots
-- ============================================================================

-- ============================================================================
-- publish_playbook: Create a new frozen snapshot from current processor state
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

  -- Fetch and build operations array
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
  WHERE op.processor_id = p_processor_id
    AND op.deleted_at IS NULL;

  -- Check for at least one operation
  IF v_operation_count = 0 THEN
    RAISE EXCEPTION 'Cannot publish processor with no operations';
  END IF;

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

  -- Update processor with active snapshot reference and status
  UPDATE validai_processors
  SET
    active_snapshot_id = v_snapshot_id,
    status = 'published',
    published_at = now(),
    updated_at = now()
  WHERE id = p_processor_id;

  -- Return result
  RETURN QUERY SELECT
    v_snapshot_id AS snapshot_id,
    v_next_version AS version_number,
    v_operation_count AS operation_count,
    format('Published version %s with %s operations', v_next_version, v_operation_count) AS message;
END;
$$;

COMMENT ON FUNCTION publish_playbook(uuid, text) IS
'Creates a frozen snapshot of a processor and its operations. Sets the processor status to published and links to the active snapshot.';

-- ============================================================================
-- unpublish_playbook: Hide a published snapshot without deleting
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

  -- Clear active_snapshot_id on processor if this was the active one
  UPDATE validai_processors
  SET
    active_snapshot_id = NULL,
    status = 'draft',
    updated_at = now()
  WHERE active_snapshot_id = p_snapshot_id;

  RETURN QUERY SELECT
    true AS success,
    format('Version %s unpublished successfully', v_snapshot.version_number) AS message;
END;
$$;

COMMENT ON FUNCTION unpublish_playbook(uuid) IS
'Hides a published snapshot without deleting it. Clears active_snapshot_id on processor and sets status back to draft.';

-- ============================================================================
-- republish_playbook: Re-activate a previously unpublished snapshot
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

  -- Update snapshot to published
  UPDATE validai_playbook_snapshots
  SET
    is_published = true,
    unpublished_at = NULL,
    updated_at = now()
  WHERE id = p_snapshot_id;

  -- Update processor with active snapshot reference (if linked)
  IF v_snapshot.processor_id IS NOT NULL THEN
    UPDATE validai_processors
    SET
      active_snapshot_id = p_snapshot_id,
      status = 'published',
      published_at = now(),
      updated_at = now()
    WHERE id = v_snapshot.processor_id;
  END IF;

  RETURN QUERY SELECT
    true AS success,
    format('Version %s republished successfully', v_snapshot.version_number) AS message;
END;
$$;

COMMENT ON FUNCTION republish_playbook(uuid) IS
'Re-activates a previously unpublished snapshot. Restores active_snapshot_id on processor and sets status to published.';

-- ============================================================================
-- update_playbook_visibility: Change visibility of a snapshot
-- ============================================================================

CREATE OR REPLACE FUNCTION update_playbook_visibility(
  p_snapshot_id uuid,
  p_visibility text
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

  -- Validate visibility
  IF p_visibility NOT IN ('private', 'organization', 'public') THEN
    RAISE EXCEPTION 'Invalid visibility. Must be: private, organization, or public';
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

  -- Update visibility
  UPDATE validai_playbook_snapshots
  SET
    visibility = p_visibility,
    updated_at = now()
  WHERE id = p_snapshot_id;

  RETURN QUERY SELECT
    true AS success,
    format('Visibility updated to %s', p_visibility) AS message;
END;
$$;

COMMENT ON FUNCTION update_playbook_visibility(uuid, text) IS
'Changes the visibility of a published snapshot. Only the creator organization can change visibility.';

-- ============================================================================
-- get_playbook_snapshot: Fetch a snapshot by ID (for running from snapshot)
-- ============================================================================

CREATE OR REPLACE FUNCTION get_playbook_snapshot(
  p_snapshot_id uuid
)
RETURNS TABLE (
  id uuid,
  processor_id uuid,
  creator_organization_id uuid,
  name text,
  description text,
  version_number integer,
  visibility text,
  is_published boolean,
  snapshot jsonb,
  published_at timestamptz,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
BEGIN
  -- Get current organization from JWT
  v_org_id := (auth.jwt() -> 'app_metadata' ->> 'organization_id')::uuid;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated with an active organization';
  END IF;

  RETURN QUERY
  SELECT
    s.id,
    s.processor_id,
    s.creator_organization_id,
    s.name,
    s.description,
    s.version_number,
    s.visibility,
    s.is_published,
    s.snapshot,
    s.published_at,
    s.created_at
  FROM validai_playbook_snapshots s
  WHERE s.id = p_snapshot_id
    AND s.is_published = true
    AND (
      -- Creator org can always access their own snapshots
      s.creator_organization_id = v_org_id
      -- Organization visibility: same org members
      OR (s.visibility = 'organization' AND s.creator_organization_id = v_org_id)
      -- Public visibility: anyone with app access
      OR s.visibility = 'public'
    );
END;
$$;

COMMENT ON FUNCTION get_playbook_snapshot(uuid) IS
'Fetches a published snapshot by ID. Respects visibility rules: private (creator org only), organization (same org), public (anyone).';

-- ============================================================================
-- get_processor_snapshots: List all snapshots for a processor
-- ============================================================================

CREATE OR REPLACE FUNCTION get_processor_snapshots(
  p_processor_id uuid
)
RETURNS TABLE (
  id uuid,
  version_number integer,
  visibility text,
  is_published boolean,
  operation_count integer,
  published_at timestamptz,
  unpublished_at timestamptz,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
BEGIN
  -- Get current organization from JWT
  v_org_id := (auth.jwt() -> 'app_metadata' ->> 'organization_id')::uuid;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated with an active organization';
  END IF;

  RETURN QUERY
  SELECT
    s.id,
    s.version_number,
    s.visibility,
    s.is_published,
    jsonb_array_length(s.snapshot -> 'operations')::integer AS operation_count,
    s.published_at,
    s.unpublished_at,
    s.created_at
  FROM validai_playbook_snapshots s
  WHERE s.processor_id = p_processor_id
    AND s.creator_organization_id = v_org_id
  ORDER BY s.version_number DESC;
END;
$$;

COMMENT ON FUNCTION get_processor_snapshots(uuid) IS
'Lists all snapshots for a processor, ordered by version (newest first). Only accessible by creator organization.';

-- ============================================================================
-- Grant execute permissions
-- ============================================================================

GRANT EXECUTE ON FUNCTION publish_playbook(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION unpublish_playbook(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION republish_playbook(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION update_playbook_visibility(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_playbook_snapshot(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_processor_snapshots(uuid) TO authenticated;
