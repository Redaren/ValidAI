-- Fix admin_list_user_memberships to include member_is_active and invited_by_name
-- The original migration 20260104143345 was never applied to the database

DROP FUNCTION IF EXISTS admin_list_user_memberships(uuid);

CREATE OR REPLACE FUNCTION admin_list_user_memberships(p_user_id uuid)
RETURNS TABLE (
  organization_id uuid,
  organization_name text,
  organization_is_active boolean,
  role text,
  joined_at timestamptz,
  member_is_active boolean,
  invited_by_name text
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT is_playze_admin() THEN
    RAISE EXCEPTION 'Only Playze administrators can list user memberships';
  END IF;

  RETURN QUERY
  SELECT
    o.id as organization_id,
    o.name as organization_name,
    o.is_active as organization_is_active,
    om.role,
    om.joined_at,
    om.is_active as member_is_active,
    COALESCE(p.full_name, au.email, NULL) as invited_by_name
  FROM organization_members om
  LEFT JOIN organizations o ON o.id = om.organization_id
  LEFT JOIN profiles p ON p.id = om.invited_by
  LEFT JOIN auth.users au ON au.id = om.invited_by
  WHERE om.user_id = p_user_id
  ORDER BY om.joined_at DESC;
END;
$$;

COMMENT ON FUNCTION admin_list_user_memberships IS
'Admin-only function to list ALL memberships for a user. Returns member_is_active status.';

GRANT EXECUTE ON FUNCTION admin_list_user_memberships(uuid) TO authenticated;
