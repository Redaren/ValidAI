-- =====================================================
-- ADMIN: LIST ALL INVITATIONS WITH SERVER-SIDE PAGINATION
-- =====================================================
-- Lists all pending invitations across all organizations
-- with server-side search and pagination support.
-- =====================================================

CREATE OR REPLACE FUNCTION admin_list_all_invitations_paginated(
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 10,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  email text,
  role text,
  status text,
  organization_id uuid,
  organization_name text,
  invited_by_name text,
  invited_at timestamptz,
  expires_at timestamptz,
  total_count bigint
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_total_count bigint;
BEGIN
  -- Authorization: Only Playze admins can list invitations
  IF NOT is_playze_admin() THEN
    RAISE EXCEPTION 'Only Playze administrators can list all invitations';
  END IF;

  -- Get total count first (for pagination metadata)
  -- Only count pending invitations
  SELECT COUNT(*) INTO v_total_count
  FROM organization_invitations oi
  LEFT JOIN organizations o ON o.id = oi.organization_id
  WHERE oi.status = 'pending'
    AND (
      p_search IS NULL
      OR oi.email ILIKE '%' || p_search || '%'
      OR o.name ILIKE '%' || p_search || '%'
    );

  -- Return paginated results with total count
  RETURN QUERY
  SELECT
    oi.id,
    oi.email,
    oi.role,
    oi.status,
    oi.organization_id,
    o.name as organization_name,
    inviter.full_name as invited_by_name,
    oi.invited_at,
    oi.expires_at,
    v_total_count as total_count
  FROM organization_invitations oi
  LEFT JOIN organizations o ON o.id = oi.organization_id
  LEFT JOIN profiles inviter ON inviter.id = oi.invited_by
  WHERE oi.status = 'pending'
    AND (
      p_search IS NULL
      OR oi.email ILIKE '%' || p_search || '%'
      OR o.name ILIKE '%' || p_search || '%'
    )
  ORDER BY oi.invited_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

COMMENT ON FUNCTION admin_list_all_invitations_paginated IS
'Admin-only function to list all pending invitations across organizations with server-side search and pagination.
Parameters:
  - p_search: Optional search term (ILIKE on email or organization name)
  - p_limit: Number of results per page (default 10)
  - p_offset: Offset for pagination (default 0)
Returns total_count in each row for pagination UI.';

-- Grant execute permission to authenticated users (admin check is inside function)
GRANT EXECUTE ON FUNCTION admin_list_all_invitations_paginated(text, integer, integer) TO authenticated;
