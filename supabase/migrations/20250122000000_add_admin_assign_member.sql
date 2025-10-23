-- Migration: Admin Assign Member Function
-- Purpose: Allow admin portal to assign users as members to organizations
-- Created: 2025-01-22
-- Feature: Phase 5 - Organization Members Management

-- =====================================================
-- CONTEXT & RATIONALE
-- =====================================================
-- This function allows Playze administrators to assign existing users
-- as members to organizations with a specific role.
--
-- Features:
-- - Admin authorization check
-- - Duplicate detection with detailed error message
-- - Support for role assignment (owner, admin, member, viewer)
-- - Tracks which admin assigned the member (invited_by field)
-- - Returns the created membership record
--
-- Usage Pattern: Admin Portal Members Tab
-- UI Flow: Search users → Select user → Choose role → Assign

-- =====================================================
-- ADMIN: ASSIGN MEMBER TO ORGANIZATION
-- =====================================================

CREATE OR REPLACE FUNCTION admin_assign_member(
  p_organization_id uuid,
  p_user_id uuid,
  p_role text
)
RETURNS TABLE (
  organization_id uuid,
  user_id uuid,
  role text,
  joined_at timestamptz,
  invited_by uuid,
  user_email text,
  user_full_name text
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_existing_role text;
  v_admin_id uuid;
BEGIN
  -- Authorization: Only Playze admins can assign members
  IF NOT is_playze_admin() THEN
    RAISE EXCEPTION 'Only Playze administrators can assign organization members';
  END IF;

  -- Validation: Check organization exists
  IF NOT EXISTS (SELECT 1 FROM organizations WHERE id = p_organization_id) THEN
    RAISE EXCEPTION 'Organization not found';
  END IF;

  -- Validation: Check user exists
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  -- Validation: Check role is valid
  IF p_role NOT IN ('owner', 'admin', 'member', 'viewer') THEN
    RAISE EXCEPTION 'Invalid role. Must be one of: owner, admin, member, viewer';
  END IF;

  -- Get current admin's user ID
  v_admin_id := auth.uid();

  -- Check if user is already a member
  SELECT om.role INTO v_existing_role
  FROM organization_members om
  WHERE om.organization_id = p_organization_id
    AND om.user_id = p_user_id;

  IF v_existing_role IS NOT NULL THEN
    RAISE EXCEPTION 'User is already a member of this organization with role: %. To change the role, please use the update member function or remove and re-add the member.', v_existing_role;
  END IF;

  -- Insert new membership
  INSERT INTO organization_members (
    organization_id,
    user_id,
    role,
    joined_at,
    invited_by
  )
  VALUES (
    p_organization_id,
    p_user_id,
    p_role,
    now(),
    v_admin_id
  );

  -- Return the created membership with user details
  RETURN QUERY
  SELECT
    om.organization_id,
    om.user_id,
    om.role,
    om.joined_at,
    om.invited_by,
    au.email::text as user_email,  -- Cast varchar to text to match return type
    p.full_name as user_full_name
  FROM organization_members om
  LEFT JOIN auth.users au ON au.id = om.user_id
  LEFT JOIN profiles p ON p.id = om.user_id
  WHERE om.organization_id = p_organization_id
    AND om.user_id = p_user_id;
END;
$$;

COMMENT ON FUNCTION admin_assign_member IS
'Admin-only function to assign a user as a member to an organization. Validates duplicates and returns membership record with user details.';

-- Grant execution permission
GRANT EXECUTE ON FUNCTION admin_assign_member(uuid, uuid, text) TO authenticated;

-- =====================================================
-- USAGE EXAMPLE
-- =====================================================
-- Call from Admin Portal:
--
-- const { data, error } = await supabase.rpc('admin_assign_member', {
--   p_organization_id: 'org-uuid',
--   p_user_id: 'user-uuid',
--   p_role: 'member'
-- })
--
-- Returns:
-- [{
--   organization_id: 'uuid',
--   user_id: 'uuid',
--   role: 'member',
--   joined_at: '2025-01-22T...',
--   invited_by: 'admin-uuid',
--   user_email: 'user@example.com',
--   user_full_name: 'John Doe'
-- }]
