-- Migration: User Member Management Functions
-- Purpose: Enable organization members to manage other members (self-service)
-- Created: 2026-01-03
-- Feature: Current Members Table with role changes and activation/deactivation

-- =====================================================
-- CONTEXT & RATIONALE
-- =====================================================
-- This migration adds:
-- 1. is_active column to organization_members for soft-deactivation
-- 2. user_get_org_members - List all members of an organization
-- 3. user_update_member_role - Change a member's role
-- 4. user_toggle_member_active - Activate/deactivate a member
--
-- Key rules:
-- - Only owners/admins have can_manage_members permission
-- - Users can only manage members at same or lower role level
-- - Cannot change own role or deactivate self
-- - Must always have at least 1 active owner

-- =====================================================
-- 1. ADD is_active COLUMN TO organization_members
-- =====================================================

ALTER TABLE organization_members
ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- Index for filtering active members
CREATE INDEX IF NOT EXISTS organization_members_is_active_idx
ON organization_members(is_active);

COMMENT ON COLUMN organization_members.is_active IS
'Allows soft deactivation of members without removing them from the organization. Deactivated members lose access until reactivated.';

-- =====================================================
-- 2. USER: GET ORGANIZATION MEMBERS
-- =====================================================
-- Returns all members of an organization with profile info
-- Requires user to be a member of the organization

CREATE OR REPLACE FUNCTION user_get_org_members(
  p_organization_id uuid,
  p_app_id text DEFAULT NULL  -- For permission check context (unused but consistent with other functions)
)
RETURNS TABLE (
  user_id uuid,
  email text,
  full_name text,
  avatar_url text,
  role text,
  is_active boolean,
  joined_at timestamptz
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Check user is member of organization
  IF NOT EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_id = p_organization_id
    AND organization_members.user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'You are not a member of this organization';
  END IF;

  RETURN QUERY
  SELECT
    om.user_id,
    u.email,
    p.full_name,
    p.avatar_url,
    om.role,
    om.is_active,
    om.joined_at
  FROM organization_members om
  JOIN auth.users u ON u.id = om.user_id
  LEFT JOIN profiles p ON p.id = om.user_id
  WHERE om.organization_id = p_organization_id
  ORDER BY
    -- Sort by role level (owners first)
    CASE om.role
      WHEN 'owner' THEN 1
      WHEN 'admin' THEN 2
      WHEN 'member' THEN 3
      WHEN 'viewer' THEN 4
    END,
    -- Then by active status (active first)
    om.is_active DESC,
    -- Then by name/email
    COALESCE(p.full_name, u.email);
END;
$$;

COMMENT ON FUNCTION user_get_org_members IS
'Returns all members of an organization with their profile info.
Requires user to be a member of the organization.
Returns: user_id, email, full_name, avatar_url, role, is_active, joined_at';

-- =====================================================
-- 3. USER: UPDATE MEMBER ROLE
-- =====================================================
-- Updates a member's role with validation
-- Enforces role hierarchy and prevents demoting last owner

CREATE OR REPLACE FUNCTION user_update_member_role(
  p_org_id uuid,
  p_user_id uuid,
  p_new_role text,
  p_app_id text DEFAULT NULL
)
RETURNS TABLE (
  success boolean,
  message text
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_caller_id uuid;
  v_caller_role text;
  v_target_role text;
  v_can_manage boolean;
  v_caller_role_level int;
  v_target_role_level int;
  v_new_role_level int;
  v_active_owner_count int;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN QUERY SELECT false, 'Not authenticated'::text;
    RETURN;
  END IF;

  -- Validate new role
  IF p_new_role NOT IN ('owner', 'admin', 'member', 'viewer') THEN
    RETURN QUERY SELECT false, 'Invalid role. Must be owner, admin, member, or viewer'::text;
    RETURN;
  END IF;

  -- Get caller's role
  SELECT role INTO v_caller_role
  FROM organization_members
  WHERE organization_id = p_org_id AND user_id = v_caller_id;

  IF v_caller_role IS NULL THEN
    RETURN QUERY SELECT false, 'You are not a member of this organization'::text;
    RETURN;
  END IF;

  -- Check can_manage_members permission
  SELECT (role_permissions_for_role(p_app_id, v_caller_role) ->> 'can_manage_members')::boolean
  INTO v_can_manage;

  IF NOT COALESCE(v_can_manage, false) THEN
    RETURN QUERY SELECT false, 'You do not have permission to manage members'::text;
    RETURN;
  END IF;

  -- Cannot change own role
  IF p_user_id = v_caller_id THEN
    RETURN QUERY SELECT false, 'You cannot change your own role'::text;
    RETURN;
  END IF;

  -- Get target's current role
  SELECT role INTO v_target_role
  FROM organization_members
  WHERE organization_id = p_org_id AND user_id = p_user_id;

  IF v_target_role IS NULL THEN
    RETURN QUERY SELECT false, 'Target user is not a member of this organization'::text;
    RETURN;
  END IF;

  -- Calculate role levels
  v_caller_role_level := CASE v_caller_role
    WHEN 'owner' THEN 4 WHEN 'admin' THEN 3 WHEN 'member' THEN 2 WHEN 'viewer' THEN 1 ELSE 0
  END;
  v_target_role_level := CASE v_target_role
    WHEN 'owner' THEN 4 WHEN 'admin' THEN 3 WHEN 'member' THEN 2 WHEN 'viewer' THEN 1 ELSE 0
  END;
  v_new_role_level := CASE p_new_role
    WHEN 'owner' THEN 4 WHEN 'admin' THEN 3 WHEN 'member' THEN 2 WHEN 'viewer' THEN 1 ELSE 0
  END;

  -- Can only manage members at same or lower level
  IF v_target_role_level > v_caller_role_level THEN
    RETURN QUERY SELECT false, 'You cannot manage members with a higher role than yours'::text;
    RETURN;
  END IF;

  -- Can only assign roles at same or lower level
  IF v_new_role_level > v_caller_role_level THEN
    RETURN QUERY SELECT false, 'You cannot assign a role higher than your own'::text;
    RETURN;
  END IF;

  -- Prevent demoting last active owner
  IF v_target_role = 'owner' AND p_new_role != 'owner' THEN
    SELECT COUNT(*) INTO v_active_owner_count
    FROM organization_members
    WHERE organization_id = p_org_id
      AND role = 'owner'
      AND is_active = true;

    IF v_active_owner_count <= 1 THEN
      RETURN QUERY SELECT false, 'Cannot demote the last active owner. Promote another member to owner first.'::text;
      RETURN;
    END IF;
  END IF;

  -- Update role
  UPDATE organization_members
  SET role = p_new_role
  WHERE organization_id = p_org_id AND user_id = p_user_id;

  RETURN QUERY SELECT true, 'Role updated successfully'::text;
END;
$$;

COMMENT ON FUNCTION user_update_member_role IS
'User-level function to update a member''s role.
Validates: can_manage_members permission, no self-changes, role hierarchy.
Prevents demoting the last active owner.';

-- =====================================================
-- 4. USER: TOGGLE MEMBER ACTIVE STATUS
-- =====================================================
-- Activates or deactivates a member
-- Enforces role hierarchy and prevents deactivating last owner

CREATE OR REPLACE FUNCTION user_toggle_member_active(
  p_org_id uuid,
  p_user_id uuid,
  p_is_active boolean,
  p_app_id text DEFAULT NULL
)
RETURNS TABLE (
  success boolean,
  message text
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_caller_id uuid;
  v_caller_role text;
  v_target_role text;
  v_target_is_active boolean;
  v_can_manage boolean;
  v_caller_role_level int;
  v_target_role_level int;
  v_active_owner_count int;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN QUERY SELECT false, 'Not authenticated'::text;
    RETURN;
  END IF;

  -- Get caller's role
  SELECT role INTO v_caller_role
  FROM organization_members
  WHERE organization_id = p_org_id AND user_id = v_caller_id;

  IF v_caller_role IS NULL THEN
    RETURN QUERY SELECT false, 'You are not a member of this organization'::text;
    RETURN;
  END IF;

  -- Check can_manage_members permission
  SELECT (role_permissions_for_role(p_app_id, v_caller_role) ->> 'can_manage_members')::boolean
  INTO v_can_manage;

  IF NOT COALESCE(v_can_manage, false) THEN
    RETURN QUERY SELECT false, 'You do not have permission to manage members'::text;
    RETURN;
  END IF;

  -- Cannot deactivate self
  IF p_user_id = v_caller_id AND NOT p_is_active THEN
    RETURN QUERY SELECT false, 'You cannot deactivate yourself'::text;
    RETURN;
  END IF;

  -- Get target's role and current status
  SELECT role, is_active INTO v_target_role, v_target_is_active
  FROM organization_members
  WHERE organization_id = p_org_id AND user_id = p_user_id;

  IF v_target_role IS NULL THEN
    RETURN QUERY SELECT false, 'Target user is not a member of this organization'::text;
    RETURN;
  END IF;

  -- Already in desired state
  IF v_target_is_active = p_is_active THEN
    RETURN QUERY SELECT true,
      CASE WHEN p_is_active THEN 'Member is already active' ELSE 'Member is already inactive' END::text;
    RETURN;
  END IF;

  -- Calculate role levels
  v_caller_role_level := CASE v_caller_role
    WHEN 'owner' THEN 4 WHEN 'admin' THEN 3 WHEN 'member' THEN 2 WHEN 'viewer' THEN 1 ELSE 0
  END;
  v_target_role_level := CASE v_target_role
    WHEN 'owner' THEN 4 WHEN 'admin' THEN 3 WHEN 'member' THEN 2 WHEN 'viewer' THEN 1 ELSE 0
  END;

  -- Can only manage members at same or lower level
  IF v_target_role_level > v_caller_role_level THEN
    RETURN QUERY SELECT false, 'You cannot manage members with a higher role than yours'::text;
    RETURN;
  END IF;

  -- Prevent deactivating last active owner
  IF v_target_role = 'owner' AND NOT p_is_active THEN
    SELECT COUNT(*) INTO v_active_owner_count
    FROM organization_members
    WHERE organization_id = p_org_id
      AND role = 'owner'
      AND is_active = true;

    IF v_active_owner_count <= 1 THEN
      RETURN QUERY SELECT false, 'Cannot deactivate the last active owner. Promote another member to owner first.'::text;
      RETURN;
    END IF;
  END IF;

  -- Toggle active status
  UPDATE organization_members
  SET is_active = p_is_active
  WHERE organization_id = p_org_id AND user_id = p_user_id;

  RETURN QUERY SELECT true,
    CASE WHEN p_is_active THEN 'Member activated successfully' ELSE 'Member deactivated successfully' END::text;
END;
$$;

COMMENT ON FUNCTION user_toggle_member_active IS
'User-level function to activate/deactivate a member.
Validates: can_manage_members permission, no self-deactivation, role hierarchy.
Prevents deactivating the last active owner.';

-- =====================================================
-- GRANT EXECUTE PERMISSIONS
-- =====================================================

GRANT EXECUTE ON FUNCTION user_get_org_members(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION user_update_member_role(uuid, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION user_toggle_member_active(uuid, uuid, boolean, text) TO authenticated;

-- =====================================================
-- USAGE EXAMPLES
-- =====================================================

-- From any platform app (JavaScript/TypeScript):
--
-- // Get organization members
-- const { data, error } = await supabase.rpc('user_get_org_members', {
--   p_organization_id: 'org-uuid',
--   p_app_id: 'infracloud'
-- })
--
-- // Update member role
-- const { data, error } = await supabase.rpc('user_update_member_role', {
--   p_org_id: 'org-uuid',
--   p_user_id: 'user-uuid',
--   p_new_role: 'admin',
--   p_app_id: 'infracloud'
-- })
--
-- // Toggle member active status
-- const { data, error } = await supabase.rpc('user_toggle_member_active', {
--   p_org_id: 'org-uuid',
--   p_user_id: 'user-uuid',
--   p_is_active: false,
--   p_app_id: 'infracloud'
-- })
