-- ==============================================================================
-- Migration: Add Pagination and Search to get_user_processors
-- Created: 2025-11-12
-- Description: Adds server-side pagination and search capabilities to prevent
--              loading all processors into memory (scalability for 10K+ processors)
-- ==============================================================================

-- Drop existing function to replace with paginated version
DROP FUNCTION IF EXISTS get_user_processors(BOOLEAN);

-- Create paginated version with search support
CREATE OR REPLACE FUNCTION get_user_processors(
  p_include_archived BOOLEAN DEFAULT false,
  p_limit INT DEFAULT 10,              -- Default 10 processors per page
  p_offset INT DEFAULT 0,              -- Pagination offset
  p_search TEXT DEFAULT NULL           -- Search term (searches name and description)
)
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
    -- Server-side search: case-insensitive search on name and description
    AND (
      p_search IS NULL
      OR p.name ILIKE '%' || p_search || '%'
      OR p.description ILIKE '%' || p_search || '%'
    )
  ORDER BY p.updated_at DESC
  LIMIT p_limit OFFSET p_offset;      -- Server-side pagination
END;
$$;

-- ==============================================================================
-- Create count function for total pages calculation
-- ==============================================================================

CREATE OR REPLACE FUNCTION get_user_processors_count(
  p_include_archived BOOLEAN DEFAULT false,
  p_search TEXT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  total_count BIGINT;
BEGIN
  SELECT COUNT(*)
  INTO total_count
  FROM validai_processors p
  WHERE
    p.organization_id = (auth.jwt() -> 'app_metadata' ->> 'organization_id')::uuid
    AND p.deleted_at IS NULL
    AND (p_include_archived OR p.status != 'archived')
    AND (
      p.visibility = 'organization'
      OR (p.visibility = 'personal' AND p.created_by = auth.uid())
    )
    AND (
      p_search IS NULL
      OR p.name ILIKE '%' || p_search || '%'
      OR p.description ILIKE '%' || p_search || '%'
    );

  RETURN total_count;
END;
$$;

-- ==============================================================================
-- Comments
-- ==============================================================================

COMMENT ON FUNCTION get_user_processors(BOOLEAN, INT, INT, TEXT) IS
'Returns paginated list of processors visible to the current user with server-side search.
Supports:
- Pagination via p_limit and p_offset
- Search via p_search (case-insensitive on name and description)
- Filtering archived processors via p_include_archived
- Visibility filtering (organization-wide or personal)
Default: 10 processors per page';

COMMENT ON FUNCTION get_user_processors_count(BOOLEAN, TEXT) IS
'Returns total count of processors matching the filter criteria.
Used for pagination UI to show total pages and row counts.
Must use same filtering logic as get_user_processors for accurate counts.';
