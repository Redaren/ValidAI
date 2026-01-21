-- ============================================================================
-- Migration: Version Management Enhancement
-- Purpose: Add loaded_snapshot_id tracking and version management functions
-- ============================================================================

-- ============================================================================
-- Add loaded_snapshot_id column to track which version is loaded in editor
-- ============================================================================

ALTER TABLE validai_processors
ADD COLUMN loaded_snapshot_id uuid REFERENCES validai_playbook_snapshots(id) ON DELETE SET NULL;

COMMENT ON COLUMN validai_processors.loaded_snapshot_id IS
'Reference to the snapshot currently loaded in the editor. NULL = working from scratch or never saved as version.';

-- Index for quick lookups
CREATE INDEX idx_processors_loaded_snapshot ON validai_processors(loaded_snapshot_id)
  WHERE loaded_snapshot_id IS NOT NULL;

-- ============================================================================
-- Update get_processor_with_operations to include loaded_snapshot_id
-- ============================================================================

CREATE OR REPLACE FUNCTION get_processor_with_operations(p_processor_id uuid)
RETURNS TABLE (
  processor_id uuid,
  processor_name text,
  processor_description text,
  processor_usage_description text,
  processor_status text,
  processor_visibility text,
  processor_system_prompt text,
  processor_area_configuration jsonb,
  processor_configuration jsonb,
  processor_tags text[],
  processor_created_at timestamptz,
  processor_updated_at timestamptz,
  processor_published_at timestamptz,
  processor_loaded_snapshot_id uuid,
  creator_name text,
  operation_id uuid,
  operation_name text,
  operation_description text,
  operation_type text,
  operation_prompt text,
  operation_output_schema jsonb,
  operation_validation_rules jsonb,
  operation_area text,
  operation_position numeric,
  operation_required boolean,
  operation_configuration jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.name,
    p.description,
    p.usage_description,
    p.status::text,
    p.visibility::text,
    p.system_prompt,
    p.area_configuration,
    p.configuration,
    p.tags,
    p.created_at,
    p.updated_at,
    p.published_at,
    p.loaded_snapshot_id,
    prof.full_name,
    o.id,
    o.name,
    o.description,
    o.operation_type::text,
    o.prompt,
    o.output_schema,
    o.validation_rules,
    o.area,
    o.position,
    o.required,
    o.configuration
  FROM validai_processors p
  LEFT JOIN profiles prof ON prof.id = p.created_by
  LEFT JOIN validai_operations o ON o.processor_id = p.id AND o.deleted_at IS NULL
  WHERE p.id = p_processor_id
    AND p.deleted_at IS NULL
  ORDER BY o.area, o.position;
END;
$$;

COMMENT ON FUNCTION get_processor_with_operations(uuid) IS
'Get processor details with all operations, creator profile, and loaded_snapshot_id - Version Management Enhancement';

-- ============================================================================
-- Update get_processor_snapshots to include creator info
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
  created_at timestamptz,
  created_by uuid,
  created_by_name text
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
    s.created_at,
    s.created_by,
    prof.full_name AS created_by_name
  FROM validai_playbook_snapshots s
  LEFT JOIN profiles prof ON prof.id = s.created_by
  WHERE s.processor_id = p_processor_id
    AND s.creator_organization_id = v_org_id
  ORDER BY s.version_number DESC;
END;
$$;

COMMENT ON FUNCTION get_processor_snapshots(uuid) IS
'Lists all snapshots for a processor with creator info, ordered by version (newest first). Only accessible by creator organization.';

-- ============================================================================
-- save_as_version: Create new version without auto-publishing
-- ============================================================================

CREATE OR REPLACE FUNCTION save_as_version(
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
    RAISE EXCEPTION 'Cannot save version with no operations';
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
      'configuration', v_processor.configuration,
      'area_configuration', v_processor.area_configuration
    ),
    'operations', COALESCE(v_operations, '[]'::jsonb)
  );

  -- Insert the snapshot (NOT published by default)
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
    false,  -- NOT published by default
    v_snapshot,
    now()
  )
  RETURNING id INTO v_snapshot_id;

  -- Update processor with loaded_snapshot_id (this is the version we just saved)
  UPDATE validai_processors
  SET
    loaded_snapshot_id = v_snapshot_id,
    updated_at = now()
  WHERE id = p_processor_id;

  -- Return result
  RETURN QUERY SELECT
    v_snapshot_id AS snapshot_id,
    v_next_version AS version_number,
    v_operation_count AS operation_count,
    format('Saved version %s with %s operations', v_next_version, v_operation_count) AS message;
END;
$$;

COMMENT ON FUNCTION save_as_version(uuid, text) IS
'Creates a new version (snapshot) from current processor state without publishing. Sets loaded_snapshot_id to track the saved version.';

GRANT EXECUTE ON FUNCTION save_as_version(uuid, text) TO authenticated;

-- ============================================================================
-- load_snapshot: Load a snapshot version into the editor
-- ============================================================================

CREATE OR REPLACE FUNCTION load_snapshot(
  p_processor_id uuid,
  p_snapshot_id uuid
)
RETURNS TABLE (
  success boolean,
  message text,
  version_number integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_snapshot record;
  v_processor record;
  v_op record;
BEGIN
  -- Get current organization from JWT
  v_org_id := (auth.jwt() -> 'app_metadata' ->> 'organization_id')::uuid;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated with an active organization';
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

  -- Fetch snapshot (must belong to same processor and organization)
  SELECT *
  INTO v_snapshot
  FROM validai_playbook_snapshots
  WHERE id = p_snapshot_id
    AND processor_id = p_processor_id
    AND creator_organization_id = v_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Snapshot not found or does not belong to this processor';
  END IF;

  -- Update processor fields from snapshot
  UPDATE validai_processors
  SET
    system_prompt = v_snapshot.snapshot -> 'processor' ->> 'system_prompt',
    configuration = (v_snapshot.snapshot -> 'processor' -> 'configuration'),
    area_configuration = (v_snapshot.snapshot -> 'processor' -> 'area_configuration'),
    loaded_snapshot_id = p_snapshot_id,
    updated_at = now()
  WHERE id = p_processor_id;

  -- Soft-delete existing operations
  UPDATE validai_operations
  SET deleted_at = now()
  WHERE processor_id = p_processor_id
    AND deleted_at IS NULL;

  -- Insert operations from snapshot
  FOR v_op IN
    SELECT * FROM jsonb_array_elements(v_snapshot.snapshot -> 'operations')
  LOOP
    INSERT INTO validai_operations (
      processor_id,
      organization_id,
      name,
      description,
      operation_type,
      prompt,
      position,
      area,
      configuration,
      output_schema,
      created_at,
      updated_at
    )
    VALUES (
      p_processor_id,
      v_org_id,
      v_op.value ->> 'name',
      v_op.value ->> 'description',
      (v_op.value ->> 'operation_type')::operation_type,
      v_op.value ->> 'prompt',
      (v_op.value ->> 'position')::numeric,
      v_op.value ->> 'area',
      v_op.value -> 'configuration',
      v_op.value -> 'output_schema',
      now(),
      now()
    );
  END LOOP;

  RETURN QUERY SELECT
    true AS success,
    format('Loaded version %s', v_snapshot.version_number) AS message,
    v_snapshot.version_number AS version_number;
END;
$$;

COMMENT ON FUNCTION load_snapshot(uuid, uuid) IS
'Loads a snapshot version into the processor editor. Replaces current processor config and operations with snapshot data.';

GRANT EXECUTE ON FUNCTION load_snapshot(uuid, uuid) TO authenticated;

-- ============================================================================
-- set_published_version: Toggle publish status on existing snapshot
-- ============================================================================

CREATE OR REPLACE FUNCTION set_published_version(
  p_snapshot_id uuid,
  p_publish boolean
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

  IF p_publish THEN
    -- Publishing: unpublish any other published snapshot for this processor first
    UPDATE validai_playbook_snapshots
    SET
      is_published = false,
      unpublished_at = now(),
      updated_at = now()
    WHERE processor_id = v_snapshot.processor_id
      AND is_published = true
      AND id != p_snapshot_id;

    -- Publish this snapshot
    UPDATE validai_playbook_snapshots
    SET
      is_published = true,
      unpublished_at = NULL,
      updated_at = now()
    WHERE id = p_snapshot_id;

    -- Update processor with active snapshot reference and status
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
      format('Version %s is now published', v_snapshot.version_number) AS message;
  ELSE
    -- Unpublishing
    UPDATE validai_playbook_snapshots
    SET
      is_published = false,
      unpublished_at = now(),
      updated_at = now()
    WHERE id = p_snapshot_id;

    -- Clear active_snapshot_id on processor if this was the active one
    IF v_snapshot.processor_id IS NOT NULL THEN
      UPDATE validai_processors
      SET
        active_snapshot_id = NULL,
        status = 'draft',
        updated_at = now()
      WHERE id = v_snapshot.processor_id
        AND active_snapshot_id = p_snapshot_id;
    END IF;

    RETURN QUERY SELECT
      true AS success,
      format('Version %s is now unpublished', v_snapshot.version_number) AS message;
  END IF;
END;
$$;

COMMENT ON FUNCTION set_published_version(uuid, boolean) IS
'Toggle publish status on an existing snapshot. Only one version can be published at a time per processor.';

GRANT EXECUTE ON FUNCTION set_published_version(uuid, boolean) TO authenticated;

-- ============================================================================
-- Verification
-- ============================================================================

DO $$
DECLARE
  v_has_loaded_snapshot_col boolean;
  v_functions_created int;
BEGIN
  -- Check column was added
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'validai_processors'
      AND column_name = 'loaded_snapshot_id'
  ) INTO v_has_loaded_snapshot_col;

  -- Check functions exist
  SELECT COUNT(*) INTO v_functions_created
  FROM information_schema.routines
  WHERE routine_schema = 'public'
    AND routine_name IN ('save_as_version', 'load_snapshot', 'set_published_version');

  RAISE NOTICE '✅ Version Management Migration Complete';
  RAISE NOTICE '   - loaded_snapshot_id column: %', CASE WHEN v_has_loaded_snapshot_col THEN 'added' ELSE 'MISSING' END;
  RAISE NOTICE '   - New functions created: %/3', v_functions_created;
END $$;
