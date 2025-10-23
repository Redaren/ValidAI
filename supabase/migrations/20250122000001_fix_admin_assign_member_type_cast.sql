-- Migration: Fix admin_assign_member type cast
-- Purpose: Cast auth.users.email (varchar) to text to match return type declaration
-- Created: 2025-01-22
-- Issue: PostgREST returns 400 when return column types don't exactly match RETURNS TABLE declaration

-- =====================================================
-- FIX: Add explicit type cast for email column
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
'Admin-only function to assign a user as a member to an organization. Validates duplicates and returns membership record with user details. Fixed: Added email type cast.';
