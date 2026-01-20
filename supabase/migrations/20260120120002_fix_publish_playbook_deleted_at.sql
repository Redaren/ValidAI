-- ============================================================================
-- Migration: Fix publish_playbook function
-- Purpose: Remove reference to non-existent deleted_at column on validai_operations
-- Bug: The publish_playbook function incorrectly filtered by op.deleted_at IS NULL
--      but validai_operations table does NOT have a deleted_at column
--      (only validai_processors has soft delete via deleted_at)
-- ============================================================================

-- Replace the publish_playbook function with the corrected version
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
  -- NOTE: validai_operations does NOT have deleted_at column (no soft delete)
  -- Only validai_processors has soft delete
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
  -- FIXED: Removed "AND op.deleted_at IS NULL" - column doesn't exist

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
'Creates a frozen snapshot of a processor and its operations. Sets the processor status to published and links to the active snapshot. Fixed: Removed incorrect deleted_at filter on operations table.';
