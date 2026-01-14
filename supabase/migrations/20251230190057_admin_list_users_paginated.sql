-- =====================================================
-- ADMIN: LIST USERS WITH SERVER-SIDE PAGINATION
-- =====================================================
-- Replaces client-side filtering with efficient server-side
-- search and pagination for 1000+ users support.
-- =====================================================

CREATE OR REPLACE FUNCTION admin_list_users_paginated(
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 10,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  email varchar,
  full_name text,
  avatar_url text,
  created_at timestamptz,
  updated_at timestamptz,
  organization_count bigint,
  total_count bigint
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_total_count bigint;
BEGIN
  -- Authorization: Only Playze admins can list users
  IF NOT is_playze_admin() THEN
    RAISE EXCEPTION 'Only Playze administrators can list users';
  END IF;

  -- Get total count first (for pagination metadata)
  SELECT COUNT(DISTINCT p.id) INTO v_total_count
  FROM profiles p
  LEFT JOIN auth.users au ON au.id = p.id
  WHERE p_search IS NULL
     OR p.full_name ILIKE '%' || p_search || '%'
     OR au.email ILIKE '%' || p_search || '%';

  -- Return paginated results with total count
  RETURN QUERY
  SELECT
    p.id,
    au.email,
    p.full_name,
    p.avatar_url,
    p.created_at,
    p.updated_at,
    COALESCE(COUNT(om.organization_id), 0)::bigint as organization_count,
    v_total_count as total_count
  FROM profiles p
  LEFT JOIN auth.users au ON au.id = p.id
  LEFT JOIN organization_members om ON om.user_id = p.id
  WHERE p_search IS NULL
     OR p.full_name ILIKE '%' || p_search || '%'
     OR au.email ILIKE '%' || p_search || '%'
  GROUP BY p.id, au.email, p.full_name, p.avatar_url, p.created_at, p.updated_at
  ORDER BY p.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

COMMENT ON FUNCTION admin_list_users_paginated IS
'Admin-only function to list users with server-side search and pagination.
Parameters:
  - p_search: Optional search term (ILIKE on full_name or email)
  - p_limit: Number of results per page (default 10)
  - p_offset: Offset for pagination (default 0)
Returns total_count in each row for pagination UI.';

-- Grant execute permission to authenticated users (admin check is inside function)
GRANT EXECUTE ON FUNCTION admin_list_users_paginated(text, integer, integer) TO authenticated;
