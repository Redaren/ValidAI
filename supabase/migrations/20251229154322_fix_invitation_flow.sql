-- Migration: Fix Invitation Flow Gaps
-- Purpose: Address gaps in invitation handling for new and existing users
-- Created: 2025-12-29
--
-- FIXES INCLUDED:
-- 1. Honor magic link's invitation_id for new users (not just email lookup)
-- 2. Create profile/preferences for existing users on invitation acceptance
-- 3. Store organization's default_app_url in invitation for redirects

-- =====================================================
-- 1. UPDATE TRIGGER: handle_invited_user
-- =====================================================
-- Fix: Use invitation_id from user metadata (passed via magic link)
-- instead of just matching by email (which picks most recent)

CREATE OR REPLACE FUNCTION handle_invited_user()
RETURNS TRIGGER AS $$
DECLARE
  invitation_org_id uuid;
  invitation_role text;
  invitation_invited_by uuid;
  v_invitation_id uuid;
BEGIN
  -- Create profile automatically
  INSERT INTO profiles (id, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  );

  -- Create preferences automatically
  INSERT INTO user_preferences (user_id)
  VALUES (NEW.id);

  -- FIX: Check if invitation_id was passed in user metadata (from magic link)
  -- This ensures we honor the specific invitation the user clicked, not just
  -- pick the most recent one by email
  v_invitation_id := (NEW.raw_user_meta_data->>'invitation_id')::uuid;

  IF v_invitation_id IS NOT NULL THEN
    -- Use specific invitation from magic link
    SELECT
      organization_id,
      role,
      invited_by
    INTO
      invitation_org_id,
      invitation_role,
      invitation_invited_by
    FROM organization_invitations
    WHERE id = v_invitation_id
      AND status = 'pending'
      AND expires_at > now();
  ELSE
    -- Fallback to email lookup (existing behavior for backwards compatibility)
    SELECT
      organization_id,
      role,
      invited_by
    INTO
      invitation_org_id,
      invitation_role,
      invitation_invited_by
    FROM organization_invitations
    WHERE email = NEW.email
      AND status = 'pending'
      AND expires_at > now()
    ORDER BY invited_at DESC
    LIMIT 1;
  END IF;

  -- If invited, add to organization
  IF invitation_org_id IS NOT NULL THEN
    -- Add user to organization
    INSERT INTO organization_members (
      organization_id,
      user_id,
      role,
      invited_by
    )
    VALUES (
      invitation_org_id,
      NEW.id,
      invitation_role,
      invitation_invited_by
    );

    -- Mark invitation as accepted
    -- Use v_invitation_id if available, otherwise match by email
    IF v_invitation_id IS NOT NULL THEN
      UPDATE organization_invitations
      SET
        status = 'accepted',
        accepted_at = now(),
        updated_at = now()
      WHERE id = v_invitation_id
        AND status = 'pending';
    ELSE
      UPDATE organization_invitations
      SET
        status = 'accepted',
        accepted_at = now(),
        updated_at = now()
      WHERE email = NEW.email
        AND organization_id = invitation_org_id
        AND status = 'pending';
    END IF;

    -- Set initial organization in JWT metadata
    UPDATE auth.users
    SET raw_app_metadata = jsonb_set(
      COALESCE(raw_app_metadata, '{}'::jsonb),
      '{organization_id}',
      to_jsonb(invitation_org_id)
    )
    WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION handle_invited_user() IS
'Trigger function that runs on user signup to:
1. Create user profile automatically
2. Create user preferences automatically
3. Check for pending invitations (using invitation_id from metadata if available)
4. Add user to organization if invited
5. Mark invitation as accepted
6. Set initial organization in JWT metadata

Updated 2025-12-29: Now honors specific invitation_id from magic link metadata
instead of just picking most recent by email.';


-- =====================================================
-- 2. UPDATE FUNCTION: handle_existing_user_invitation
-- =====================================================
-- Fix: Create profile and user_preferences if they don't exist
-- Existing users may not have profiles if they signed up differently

-- Drop existing function to allow changing return type
DROP FUNCTION IF EXISTS handle_existing_user_invitation(uuid, uuid);

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

  -- FIX: Create profile if it doesn't exist (existing users may not have one)
  INSERT INTO profiles (id, full_name, avatar_url)
  VALUES (
    p_user_id,
    NULL,  -- Will be updated by user later
    NULL
  )
  ON CONFLICT (id) DO NOTHING;

  -- FIX: Create user_preferences if not exists
  INSERT INTO user_preferences (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  -- Check if user is already a member (shouldn't happen, but safety check)
  IF EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_members.organization_id = v_invitation.organization_id
    AND organization_members.user_id = p_user_id
  ) THEN
    -- Already a member, just mark invitation as accepted
    UPDATE organization_invitations
    SET
      status = 'accepted',
      accepted_at = now(),
      updated_at = now()
    WHERE id = p_invitation_id;

    RETURN QUERY SELECT true, v_invitation.organization_id, v_org_name, v_invitation.role, v_default_app_url;
    RETURN;
  END IF;

  -- Add user to organization
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
  );

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
- Creates profile/preferences if they don''t exist (FIX for existing users)
- Adds them to the organization
- Updates their JWT metadata
- Returns default_app_url for redirect (FIX for proper app routing)

Updated 2025-12-29: Added profile/preferences creation and default_app_url return.';


-- =====================================================
-- 3. UPDATE FUNCTION: get_invitation_details
-- =====================================================
-- Add default_app_url to response for redirect handling

-- Drop existing function to allow changing return type
DROP FUNCTION IF EXISTS get_invitation_details(uuid);

CREATE OR REPLACE FUNCTION get_invitation_details(p_invitation_id uuid)
RETURNS TABLE (
  id uuid,
  organization_id uuid,
  organization_name text,
  organization_description text,
  email text,
  role text,
  status text,
  expires_at timestamptz,
  default_app_url text
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    oi.id,
    oi.organization_id,
    o.name as organization_name,
    o.description as organization_description,
    oi.email,
    oi.role,
    oi.status,
    oi.expires_at,
    a.app_url as default_app_url
  FROM organization_invitations oi
  LEFT JOIN organizations o ON o.id = oi.organization_id
  LEFT JOIN apps a ON a.id = o.default_app_id AND a.is_active = true
  WHERE oi.id = p_invitation_id;
END;
$$;

COMMENT ON FUNCTION get_invitation_details IS
'Public function to get invitation details for the accept-invite page.
Returns organization info, invitation status, and default_app_url for proper redirect.

Updated 2025-12-29: Added default_app_url to return.';


-- =====================================================
-- PERMISSIONS
-- =====================================================

-- handle_existing_user_invitation - called by Edge Function with service_role
GRANT EXECUTE ON FUNCTION handle_existing_user_invitation(uuid, uuid) TO service_role;

-- get_invitation_details - public function for accept-invite page
GRANT EXECUTE ON FUNCTION get_invitation_details(uuid) TO authenticated;
