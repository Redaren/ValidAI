-- Migration: Add check_orphaned_user_for_cleanup function
-- Purpose: Helper function for cancel-invitation Edge Function to identify orphaned users
-- Created: 2025-12-30
--
-- CONTEXT:
-- When inviteUserByEmail() is called, Supabase creates a user record in auth.users
-- immediately (even before the user clicks the magic link). If the invitation is
-- cancelled before the user accepts, this creates an "orphaned" user record.
--
-- This function checks if a user with the given email is:
-- 1. Unconfirmed (email_confirmed_at IS NULL)
-- 2. Not a member of any organization
--
-- If both conditions are true, the user can be safely deleted.

CREATE OR REPLACE FUNCTION check_orphaned_user_for_cleanup(p_email text)
RETURNS TABLE (
  user_id uuid,
  email text,
  is_confirmed boolean,
  has_memberships boolean,
  can_delete boolean
)
SECURITY DEFINER
SET search_path = public, auth
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id uuid;
  v_email_confirmed_at timestamptz;
  v_has_memberships boolean;
BEGIN
  -- Normalize email
  p_email := lower(trim(p_email));

  -- Find user by email in auth.users
  SELECT id, email_confirmed_at
  INTO v_user_id, v_email_confirmed_at
  FROM auth.users
  WHERE auth.users.email = p_email;

  -- If no user found, return empty
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  -- Check if user has any organization memberships
  SELECT EXISTS(
    SELECT 1 FROM organization_members
    WHERE organization_members.user_id = v_user_id
  ) INTO v_has_memberships;

  -- Return result
  RETURN QUERY
  SELECT
    v_user_id,
    p_email,
    v_email_confirmed_at IS NOT NULL,  -- is_confirmed
    v_has_memberships,                  -- has_memberships
    (v_email_confirmed_at IS NULL AND NOT v_has_memberships);  -- can_delete
END;
$$;

COMMENT ON FUNCTION check_orphaned_user_for_cleanup IS
'Helper function for cancel-invitation Edge Function.
Checks if a user with the given email is orphaned (unconfirmed + no org memberships).
Returns user_id and can_delete flag to indicate if safe to delete.';

-- Grant execute to service_role (Edge Functions)
GRANT EXECUTE ON FUNCTION check_orphaned_user_for_cleanup(text) TO service_role;
