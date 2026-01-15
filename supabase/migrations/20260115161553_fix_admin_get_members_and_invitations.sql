-- Fix admin_get_members_and_invitations to include member_is_active field
-- This resolves the status display inconsistency between org members tab and user organizations tab

CREATE OR REPLACE FUNCTION admin_get_members_and_invitations(p_org_id uuid)
RETURNS TABLE (
  id text,
  entry_type text,
  email text,
  full_name text,
  avatar_url text,
  role text,
  status text,
  joined_at timestamptz,
  invited_at timestamptz,
  expires_at timestamptz,
  invited_by_name text,
  member_is_active boolean
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT is_playze_admin() THEN
    RAISE EXCEPTION 'Only Playze administrators can view this data';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM organizations WHERE organizations.id = p_org_id) THEN
    RAISE EXCEPTION 'Organization not found';
  END IF;

  RETURN QUERY
  -- Active members
  SELECT
    om.user_id::text as id,
    'member'::text as entry_type,
    au.email::text,
    p.full_name::text,
    p.avatar_url::text,
    om.role::text,
    CASE WHEN om.is_active THEN 'active' ELSE 'inactive' END::text as status,
    om.joined_at,
    NULL::timestamptz as invited_at,
    NULL::timestamptz as expires_at,
    NULL::text as invited_by_name,
    om.is_active as member_is_active
  FROM organization_members om
  LEFT JOIN auth.users au ON au.id = om.user_id
  LEFT JOIN profiles p ON p.id = om.user_id
  WHERE om.organization_id = p_org_id

  UNION ALL

  -- Pending invitations
  SELECT
    oi.id::text,
    'invitation'::text as entry_type,
    oi.email::text,
    NULL::text as full_name,
    NULL::text as avatar_url,
    oi.role::text,
    oi.status::text,
    NULL::timestamptz as joined_at,
    oi.invited_at,
    oi.expires_at,
    ip.full_name::text as invited_by_name,
    NULL::boolean as member_is_active
  FROM organization_invitations oi
  LEFT JOIN profiles ip ON ip.id = oi.invited_by
  WHERE oi.organization_id = p_org_id
    AND oi.status = 'pending'

  ORDER BY entry_type ASC, joined_at DESC NULLS LAST, invited_at DESC NULLS LAST;
END;
$$;

COMMENT ON FUNCTION admin_get_members_and_invitations IS
'Admin-only function to get a unified list of organization members and pending invitations for display in the Admin Portal. Returns member_is_active to show actual membership status.';
