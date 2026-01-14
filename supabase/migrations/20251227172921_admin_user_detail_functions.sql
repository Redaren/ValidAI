-- Migration: Admin User Detail Functions
-- Purpose: Add admin functions for managing user profiles, preferences, and organization memberships
-- from the user detail page perspective (as opposed to the organization-centric functions)

-- ============================================================================
-- 1. admin_update_user_profile
-- Updates a user's profile information (full_name, avatar_url)
-- ============================================================================
CREATE OR REPLACE FUNCTION admin_update_user_profile(
  p_user_id uuid,
  p_full_name text DEFAULT NULL,
  p_avatar_url text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  email text,
  full_name text,
  avatar_url text,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Authorization: Only Playze admins can update user profiles
  IF NOT is_playze_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Only Playze admins can update user profiles';
  END IF;

  -- Verify user exists
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE profiles.id = p_user_id) THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  -- Update profile
  UPDATE profiles
  SET
    full_name = COALESCE(p_full_name, profiles.full_name),
    avatar_url = COALESCE(p_avatar_url, profiles.avatar_url),
    updated_at = now()
  WHERE profiles.id = p_user_id;

  -- Return updated profile
  RETURN QUERY
  SELECT
    p.id,
    u.email,
    p.full_name,
    p.avatar_url,
    p.updated_at
  FROM profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE p.id = p_user_id;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION admin_update_user_profile TO authenticated;

-- ============================================================================
-- 2. admin_update_user_preferences
-- Updates a user's preferences (theme, language, email_notifications)
-- ============================================================================
CREATE OR REPLACE FUNCTION admin_update_user_preferences(
  p_user_id uuid,
  p_theme text DEFAULT NULL,
  p_language text DEFAULT NULL,
  p_email_notifications boolean DEFAULT NULL
)
RETURNS TABLE (
  user_id uuid,
  theme text,
  language text,
  email_notifications boolean,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Authorization: Only Playze admins can update user preferences
  IF NOT is_playze_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Only Playze admins can update user preferences';
  END IF;

  -- Verify user exists
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE profiles.id = p_user_id) THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  -- Upsert preferences (create if not exists, update if exists)
  INSERT INTO user_preferences (user_id, theme, language, email_notifications, updated_at)
  VALUES (
    p_user_id,
    COALESCE(p_theme, 'system'),
    COALESCE(p_language, 'en'),
    COALESCE(p_email_notifications, true)
  )
  ON CONFLICT (user_id) DO UPDATE SET
    theme = COALESCE(p_theme, user_preferences.theme),
    language = COALESCE(p_language, user_preferences.language),
    email_notifications = COALESCE(p_email_notifications, user_preferences.email_notifications),
    updated_at = now();

  -- Return updated preferences
  RETURN QUERY
  SELECT
    up.user_id,
    up.theme,
    up.language,
    up.email_notifications,
    up.updated_at
  FROM user_preferences up
  WHERE up.user_id = p_user_id;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION admin_update_user_preferences TO authenticated;

-- ============================================================================
-- 3. admin_update_user_membership_role
-- Changes a user's role in an organization
-- ============================================================================
CREATE OR REPLACE FUNCTION admin_update_user_membership_role(
  p_user_id uuid,
  p_organization_id uuid,
  p_role text
)
RETURNS TABLE (
  user_id uuid,
  organization_id uuid,
  role text,
  updated_at timestamptz
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
  SET
    role = p_role,
    updated_at = now()
  WHERE organization_members.user_id = p_user_id
    AND organization_members.organization_id = p_organization_id;

  -- Return updated membership
  RETURN QUERY
  SELECT
    om.user_id,
    om.organization_id,
    om.role,
    om.updated_at
  FROM organization_members om
  WHERE om.user_id = p_user_id
    AND om.organization_id = p_organization_id;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION admin_update_user_membership_role TO authenticated;

-- ============================================================================
-- 4. admin_remove_user_membership
-- Removes a user from an organization
-- ============================================================================
CREATE OR REPLACE FUNCTION admin_remove_user_membership(
  p_user_id uuid,
  p_organization_id uuid
)
RETURNS TABLE (
  success boolean,
  message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_name text;
  v_user_email text;
BEGIN
  -- Authorization: Only Playze admins can remove memberships
  IF NOT is_playze_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Only Playze admins can remove memberships';
  END IF;

  -- Get organization name and user email for the response message
  SELECT o.name INTO v_org_name
  FROM organizations o
  WHERE o.id = p_organization_id;

  SELECT u.email INTO v_user_email
  FROM auth.users u
  WHERE u.id = p_user_id;

  -- Verify membership exists
  IF NOT EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_members.user_id = p_user_id
      AND organization_members.organization_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'User is not a member of this organization';
  END IF;

  -- Delete the membership
  DELETE FROM organization_members
  WHERE organization_members.user_id = p_user_id
    AND organization_members.organization_id = p_organization_id;

  -- Return success
  RETURN QUERY
  SELECT
    true AS success,
    format('User %s has been removed from %s', v_user_email, v_org_name) AS message;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION admin_remove_user_membership TO authenticated;

-- ============================================================================
-- Add comments for documentation
-- ============================================================================
COMMENT ON FUNCTION admin_update_user_profile IS 'Admin function to update a user profile (full_name, avatar_url). Requires Playze admin role.';
COMMENT ON FUNCTION admin_update_user_preferences IS 'Admin function to update user preferences (theme, language, email_notifications). Requires Playze admin role.';
COMMENT ON FUNCTION admin_update_user_membership_role IS 'Admin function to change a user role in an organization. Requires Playze admin role.';
COMMENT ON FUNCTION admin_remove_user_membership IS 'Admin function to remove a user from an organization. Requires Playze admin role.';
