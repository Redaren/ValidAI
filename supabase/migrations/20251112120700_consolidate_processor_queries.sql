-- ==============================================================================
-- Migration: Consolidate Processor Queries (Remove Duplicate DB Calls)
-- Created: 2025-11-12
-- Description: Consolidates get_user_processors and get_user_processors_count
--              into a single function using window function COUNT(*) OVER()
--              This eliminates duplicate database round trips and filter logic.
-- ==============================================================================

-- Drop the old version of get_user_processors
DROP FUNCTION IF EXISTS get_user_processors(BOOLEAN, INT, INT, TEXT);

-- Create consolidated version with total_count included
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
  is_owner BOOLEAN,
  total_count BIGINT                   -- NEW: Total count for pagination (same value in all rows)
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
  ),
  filtered_processors AS (
    -- First get all matching processors (before pagination)
    SELECT
      p.id,
      p.name,
      p.description,
      p.usage_description,
      p.status,
      p.visibility,
      p.tags,
      p.created_by,
      prof.full_name AS creator_name,
      p.created_at,
      p.updated_at,
      p.published_at,
      COALESCE(po.op_count, 0) AS operation_count,
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
  )
  SELECT
    fp.id,
    fp.name,
    fp.description,
    fp.usage_description,
    fp.status,
    fp.visibility,
    fp.tags,
    fp.created_by,
    fp.creator_name,
    fp.created_at,
    fp.updated_at,
    fp.published_at,
    fp.operation_count,
    fp.is_owner,
    COUNT(*) OVER() AS total_count      -- Window function: total count without affecting pagination
  FROM filtered_processors fp
  ORDER BY fp.updated_at DESC
  LIMIT p_limit OFFSET p_offset;        -- Server-side pagination
END;
$$;

-- ==============================================================================
-- Drop the redundant count function (no longer needed)
-- ==============================================================================

DROP FUNCTION IF EXISTS get_user_processors_count(BOOLEAN, TEXT);

-- ==============================================================================
-- Comments
-- ==============================================================================

COMMENT ON FUNCTION get_user_processors(BOOLEAN, INT, INT, TEXT) IS
'Returns paginated list of processors visible to the current user with server-side search.
UPDATED: Now includes total_count in each row using COUNT(*) OVER() window function.
This eliminates the need for a separate count query.

Supports:
- Pagination via p_limit and p_offset
- Search via p_search (case-insensitive on name and description)
- Filtering archived processors via p_include_archived
- Visibility filtering (organization-wide or personal)
- Total count for pagination UI (same value in all rows)

Default: 10 processors per page

Performance: Single query replaces previous two-query pattern (50% reduction in DB calls)';
