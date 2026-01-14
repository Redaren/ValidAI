-- Migration: Fix Invitation Idempotency
-- Purpose: Make organization_members INSERT idempotent to handle duplicate invitation processing
-- Created: 2025-12-30
--
-- PROBLEM:
-- When a user accepts an invitation, the accept-invitation Edge Function is called twice:
-- 1. auth/callback reads invitation_id from user_metadata and calls accept-invitation
-- 2. accept-invite page also calls accept-invitation when user clicks "Accept"
--
-- This causes a duplicate key error on the organization_members INSERT because
-- the EXISTS check passes for both calls before either INSERT completes.
--
-- FIX:
-- Add ON CONFLICT DO NOTHING to make the INSERT idempotent.
-- First call inserts the record, second call succeeds silently.

-- =====================================================
-- UPDATE FUNCTION: handle_existing_user_invitation
-- =====================================================
-- Change: Add ON CONFLICT DO NOTHING to organization_members INSERT

CREATE OR REPLACE FUNCTION handle_existing_user_invitation(
  p_user_id uuid,
  p_invitation_id uuid
)
RETURNS TABLE (
  success boolean,
  organization_id uuid,
  organization_name text,
  role text,
  default_app_url text
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
    NULL,  -- Will be updated by user later
    NULL
  )
  ON CONFLICT (id) DO NOTHING;

  -- Create user_preferences if not exists
  INSERT INTO user_preferences (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  -- Add user to organization (idempotent - handles duplicate calls)
  -- FIX: ON CONFLICT DO NOTHING makes this safe for concurrent/duplicate calls
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
  UPDATE auth.users
  SET raw_app_metadata = jsonb_set(
    COALESCE(raw_app_metadata, '{}'::jsonb),
    '{organization_id}',
    to_jsonb(v_invitation.organization_id::text)
  )
  WHERE id = p_user_id;

  RETURN QUERY SELECT true, v_invitation.organization_id, v_org_name, v_invitation.role, v_default_app_url;
END;
$$;

COMMENT ON FUNCTION handle_existing_user_invitation IS
'Processes invitation acceptance for existing users.
- Creates profile/preferences if they don''t exist
- Adds them to the organization (idempotent with ON CONFLICT DO NOTHING)
- Updates their JWT metadata
- Returns default_app_url for redirect

Updated 2025-12-30: Made organization_members INSERT idempotent to handle
duplicate invitation processing from auth/callback and accept-invite page.';
