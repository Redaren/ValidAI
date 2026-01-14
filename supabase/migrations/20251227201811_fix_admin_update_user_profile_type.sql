-- Migration: Fix admin_update_user_profile return type mismatch
-- The auth.users.email column is varchar(255) but RETURNS TABLE declared it as text
-- PostgreSQL is strict about type matching, so we need to cast

DROP FUNCTION IF EXISTS admin_update_user_profile(uuid, text, text);

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

  -- Return updated profile (cast email to text to match return type)
  RETURN QUERY
  SELECT
    p.id,
    u.email::text,
    p.full_name,
    p.avatar_url,
    p.updated_at
  FROM profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE p.id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_update_user_profile TO authenticated;

COMMENT ON FUNCTION admin_update_user_profile IS 'Admin function to update a user profile (full_name, avatar_url). Requires Playze admin role.';
