-- Migration: Fix admin_update_user_membership_role function
-- The organization_members table doesn't have an updated_at column
-- Need to DROP first because return type is changing

DROP FUNCTION IF EXISTS admin_update_user_membership_role(uuid, uuid, text);

CREATE OR REPLACE FUNCTION admin_update_user_membership_role(
  p_user_id uuid,
  p_organization_id uuid,
  p_role text
)
RETURNS TABLE (
  user_id uuid,
  organization_id uuid,
  role text,
  joined_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Authorization: Only Playze admins can update membership roles
  IF NOT is_playze_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Only Playze admins can update membership roles';
  END IF;

  -- Validate role
  IF p_role NOT IN ('owner', 'admin', 'member', 'viewer') THEN
    RAISE EXCEPTION 'Invalid role. Must be one of: owner, admin, member, viewer';
  END IF;

  -- Verify membership exists
  IF NOT EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_members.user_id = p_user_id
      AND organization_members.organization_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'User is not a member of this organization';
  END IF;

  -- Update the role
  UPDATE organization_members
  SET role = p_role
  WHERE organization_members.user_id = p_user_id
    AND organization_members.organization_id = p_organization_id;

  -- Return updated membership
  RETURN QUERY
  SELECT
    om.user_id,
    om.organization_id,
    om.role,
    om.joined_at
  FROM organization_members om
  WHERE om.user_id = p_user_id
    AND om.organization_id = p_organization_id;
END;
$$;

COMMENT ON FUNCTION admin_update_user_membership_role IS 'Admin function to change a user role in an organization. Requires Playze admin role.';
