-- Migration: Update admin_list_user_memberships to include membership status and inviter
-- Purpose: Add member_is_active and invited_by_name fields for the admin portal user organizations tab

-- -----------------------------------------------------
-- 1. DROP and RECREATE: admin_list_user_memberships
-- Must drop first because we're changing the return type
-- -----------------------------------------------------

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
  -- Authorization
  IF NOT is_playze_admin() THEN
    RAISE EXCEPTION 'Only Playze administrators can list user memberships';
  END IF;

  -- Return all memberships for this user across ALL organizations
  -- Include membership is_active status and inviter name
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
'Admin-only function to list ALL memberships for a user across ALL organizations. Returns membership status and inviter info. Bypasses RLS.';

-- Re-grant permissions after drop/recreate
GRANT EXECUTE ON FUNCTION admin_list_user_memberships(uuid) TO authenticated;


-- -----------------------------------------------------
-- 2. NEW: admin_toggle_user_membership_active
-- Toggle a user's membership status in an organization
-- -----------------------------------------------------

CREATE OR REPLACE FUNCTION admin_toggle_user_membership_active(
  p_user_id uuid,
  p_organization_id uuid,
  p_is_active boolean
)
RETURNS TABLE (
  user_id uuid,
  organization_id uuid,
  is_active boolean,
  updated_at timestamptz
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_updated_at timestamptz;
  v_user_id uuid;
  v_organization_id uuid;
  v_is_active boolean;
BEGIN
  -- Authorization
  IF NOT is_playze_admin() THEN
    RAISE EXCEPTION 'Only Playze administrators can toggle membership status';
  END IF;

  -- Check if membership exists
  IF NOT EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.user_id = p_user_id AND om.organization_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'Membership not found for user % in organization %', p_user_id, p_organization_id;
  END IF;

  -- Prevent deactivating the last active owner
  IF NOT p_is_active THEN
    DECLARE
      v_member_role text;
      v_active_owner_count int;
    BEGIN
      -- Get the member's role
      SELECT om.role INTO v_member_role
      FROM organization_members om
      WHERE om.user_id = p_user_id AND om.organization_id = p_organization_id;

      -- If this is an owner, check if they're the last active owner
      IF v_member_role = 'owner' THEN
        SELECT COUNT(*) INTO v_active_owner_count
        FROM organization_members om
        WHERE om.organization_id = p_organization_id
          AND om.role = 'owner'
          AND om.is_active = true
          AND om.user_id != p_user_id;

        IF v_active_owner_count = 0 THEN
          RAISE EXCEPTION 'Cannot deactivate the last active owner of an organization';
        END IF;
      END IF;
    END;
  END IF;

  -- Update the membership status
  UPDATE organization_members om
  SET is_active = p_is_active
  WHERE om.user_id = p_user_id AND om.organization_id = p_organization_id
  RETURNING om.user_id, om.organization_id, om.is_active, now() INTO v_user_id, v_organization_id, v_is_active, v_updated_at;

  -- Return the updated membership
  RETURN QUERY
  SELECT v_user_id, v_organization_id, v_is_active, v_updated_at;
END;
$$;

COMMENT ON FUNCTION admin_toggle_user_membership_active IS
'Admin-only function to activate/deactivate a user''s membership in an organization. Prevents deactivating the last active owner. Bypasses RLS.';

GRANT EXECUTE ON FUNCTION admin_toggle_user_membership_active(uuid, uuid, boolean) TO authenticated;
