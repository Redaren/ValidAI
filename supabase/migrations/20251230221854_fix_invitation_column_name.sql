-- Migration: Fix column name in handle_existing_user_invitation
-- Purpose: Fix typo - use raw_app_meta_data instead of raw_app_metadata
-- Created: 2025-12-30
--
-- PROBLEM:
-- Error 42703: column "raw_app_metadata" does not exist
-- The correct column name in auth.users is raw_app_meta_data (with underscore)

-- Must drop first since we're changing the function
DROP FUNCTION IF EXISTS handle_existing_user_invitation(uuid, uuid);

CREATE OR REPLACE FUNCTION handle_existing_user_invitation(
  p_user_id uuid,
  p_invitation_id uuid
)
RETURNS TABLE (
  result_success boolean,
  result_organization_id uuid,
  result_organization_name text,
  result_role text,
  result_default_app_url text
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_invitation RECORD;
  v_org_name text;
  v_user_email text;
  v_default_app_url text;
BEGIN
  -- Get invitation details
  SELECT * INTO v_invitation
  FROM organization_invitations
  WHERE id = p_invitation_id
    AND status = 'pending'
    AND expires_at > now();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found, expired, or already used';
  END IF;

  -- Get user's email
  SELECT email INTO v_user_email FROM auth.users WHERE id = p_user_id;

  -- Verify email matches (case-insensitive)
  IF lower(v_invitation.email) != lower(v_user_email) THEN
    RAISE EXCEPTION 'Invitation email does not match user email';
  END IF;

  -- Get organization name and default app URL
  SELECT
    o.name,
    a.app_url
  INTO
    v_org_name,
    v_default_app_url
  FROM organizations o
  LEFT JOIN apps a ON a.id = o.default_app_id AND a.is_active = true
  WHERE o.id = v_invitation.organization_id;

  -- Create profile if it doesn't exist (existing users may not have one)
  INSERT INTO profiles (id, full_name, avatar_url)
  VALUES (
    p_user_id,
    NULL,
    NULL
  )
  ON CONFLICT (id) DO NOTHING;

  -- Create user_preferences if not exists
  INSERT INTO user_preferences (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  -- Add user to organization (idempotent - handles duplicate calls)
  INSERT INTO organization_members (
    organization_id,
    user_id,
    role,
    invited_by
  )
  VALUES (
    v_invitation.organization_id,
    p_user_id,
    v_invitation.role,
    v_invitation.invited_by
  )
  ON CONFLICT (organization_id, user_id) DO NOTHING;

  -- Mark invitation as accepted
  UPDATE organization_invitations
  SET
    status = 'accepted',
    accepted_at = now(),
    updated_at = now()
  WHERE id = p_invitation_id;

  -- Update user's current organization in JWT metadata
  -- NOTE: The column is raw_app_meta_data (with underscore), not raw_app_metadata
  UPDATE auth.users
  SET raw_app_meta_data = jsonb_set(
    COALESCE(raw_app_meta_data, '{}'::jsonb),
    '{organization_id}',
    to_jsonb(v_invitation.organization_id::text)
  )
  WHERE id = p_user_id;

  RETURN QUERY SELECT
    true::boolean,
    v_invitation.organization_id,
    v_org_name,
    v_invitation.role,
    v_default_app_url;
END;
$$;

COMMENT ON FUNCTION handle_existing_user_invitation IS
'Processes invitation acceptance for existing users.
- Creates profile/preferences if they don''t exist
- Adds them to the organization (idempotent with ON CONFLICT DO NOTHING)
- Updates their JWT metadata
- Returns result_* columns for redirect info

Updated 2025-12-30: Fixed column name to raw_app_meta_data';

-- Re-grant permissions
GRANT EXECUTE ON FUNCTION handle_existing_user_invitation(uuid, uuid) TO service_role;
