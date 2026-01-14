-- Fix admin_get_user_preferences to match actual user_preferences table schema
-- The table has no 'id' column - it uses 'user_id' as primary key
-- This was causing 400 errors and slow page loads due to TanStack Query retries

-- Drop existing function first (return type is changing)
DROP FUNCTION IF EXISTS admin_get_user_preferences(uuid);

CREATE FUNCTION admin_get_user_preferences(p_user_id uuid)
RETURNS TABLE(
  user_id uuid,
  theme text,
  language text,
  timezone text,
  email_notifications boolean,
  push_notifications boolean,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Authorization
  IF NOT is_playze_admin() THEN
    RAISE EXCEPTION 'Only Playze administrators can view user preferences';
  END IF;

  -- Return preferences for any user (bypasses user_id = auth.uid() RLS check)
  RETURN QUERY
  SELECT
    up.user_id,
    up.theme,
    up.language,
    up.timezone,
    up.email_notifications,
    up.push_notifications,
    up.created_at,
    up.updated_at
  FROM user_preferences up
  WHERE up.user_id = p_user_id;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION admin_get_user_preferences(uuid) TO authenticated;
