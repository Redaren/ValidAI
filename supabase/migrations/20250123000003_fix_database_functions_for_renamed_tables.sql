-- =============================================================================
-- FIX DATABASE FUNCTIONS FOR RENAMED TABLES
-- =============================================================================
-- Description: Recreate all database functions to use validai_* table names
-- Author: Migration Team
-- Created: 2025-01-23
-- Risk: Medium (function recreation)
-- Note: Updates 10 functions that reference old table names
-- =============================================================================

-- Drop existing functions before recreating
DROP FUNCTION IF EXISTS create_processor_with_operations CASCADE;
DROP FUNCTION IF EXISTS delete_processor_area CASCADE;
DROP FUNCTION IF EXISTS get_ordered_operations CASCADE;
DROP FUNCTION IF EXISTS get_organization_members CASCADE;
DROP FUNCTION IF EXISTS get_processor_with_operations CASCADE;
DROP FUNCTION IF EXISTS get_user_organizations_safe CASCADE;
DROP FUNCTION IF EXISTS get_user_processors CASCADE;
DROP FUNCTION IF EXISTS get_user_processors_debug CASCADE;
DROP FUNCTION IF EXISTS rename_processor_area CASCADE;
DROP FUNCTION IF EXISTS validate_processor_ownership CASCADE;

-- =============================================================================
-- 1. create_processor_with_operations
-- =============================================================================
CREATE OR REPLACE FUNCTION create_processor_with_operations(
  p_name TEXT,
  p_description TEXT,
  p_document_type TEXT,
  p_status processor_status,
  p_visibility processor_visibility,
  p_system_prompt TEXT,
  p_area_configuration JSONB,
  p_configuration JSONB,
  p_tags TEXT[],
  p_operations JSONB
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  status processor_status,
  operation_count INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_processor_id UUID;
  v_organization_id UUID;
  v_operation JSONB;
  v_operation_count INT := 0;
  v_position_counter DECIMAL(20, 10) := 1.0;
BEGIN
  -- Get current organization
  v_organization_id := (auth.jwt() -> 'app_metadata' ->> 'organization_id')::uuid;

  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION 'No organization context found';
  END IF;

  -- Create processor
  INSERT INTO validai_processors (
    organization_id,
    name,
    description,
    document_type,
    status,
    visibility,
    system_prompt,
    area_configuration,
    configuration,
    tags,
    created_by,
    published_at
  ) VALUES (
    v_organization_id,
    p_name,
    p_description,
    p_document_type,
    p_status,
    p_visibility,
    p_system_prompt,
    p_area_configuration,
    p_configuration,
    p_tags,
    auth.uid(),
    CASE WHEN p_status = 'published' THEN NOW() ELSE NULL END
  )
  RETURNING validai_processors.id INTO v_processor_id;

  -- Create operations if provided
  FOR v_operation IN SELECT * FROM jsonb_array_elements(p_operations)
  LOOP
    INSERT INTO validai_operations (
      processor_id,
      name,
      description,
      operation_type,
      prompt,
      output_schema,
      validation_rules,
      area,
      "position",
      required,
      configuration
    ) VALUES (
      v_processor_id,
      v_operation->>'name',
      v_operation->>'description',
      (v_operation->>'operation_type')::operation_type,
      v_operation->>'prompt',
      v_operation->'output_schema',
      v_operation->'validation_rules',
      COALESCE(v_operation->>'area', 'default'),
      COALESCE((v_operation->>'position')::DECIMAL(20, 10), v_position_counter),
      COALESCE((v_operation->>'required')::BOOLEAN, false),
      v_operation->'configuration'
    );

    v_operation_count := v_operation_count + 1;
    v_position_counter := v_position_counter + 1.0;
  END LOOP;

  -- Return result
  RETURN QUERY
  SELECT
    v_processor_id,
    p_name,
    p_status,
    v_operation_count;
END;
$$;

-- =============================================================================
-- 2. delete_processor_area
-- =============================================================================
CREATE OR REPLACE FUNCTION delete_processor_area(
  p_processor_id UUID,
  p_area_name TEXT,
  p_target_area TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_area_config JSONB;
  v_updated_areas JSONB;
  v_operation_count INTEGER;
  v_area_count INTEGER;
BEGIN
  -- Validate inputs
  IF p_area_name IS NULL OR p_area_name = '' THEN
    RAISE EXCEPTION 'Area name cannot be empty';
  END IF;

  -- Get current area_configuration
  SELECT area_configuration INTO v_area_config
  FROM validai_processors
  WHERE id = p_processor_id;

  IF v_area_config IS NULL OR v_area_config->'areas' IS NULL THEN
    RAISE EXCEPTION 'Processor does not have area configuration';
  END IF;

  -- Check if area exists
  IF NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_area_config->'areas') AS area
    WHERE area->>'name' = p_area_name
  ) THEN
    RAISE EXCEPTION 'Area "%" does not exist', p_area_name;
  END IF;

  -- Count total areas
  SELECT jsonb_array_length(v_area_config->'areas') INTO v_area_count;

  -- Prevent deletion of the last area
  IF v_area_count <= 1 THEN
    RAISE EXCEPTION 'Cannot delete the only area. Create another area first.';
  END IF;

  -- Count operations in this area
  SELECT COUNT(*) INTO v_operation_count
  FROM validai_operations
  WHERE processor_id = p_processor_id
    AND area = p_area_name;

  -- If area has operations, require target area
  IF v_operation_count > 0 THEN
    IF p_target_area IS NULL OR p_target_area = '' THEN
      RAISE EXCEPTION 'Area "%" contains % operation(s). Specify a target area to move them.',
        p_area_name, v_operation_count;
    END IF;

    -- Validate target area exists
    IF NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_area_config->'areas') AS area
      WHERE area->>'name' = p_target_area
    ) THEN
      RAISE EXCEPTION 'Target area "%" does not exist', p_target_area;
    END IF;

    -- Cannot move to the same area being deleted
    IF p_target_area = p_area_name THEN
      RAISE EXCEPTION 'Cannot move operations to the area being deleted';
    END IF;

    -- Get max position in target area to append operations
    DECLARE
      v_max_position NUMERIC;
    BEGIN
      SELECT COALESCE(MAX(position), 0) INTO v_max_position
      FROM validai_operations
      WHERE processor_id = p_processor_id
        AND area = p_target_area;

      -- Move all operations to target area, appending to the end
      UPDATE validai_operations
      SET
        area = p_target_area,
        position = v_max_position + position + 1,
        updated_at = now()
      WHERE processor_id = p_processor_id
        AND area = p_area_name;
    END;
  END IF;

  -- Remove area from area_configuration
  SELECT jsonb_build_object(
    'areas', jsonb_agg(area)
  )
  INTO v_updated_areas
  FROM jsonb_array_elements(v_area_config->'areas') AS area
  WHERE area->>'name' != p_area_name;

  -- Recalculate display_order sequentially
  SELECT jsonb_build_object(
    'areas', jsonb_agg(
      jsonb_set(area, '{display_order}', to_jsonb(row_number))
      ORDER BY (area->>'display_order')::int
    )
  )
  INTO v_updated_areas
  FROM (
    SELECT area, row_number() OVER (ORDER BY (area->>'display_order')::int) as row_number
    FROM jsonb_array_elements(v_updated_areas->'areas') AS area
  ) AS numbered_areas;

  -- Update processor with new area configuration
  UPDATE validai_processors
  SET
    area_configuration = v_updated_areas,
    updated_at = now()
  WHERE id = p_processor_id;

END;
$$;

-- =============================================================================
-- 3. get_ordered_operations
-- =============================================================================
CREATE OR REPLACE FUNCTION get_ordered_operations(p_processor_id UUID)
RETURNS TABLE (
  id UUID,
  name TEXT,
  description TEXT,
  operation_type operation_type,
  prompt TEXT,
  output_schema JSONB,
  validation_rules JSONB,
  area TEXT,
  "position" DECIMAL(20, 10),
  required BOOLEAN,
  configuration JSONB,
  display_order INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_processor_record RECORD;
  v_area_config JSONB;
BEGIN
  -- Check if user can view this processor
  SELECT p.*,
         p.organization_id = (auth.jwt() -> 'app_metadata' ->> 'organization_id')::uuid AS is_same_org
  INTO v_processor_record
  FROM validai_processors p
  WHERE p.id = p_processor_id
  AND p.deleted_at IS NULL;

  IF NOT FOUND OR NOT v_processor_record.is_same_org THEN
    RETURN; -- Return empty if processor not found or not accessible
  END IF;

  -- Check visibility
  IF v_processor_record.visibility = 'personal' AND v_processor_record.created_by != auth.uid() THEN
    RETURN; -- Return empty if personal processor and not creator
  END IF;

  -- Get area configuration
  v_area_config := COALESCE(v_processor_record.area_configuration, '{"areas": []}'::jsonb);

  -- Return operations with calculated display order
  RETURN QUERY
  WITH area_orders AS (
    SELECT
      (area_obj->>'name')::text AS area_name,
      (area_obj->>'display_order')::int AS area_order
    FROM jsonb_array_elements(v_area_config->'areas') AS area_obj
  )
  SELECT
    o.id,
    o.name,
    o.description,
    o.operation_type,
    o.prompt,
    o.output_schema,
    o.validation_rules,
    o.area,
    o."position",
    o.required,
    o.configuration,
    ROW_NUMBER() OVER (ORDER BY
      COALESCE(ao.area_order, 999), -- Areas not in config go last
      o."position"
    )::INT AS display_order
  FROM validai_operations o
  LEFT JOIN area_orders ao ON o.area = ao.area_name
  WHERE o.processor_id = p_processor_id
  ORDER BY display_order;
END;
$$;

-- =============================================================================
-- 4. get_organization_members
-- =============================================================================
CREATE OR REPLACE FUNCTION get_organization_members(org_id UUID)
RETURNS TABLE (
  organization_id UUID,
  user_id UUID,
  role TEXT,
  joined_at TIMESTAMPTZ,
  full_name TEXT,
  avatar_url TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify user has access to this organization
  IF NOT EXISTS (
    SELECT 1 FROM validai_organization_members
    WHERE organization_id = org_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied to organization';
  END IF;

  RETURN QUERY
  SELECT
    om.organization_id,
    om.user_id,
    om.role,
    om.joined_at,
    p.full_name,
    p.avatar_url
  FROM validai_organization_members om
  JOIN validai_profiles p ON p.id = om.user_id
  WHERE om.organization_id = org_id;
END;
$$;

-- =============================================================================
-- 5. get_processor_with_operations (CRITICAL - This is causing the error!)
-- =============================================================================
CREATE OR REPLACE FUNCTION get_processor_with_operations(p_processor_id UUID)
RETURNS TABLE (
  id UUID,
  name TEXT,
  description TEXT,
  usage_description TEXT,
  status processor_status,
  visibility processor_visibility,
  system_prompt TEXT,
  area_configuration JSONB,
  configuration JSONB,
  tags TEXT[],
  created_by UUID,
  creator_name TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  operations JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.name,
    p.description,
    p.usage_description,
    p.status,
    p.visibility,
    p.system_prompt,
    p.area_configuration,
    p.configuration,
    p.tags,
    p.created_by,
    prof.full_name,
    p.created_at,
    p.updated_at,
    p.published_at,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', o.id,
            'name', o.name,
            'description', o.description,
            'operation_type', o.operation_type,
            'prompt', o.prompt,
            'output_schema', o.output_schema,
            'validation_rules', o.validation_rules,
            'area', o.area,
            'position', o.position,
            'required', o.required,
            'configuration', o.configuration,
            'created_at', o.created_at,
            'updated_at', o.updated_at
          )
          ORDER BY o.area, o.position
        )
        FROM validai_operations o
        WHERE o.processor_id = p.id
      ),
      '[]'::jsonb
    ) AS operations
  FROM validai_processors p
  LEFT JOIN validai_profiles prof ON prof.id = p.created_by
  WHERE p.id = p_processor_id
    AND p.organization_id = (auth.jwt() -> 'app_metadata' ->> 'organization_id')::uuid
    AND p.deleted_at IS NULL
    AND (
      p.visibility = 'organization'
      OR (p.visibility = 'personal' AND p.created_by = auth.uid())
    );
END;
$$;

-- =============================================================================
-- 6. get_user_organizations_safe
-- =============================================================================
CREATE OR REPLACE FUNCTION get_user_organizations_safe(user_uuid UUID)
RETURNS TABLE (
  id UUID,
  name TEXT,
  slug TEXT,
  plan_type TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  created_by UUID,
  role TEXT,
  joined_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    o.id,
    o.name,
    o.slug,
    o.plan_type,
    o.created_at,
    o.updated_at,
    o.created_by,
    om.role,
    om.joined_at
  FROM validai_organization_members om
  JOIN validai_organizations o ON o.id = om.organization_id
  WHERE om.user_id = user_uuid;
END;
$$;

-- =============================================================================
-- 7. get_user_processors
-- =============================================================================
CREATE OR REPLACE FUNCTION get_user_processors(p_include_archived BOOLEAN DEFAULT false)
RETURNS TABLE (
  id UUID,
  name TEXT,
  description TEXT,
  usage_description TEXT,
  status processor_status,
  visibility processor_visibility,
  tags TEXT[],
  created_by UUID,
  creator_name TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  operation_count BIGINT,
  is_owner BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH processor_operations AS (
    SELECT
      validai_operations.processor_id AS proc_id,
      COUNT(*) AS op_count
    FROM validai_operations
    GROUP BY validai_operations.processor_id
  )
  SELECT
    p.id,
    p.name,
    p.description,
    p.usage_description,
    p.status,
    p.visibility,
    p.tags,
    p.created_by,
    prof.full_name,
    p.created_at,
    p.updated_at,
    p.published_at,
    COALESCE(po.op_count, 0),
    p.created_by = auth.uid() AS is_owner
  FROM validai_processors p
  LEFT JOIN validai_profiles prof ON p.created_by = prof.id
  LEFT JOIN processor_operations po ON p.id = po.proc_id
  WHERE
    p.organization_id = (auth.jwt() -> 'app_metadata' ->> 'organization_id')::uuid
    AND p.deleted_at IS NULL
    AND (p_include_archived OR p.status != 'archived')
    AND (
      p.visibility = 'organization'
      OR (p.visibility = 'personal' AND p.created_by = auth.uid())
    )
  ORDER BY p.updated_at DESC;
END;
$$;

-- =============================================================================
-- 8. get_user_processors_debug
-- =============================================================================
CREATE OR REPLACE FUNCTION get_user_processors_debug(
  p_org_id UUID,
  p_user_id UUID,
  p_include_archived BOOLEAN DEFAULT false
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  description TEXT,
  document_type TEXT,
  status processor_status,
  visibility processor_visibility,
  tags TEXT[],
  created_by UUID,
  creator_name TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  operation_count BIGINT,
  is_owner BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH processor_operations AS (
    SELECT
      validai_operations.processor_id AS proc_id,
      COUNT(*) AS op_count
    FROM validai_operations
    GROUP BY validai_operations.processor_id
  )
  SELECT
    p.id,
    p.name,
    p.description,
    p.document_type,
    p.status,
    p.visibility,
    p.tags,
    p.created_by,
    prof.full_name,
    p.created_at,
    p.updated_at,
    p.published_at,
    COALESCE(po.op_count, 0),
    p.created_by = p_user_id AS is_owner
  FROM validai_processors p
  LEFT JOIN validai_profiles prof ON p.created_by = prof.id
  LEFT JOIN processor_operations po ON p.id = po.proc_id
  WHERE
    p.organization_id = p_org_id
    AND p.deleted_at IS NULL
    AND (p_include_archived OR p.status != 'archived')
    AND (
      p.visibility = 'organization'
      OR (p.visibility = 'personal' AND p.created_by = p_user_id)
    )
  ORDER BY p.updated_at DESC;
END;
$$;

-- =============================================================================
-- 9. rename_processor_area
-- =============================================================================
CREATE OR REPLACE FUNCTION rename_processor_area(
  p_processor_id UUID,
  p_old_name TEXT,
  p_new_name TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_area_config JSONB;
  v_updated_areas JSONB;
BEGIN
  -- Validate inputs
  IF p_old_name IS NULL OR p_old_name = '' THEN
    RAISE EXCEPTION 'Old area name cannot be empty';
  END IF;

  IF p_new_name IS NULL OR p_new_name = '' THEN
    RAISE EXCEPTION 'New area name cannot be empty';
  END IF;

  IF p_old_name = p_new_name THEN
    RETURN; -- No change needed
  END IF;

  -- Get current area_configuration
  SELECT area_configuration INTO v_area_config
  FROM validai_processors
  WHERE id = p_processor_id;

  IF v_area_config IS NULL OR v_area_config->'areas' IS NULL THEN
    RAISE EXCEPTION 'Processor does not have area configuration';
  END IF;

  -- Check if new name already exists
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_area_config->'areas') AS area
    WHERE area->>'name' = p_new_name
  ) THEN
    RAISE EXCEPTION 'Area with name "%" already exists', p_new_name;
  END IF;

  -- Update area_configuration: rename the area
  SELECT jsonb_build_object(
    'areas', jsonb_agg(
      CASE
        WHEN area->>'name' = p_old_name THEN
          jsonb_set(area, '{name}', to_jsonb(p_new_name))
        ELSE
          area
      END
    )
  )
  INTO v_updated_areas
  FROM jsonb_array_elements(v_area_config->'areas') AS area;

  -- Update processor with new area configuration
  UPDATE validai_processors
  SET
    area_configuration = v_updated_areas,
    updated_at = now()
  WHERE id = p_processor_id;

  -- Update all operations with the old area name to use the new name
  UPDATE validai_operations
  SET
    area = p_new_name,
    updated_at = now()
  WHERE processor_id = p_processor_id
    AND area = p_old_name;

END;
$$;

-- =============================================================================
-- 10. validate_processor_ownership
-- =============================================================================
CREATE OR REPLACE FUNCTION validate_processor_ownership(
  p_processor_id UUID,
  p_require_owner BOOLEAN DEFAULT false
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_processor RECORD;
  v_user_role TEXT;
BEGIN
  -- Get processor info
  SELECT
    p.organization_id,
    p.created_by,
    p.visibility,
    p.deleted_at
  INTO v_processor
  FROM validai_processors p
  WHERE p.id = p_processor_id;

  IF NOT FOUND OR v_processor.deleted_at IS NOT NULL THEN
    RETURN FALSE;
  END IF;

  -- Check organization match
  IF v_processor.organization_id != (auth.jwt() -> 'app_metadata' ->> 'organization_id')::uuid THEN
    RETURN FALSE;
  END IF;

  -- If requiring owner, check if user is creator
  IF p_require_owner THEN
    IF v_processor.created_by = auth.uid() THEN
      RETURN TRUE;
    END IF;

    -- Check if user is org admin
    SELECT role INTO v_user_role
    FROM validai_organization_members
    WHERE organization_id = v_processor.organization_id
    AND user_id = auth.uid();

    RETURN v_user_role IN ('owner', 'admin');
  END IF;

  -- For view access, check visibility
  IF v_processor.visibility = 'organization' THEN
    RETURN TRUE;
  ELSIF v_processor.visibility = 'personal' THEN
    RETURN v_processor.created_by = auth.uid();
  END IF;

  RETURN FALSE;
END;
$$;

-- =============================================================================
-- Grant execute permissions to authenticated users
-- =============================================================================
GRANT EXECUTE ON FUNCTION create_processor_with_operations TO authenticated;
GRANT EXECUTE ON FUNCTION delete_processor_area TO authenticated;
GRANT EXECUTE ON FUNCTION get_ordered_operations TO authenticated;
GRANT EXECUTE ON FUNCTION get_organization_members TO authenticated;
GRANT EXECUTE ON FUNCTION get_processor_with_operations TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_organizations_safe TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_processors TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_processors_debug TO authenticated;
GRANT EXECUTE ON FUNCTION rename_processor_area TO authenticated;
GRANT EXECUTE ON FUNCTION validate_processor_ownership TO authenticated;

-- Add comments for documentation
COMMENT ON FUNCTION get_processor_with_operations IS 'Updated to reference validai_processors, validai_operations, validai_profiles - Phase 1 Migration';
COMMENT ON FUNCTION get_user_processors IS 'Updated to reference validai_processors, validai_operations, validai_profiles - Phase 1 Migration';
COMMENT ON FUNCTION create_processor_with_operations IS 'Updated to reference validai_processors, validai_operations - Phase 1 Migration';
COMMENT ON FUNCTION delete_processor_area IS 'Updated to reference validai_processors, validai_operations - Phase 1 Migration';
COMMENT ON FUNCTION get_ordered_operations IS 'Updated to reference validai_processors, validai_operations - Phase 1 Migration';
COMMENT ON FUNCTION rename_processor_area IS 'Updated to reference validai_processors, validai_operations - Phase 1 Migration';
COMMENT ON FUNCTION validate_processor_ownership IS 'Updated to reference validai_processors, validai_organization_members - Phase 1 Migration';
COMMENT ON FUNCTION get_organization_members IS 'Updated to reference validai_organization_members, validai_profiles - Phase 1 Migration';
COMMENT ON FUNCTION get_user_organizations_safe IS 'Updated to reference validai_organizations, validai_organization_members - Phase 1 Migration';
