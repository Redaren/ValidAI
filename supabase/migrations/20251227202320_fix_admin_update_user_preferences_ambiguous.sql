-- Migration: Fix admin_update_user_preferences ambiguous column reference
-- The "user_id" in ON CONFLICT was ambiguous with the RETURNS TABLE user_id column
-- Solution: Fully qualify all column references with table name

DROP FUNCTION IF EXISTS admin_update_user_preferences(uuid, text, text, boolean);

CREATE OR REPLACE FUNCTION admin_update_user_preferences(
  p_user_id uuid,
  p_theme text DEFAULT NULL,
  p_language text DEFAULT NULL,
  p_email_notifications boolean DEFAULT NULL
)
RETURNS TABLE (
  out_user_id uuid,
  out_theme text,
  out_language text,
  out_email_notifications boolean,
  out_updated_at timestamptz
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
  INSERT INTO user_preferences AS up (user_id, theme, language, email_notifications)
  VALUES (
    p_user_id,
    COALESCE(p_theme, 'system'),
    COALESCE(p_language, 'en'),
    COALESCE(p_email_notifications, true)
  )
  ON CONFLICT (user_id) DO UPDATE SET
    theme = COALESCE(p_theme, up.theme),
    language = COALESCE(p_language, up.language),
    email_notifications = COALESCE(p_email_notifications, up.email_notifications),
    updated_at = now();

  -- Return updated preferences
  RETURN QUERY
  SELECT
    prefs.user_id,
    prefs.theme,
    prefs.language,
    prefs.email_notifications,
    prefs.updated_at
  FROM user_preferences prefs
  WHERE prefs.user_id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_update_user_preferences TO authenticated;

COMMENT ON FUNCTION admin_update_user_preferences IS 'Admin function to update user preferences (theme, language, email_notifications). Requires Playze admin role.';
