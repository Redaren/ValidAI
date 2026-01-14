-- Migration: Fix admin_update_user_preferences INSERT column/value mismatch
-- The INSERT had 5 columns but only 4 values (missing updated_at value)

DROP FUNCTION IF EXISTS admin_update_user_preferences(uuid, text, text, boolean);

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
  -- Note: updated_at has a default value so we don't need to specify it for INSERT
  INSERT INTO user_preferences (user_id, theme, language, email_notifications)
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

GRANT EXECUTE ON FUNCTION admin_update_user_preferences TO authenticated;

COMMENT ON FUNCTION admin_update_user_preferences IS 'Admin function to update user preferences (theme, language, email_notifications). Requires Playze admin role.';
