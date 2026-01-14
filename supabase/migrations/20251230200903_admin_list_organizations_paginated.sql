-- =====================================================
-- ADMIN: LIST ORGANIZATIONS WITH SERVER-SIDE PAGINATION
-- =====================================================
-- Replaces client-side filtering with efficient server-side
-- search and pagination for 1000+ organizations support.
-- =====================================================

CREATE OR REPLACE FUNCTION admin_list_organizations_paginated(
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 10,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  name text,
  description text,
  is_active boolean,
  created_at timestamptz,
  updated_at timestamptz,
  member_count bigint,
  total_count bigint
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_total_count bigint;
BEGIN
  -- Authorization: Only Playze admins can list organizations
  IF NOT is_playze_admin() THEN
    RAISE EXCEPTION 'Only Playze administrators can list organizations';
  END IF;

  -- Get total count first (for pagination metadata)
  SELECT COUNT(DISTINCT o.id) INTO v_total_count
  FROM organizations o
  WHERE p_search IS NULL
     OR o.name ILIKE '%' || p_search || '%'
     OR o.description ILIKE '%' || p_search || '%';

  -- Return paginated results with total count
  RETURN QUERY
  SELECT
    o.id,
    o.name,
    o.description,
    o.is_active,
    o.created_at,
    o.updated_at,
    COALESCE(COUNT(om.user_id), 0)::bigint as member_count,
    v_total_count as total_count
  FROM organizations o
  LEFT JOIN organization_members om ON om.organization_id = o.id
  WHERE p_search IS NULL
     OR o.name ILIKE '%' || p_search || '%'
     OR o.description ILIKE '%' || p_search || '%'
  GROUP BY o.id, o.name, o.description, o.is_active, o.created_at, o.updated_at
  ORDER BY o.name ASC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

COMMENT ON FUNCTION admin_list_organizations_paginated IS
'Admin-only function to list organizations with server-side search and pagination.
Parameters:
  - p_search: Optional search term (ILIKE on name or description)
  - p_limit: Number of results per page (default 10)
  - p_offset: Offset for pagination (default 0)
Returns total_count in each row for pagination UI.';

-- Grant execute permission to authenticated users (admin check is inside function)
GRANT EXECUTE ON FUNCTION admin_list_organizations_paginated(text, integer, integer) TO authenticated;
