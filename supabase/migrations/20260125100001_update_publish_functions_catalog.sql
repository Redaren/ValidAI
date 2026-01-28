-- ============================================================================
-- Migration: Update Publish Functions for Catalog Management
-- Purpose: Add catalog entry creation/deletion to publish/unpublish workflows
--
-- Updates:
-- 1. publish_playbook - Creates catalog entry after creating snapshot
-- 2. set_published_version - Upserts/deletes catalog entry on publish/unpublish
-- 3. unpublish_playbook - Deletes catalog entry for unpublished snapshot
-- 4. republish_playbook - Creates catalog entry when republishing
-- ============================================================================

-- ============================================================================
-- Step 1: Update publish_playbook to create catalog entry
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
  v_old_snapshot_id uuid;
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

  -- Get any existing published snapshot ID (for catalog cleanup)
  SELECT id INTO v_old_snapshot_id
  FROM validai_playbook_snapshots
  WHERE processor_id = p_processor_id AND is_published = true;

  -- Delete old catalog entry if exists (will be replaced with new one)
  IF v_old_snapshot_id IS NOT NULL THEN
    DELETE FROM validai_playbook_catalog
    WHERE snapshot_id = v_old_snapshot_id;
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
  SELECT COALESCE(MAX(ps.version_number), 0) + 1
  INTO v_next_version
  FROM validai_playbook_snapshots ps
  WHERE ps.processor_id = p_processor_id;

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

  -- Create catalog entry with frozen profile metadata
  INSERT INTO validai_playbook_catalog (
    snapshot_id,
    processor_id,
    organization_id,
    created_by,
    name,
    description,
    usage_description,
    tags
  )
  VALUES (
    v_snapshot_id,
    p_processor_id,
    v_org_id,
    v_user_id,
    v_processor.name,
    v_processor.description,
    v_processor.usage_description,
    v_processor.tags
  );

  -- Return result (use explicit variable names to avoid ambiguity)
  RETURN QUERY SELECT
    v_snapshot_id,
    v_next_version,
    v_operation_count,
    format('Published version %s with %s operations', v_next_version, v_operation_count)::text;
END;
$$;

COMMENT ON FUNCTION publish_playbook(uuid, text) IS
'Creates a frozen snapshot of a processor and its operations. Also creates a catalog entry with frozen profile metadata for discovery. Auto-unpublishes any existing published snapshot for this processor.';

-- ============================================================================
-- Step 2: Update unpublish_playbook to delete catalog entry
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

  -- Delete catalog entry (cleaner than leaving orphaned entries)
  DELETE FROM validai_playbook_catalog
  WHERE snapshot_id = p_snapshot_id;

  -- Update snapshot to unpublished
  UPDATE validai_playbook_snapshots
  SET
    is_published = false,
    unpublished_at = now(),
    updated_at = now()
  WHERE id = p_snapshot_id;

  RETURN QUERY SELECT
    true AS success,
    format('Version %s unpublished successfully', v_snapshot.version_number) AS message;
END;
$$;

COMMENT ON FUNCTION unpublish_playbook(uuid) IS
'Hides a published snapshot without deleting it. Also removes the catalog entry for discovery. Catalog entry is recreated on re-publish.';

-- ============================================================================
-- Step 3: Update republish_playbook to create catalog entry
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
  v_user_id uuid;
  v_snapshot record;
  v_processor record;
  v_processor_id uuid;
  v_old_snapshot_id uuid;
BEGIN
  -- Get current user and organization from JWT
  v_user_id := auth.uid();
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
    SELECT * INTO v_processor
    FROM validai_processors
    WHERE id = v_processor_id AND deleted_at IS NULL;

    IF FOUND AND v_processor.status = 'archived' THEN
      RAISE EXCEPTION 'Cannot republish snapshot for an archived processor';
    END IF;
  END IF;

  -- Get any existing published snapshot ID (for catalog cleanup)
  IF v_processor_id IS NOT NULL THEN
    SELECT id INTO v_old_snapshot_id
    FROM validai_playbook_snapshots
    WHERE processor_id = v_processor_id AND is_published = true;

    -- Delete old catalog entry if exists
    IF v_old_snapshot_id IS NOT NULL THEN
      DELETE FROM validai_playbook_catalog
      WHERE snapshot_id = v_old_snapshot_id;
    END IF;

    -- Unpublish any existing published snapshot for this processor
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

  -- Create catalog entry with CURRENT processor profile data (frozen now)
  -- This allows republishing to pick up profile changes
  IF v_processor_id IS NOT NULL AND v_processor.id IS NOT NULL THEN
    INSERT INTO validai_playbook_catalog (
      snapshot_id,
      processor_id,
      organization_id,
      created_by,
      name,
      description,
      usage_description,
      tags
    )
    VALUES (
      p_snapshot_id,
      v_processor_id,
      v_org_id,
      v_user_id,
      v_processor.name,
      v_processor.description,
      v_processor.usage_description,
      v_processor.tags
    );
  ELSE
    -- Fallback: use snapshot data if processor is gone/orphaned
    INSERT INTO validai_playbook_catalog (
      snapshot_id,
      processor_id,
      organization_id,
      created_by,
      name,
      description,
      usage_description,
      tags
    )
    VALUES (
      p_snapshot_id,
      v_processor_id,
      v_org_id,
      v_user_id,
      v_snapshot.name,
      v_snapshot.description,
      NULL,  -- usage_description not in snapshot
      NULL   -- tags not in snapshot
    );
  END IF;

  RETURN QUERY SELECT
    true AS success,
    format('Version %s republished successfully', v_snapshot.version_number) AS message;
END;
$$;

COMMENT ON FUNCTION republish_playbook(uuid) IS
'Re-activates a previously unpublished snapshot. Creates a new catalog entry with current processor profile data. Auto-unpublishes any other published snapshot for the same processor.';

-- ============================================================================
-- Step 4: Update set_published_version to manage catalog
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
  v_user_id uuid;
  v_snapshot record;
  v_processor record;
  v_processor_id uuid;
  v_old_snapshot_id uuid;
BEGIN
  -- Get current user and organization from JWT
  v_user_id := auth.uid();
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

  -- Get processor_id from snapshot
  v_processor_id := v_snapshot.processor_id;

  IF p_publish THEN
    -- === PUBLISHING ===

    -- Check if processor is archived (if linked)
    IF v_processor_id IS NOT NULL THEN
      SELECT * INTO v_processor
      FROM validai_processors
      WHERE id = v_processor_id AND deleted_at IS NULL;

      IF FOUND AND v_processor.status = 'archived' THEN
        RAISE EXCEPTION 'Cannot publish snapshot for an archived processor';
      END IF;
    END IF;

    -- Get any existing published snapshot ID (for catalog cleanup)
    IF v_processor_id IS NOT NULL THEN
      SELECT id INTO v_old_snapshot_id
      FROM validai_playbook_snapshots
      WHERE processor_id = v_processor_id
        AND is_published = true
        AND id != p_snapshot_id;

      -- Delete old catalog entry if exists
      IF v_old_snapshot_id IS NOT NULL THEN
        DELETE FROM validai_playbook_catalog
        WHERE snapshot_id = v_old_snapshot_id;
      END IF;

      -- Unpublish any other published snapshot for this processor first
      UPDATE validai_playbook_snapshots
      SET
        is_published = false,
        unpublished_at = now(),
        updated_at = now()
      WHERE processor_id = v_processor_id
        AND is_published = true
        AND id != p_snapshot_id;
    END IF;

    -- Publish this snapshot
    UPDATE validai_playbook_snapshots
    SET
      is_published = true,
      unpublished_at = NULL,
      updated_at = now()
    WHERE id = p_snapshot_id;

    -- Create catalog entry with current processor profile data
    IF v_processor_id IS NOT NULL AND v_processor.id IS NOT NULL THEN
      INSERT INTO validai_playbook_catalog (
        snapshot_id,
        processor_id,
        organization_id,
        created_by,
        name,
        description,
        usage_description,
        tags
      )
      VALUES (
        p_snapshot_id,
        v_processor_id,
        v_org_id,
        v_user_id,
        v_processor.name,
        v_processor.description,
        v_processor.usage_description,
        v_processor.tags
      )
      ON CONFLICT (snapshot_id)
      DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        usage_description = EXCLUDED.usage_description,
        tags = EXCLUDED.tags,
        updated_at = now();
    ELSE
      -- Fallback: use snapshot data if processor is gone/orphaned
      INSERT INTO validai_playbook_catalog (
        snapshot_id,
        processor_id,
        organization_id,
        created_by,
        name,
        description,
        usage_description,
        tags
      )
      VALUES (
        p_snapshot_id,
        v_processor_id,
        v_org_id,
        v_user_id,
        v_snapshot.name,
        v_snapshot.description,
        NULL,
        NULL
      )
      ON CONFLICT (snapshot_id)
      DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        updated_at = now();
    END IF;

    RETURN QUERY SELECT
      true,
      format('Version %s is now published', v_snapshot.version_number);
  ELSE
    -- === UNPUBLISHING ===

    -- Delete catalog entry
    DELETE FROM validai_playbook_catalog
    WHERE snapshot_id = p_snapshot_id;

    -- Unpublish the snapshot
    UPDATE validai_playbook_snapshots
    SET
      is_published = false,
      unpublished_at = now(),
      updated_at = now()
    WHERE id = p_snapshot_id;

    RETURN QUERY SELECT
      true,
      format('Version %s is now unpublished', v_snapshot.version_number);
  END IF;
END;
$$;

COMMENT ON FUNCTION set_published_version(uuid, boolean) IS
'Toggle publish status on an existing snapshot. On publish: creates catalog entry with current processor profile data. On unpublish: removes catalog entry. Only one version can be published at a time per processor.';

-- ============================================================================
-- Step 5: Update archive trigger to also clean up catalog
-- ============================================================================

CREATE OR REPLACE FUNCTION unpublish_snapshots_on_archive()
RETURNS TRIGGER AS $$
BEGIN
  -- When processor is archived, unpublish all its snapshots and remove catalog entries
  IF NEW.status = 'archived' AND OLD.status != 'archived' THEN
    -- Delete catalog entries for any published snapshots
    DELETE FROM validai_playbook_catalog
    WHERE snapshot_id IN (
      SELECT id FROM validai_playbook_snapshots
      WHERE processor_id = NEW.id AND is_published = true
    );

    -- Unpublish all snapshots
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
'Automatically unpublishes all snapshots and removes catalog entries when a processor is archived. Ensures archived processors have no live published versions.';

-- ============================================================================
-- Step 6: Verification
-- ============================================================================

DO $$
DECLARE
  v_functions_updated int;
BEGIN
  -- Check functions exist and are updated
  SELECT COUNT(*) INTO v_functions_updated
  FROM information_schema.routines
  WHERE routine_schema = 'public'
    AND routine_name IN ('publish_playbook', 'unpublish_playbook', 'republish_playbook', 'set_published_version');

  RAISE NOTICE '=========================================';
  RAISE NOTICE 'Publish Functions Catalog Update Complete';
  RAISE NOTICE '=========================================';
  RAISE NOTICE '  Functions updated: %/4', v_functions_updated;
  RAISE NOTICE '  Archive trigger updated: YES';
  RAISE NOTICE '';
  RAISE NOTICE '  Workflow Changes:';
  RAISE NOTICE '  - publish_playbook: creates catalog entry';
  RAISE NOTICE '  - unpublish_playbook: deletes catalog entry';
  RAISE NOTICE '  - republish_playbook: creates catalog entry';
  RAISE NOTICE '  - set_published_version: manages catalog entry';
END $$;
