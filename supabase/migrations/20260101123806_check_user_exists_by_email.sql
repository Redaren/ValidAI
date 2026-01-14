-- Migration: check_user_exists_by_email
-- Purpose: Create a SECURITY DEFINER function to check if a user exists in auth.users by email
-- This is needed because PostgREST cannot query the auth schema directly

-- Create function to check if user exists by email
-- Returns the user's ID if found, NULL otherwise
-- SECURITY DEFINER allows Edge Functions to query auth.users without exposing the table
CREATE OR REPLACE FUNCTION public.check_user_exists_by_email(p_email text)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM auth.users WHERE LOWER(email) = LOWER(p_email) LIMIT 1;
$$;

-- Grant execute permission to authenticated users (Edge Functions run as authenticated)
GRANT EXECUTE ON FUNCTION public.check_user_exists_by_email(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_user_exists_by_email(text) TO service_role;

-- Add comment for documentation
COMMENT ON FUNCTION public.check_user_exists_by_email(text) IS
  'Checks if a user with the given email exists in auth.users. Returns user ID if found, NULL otherwise. Used by Edge Functions for invitation resend logic.';
