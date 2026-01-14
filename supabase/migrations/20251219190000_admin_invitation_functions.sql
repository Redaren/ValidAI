-- Migration: Admin Invitation Functions
-- Purpose: Provide functions for inviting users to organizations via Admin Portal
-- Created: 2025-12-19
-- Feature: Organization Invitation System

-- =====================================================
-- CONTEXT & RATIONALE
-- =====================================================
-- This migration adds functions to support the organization invitation flow:
-- 1. admin_invite_member - Create invitation, detect existing users
-- 2. admin_cancel_invitation - Cancel a pending invitation
-- 3. admin_update_invitation_role - Change role before acceptance
-- 4. admin_get_members_and_invitations - Combined view for UI
-- 5. handle_existing_user_invitation - Process acceptance for existing users
--
-- The flow handles two user types:
-- - New users: Trigger auto-joins them when they sign up via magic link
-- - Existing users: accept-invitation Edge Function adds them to org

-- =====================================================
-- 1. ADMIN: INVITE MEMBER TO ORGANIZATION
-- =====================================================
-- Creates an invitation record and returns info about whether
-- the user already exists (so caller knows which email template to use)

CREATE OR REPLACE FUNCTION admin_invite_member(
  p_organization_id uuid,
  p_email text,
  p_role text DEFAULT 'member'
)
RETURNS TABLE (
  invitation_id uuid,
  email text,
  role text,
  status text,
  user_exists boolean,
  is_already_member boolean
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_existing_user_id uuid;
  v_is_member boolean := false;
  v_invitation_id uuid;
  v_admin_user_id uuid;
  v_normalized_email text;
BEGIN
  -- Authorization
  IF NOT is_playze_admin() THEN
    RAISE EXCEPTION 'Only Playze administrators can invite members';
  END IF;

  -- Normalize email
  v_normalized_email := lower(trim(p_email));

  -- Validate email format
  IF v_normalized_email !~ '^[^@]+@[^@]+\.[^@]+$' THEN
    RAISE EXCEPTION 'Invalid email format';
  END IF;

  -- Validate role
  IF p_role NOT IN ('owner', 'admin', 'member', 'viewer') THEN
    RAISE EXCEPTION 'Invalid role. Must be owner, admin, member, or viewer';
  END IF;

  -- Check organization exists
  IF NOT EXISTS (SELECT 1 FROM organizations WHERE id = p_organization_id) THEN
    RAISE EXCEPTION 'Organization not found';
  END IF;

  -- Get admin user ID for invited_by
  v_admin_user_id := auth.uid();

  -- Check if user exists in auth.users
  SELECT id INTO v_existing_user_id
  FROM auth.users
  WHERE auth.users.email = v_normalized_email;

  -- If user exists, check if already a member
  IF v_existing_user_id IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM organization_members
      WHERE organization_id = p_organization_id
      AND user_id = v_existing_user_id
    ) INTO v_is_member;

    IF v_is_member THEN
      RAISE EXCEPTION 'User is already a member of this organization';
    END IF;
  END IF;

  -- Cancel any existing pending invitations for this email/org
  UPDATE organization_invitations
  SET status = 'canceled', updated_at = now()
  WHERE organization_id = p_organization_id
    AND organization_invitations.email = v_normalized_email
    AND organization_invitations.status = 'pending';

  -- Create new invitation
  INSERT INTO organization_invitations (
    organization_id,
    email,
    role,
    status,
    invited_by,
    expires_at
  )
  VALUES (
    p_organization_id,
    v_normalized_email,
    p_role,
    'pending',
    v_admin_user_id,
    now() + interval '7 days'
  )
  RETURNING id INTO v_invitation_id;

  RETURN QUERY
  SELECT
    v_invitation_id,
    v_normalized_email,
    p_role,
    'pending'::text,
    v_existing_user_id IS NOT NULL,
    v_is_member;
END;
$$;

COMMENT ON FUNCTION admin_invite_member IS
'Admin-only function to create an invitation for a user to join an organization. Returns invitation details and whether user already exists.';

-- =====================================================
-- 2. ADMIN: CANCEL INVITATION
-- =====================================================

CREATE OR REPLACE FUNCTION admin_cancel_invitation(p_invitation_id uuid)
RETURNS TABLE (
  id uuid,
  email text,
  status text
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT is_playze_admin() THEN
    RAISE EXCEPTION 'Only Playze administrators can cancel invitations';
  END IF;

  -- Check invitation exists and is pending
  IF NOT EXISTS (
    SELECT 1 FROM organization_invitations
    WHERE organization_invitations.id = p_invitation_id
    AND organization_invitations.status = 'pending'
  ) THEN
    RAISE EXCEPTION 'Invitation not found or already processed';
  END IF;

  RETURN QUERY
  UPDATE organization_invitations oi
  SET
    status = 'canceled',
    updated_at = now()
  WHERE oi.id = p_invitation_id
    AND oi.status = 'pending'
  RETURNING oi.id, oi.email, oi.status;
END;
$$;

COMMENT ON FUNCTION admin_cancel_invitation IS
'Admin-only function to cancel a pending invitation.';

-- =====================================================
-- 3. ADMIN: UPDATE INVITATION ROLE
-- =====================================================

CREATE OR REPLACE FUNCTION admin_update_invitation_role(
  p_invitation_id uuid,
  p_new_role text
)
RETURNS TABLE (
  id uuid,
  email text,
  role text
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT is_playze_admin() THEN
    RAISE EXCEPTION 'Only Playze administrators can update invitations';
  END IF;

  IF p_new_role NOT IN ('owner', 'admin', 'member', 'viewer') THEN
    RAISE EXCEPTION 'Invalid role. Must be owner, admin, member, or viewer';
  END IF;

  -- Check invitation exists and is pending
  IF NOT EXISTS (
    SELECT 1 FROM organization_invitations
    WHERE organization_invitations.id = p_invitation_id
    AND organization_invitations.status = 'pending'
  ) THEN
    RAISE EXCEPTION 'Invitation not found or already processed';
  END IF;

  RETURN QUERY
  UPDATE organization_invitations oi
  SET
    role = p_new_role,
    updated_at = now()
  WHERE oi.id = p_invitation_id
    AND oi.status = 'pending'
  RETURNING oi.id, oi.email, oi.role;
END;
$$;

COMMENT ON FUNCTION admin_update_invitation_role IS
'Admin-only function to change the role of a pending invitation.';

-- =====================================================
-- 4. ADMIN: GET MEMBERS AND INVITATIONS (UNIFIED VIEW)
-- =====================================================
-- Returns a combined list of organization members and pending invitations
-- for display in the Admin Portal members tab

CREATE OR REPLACE FUNCTION admin_get_members_and_invitations(p_org_id uuid)
RETURNS TABLE (
  id text,
  entry_type text,  -- 'member' or 'invitation'
  email text,
  full_name text,
  avatar_url text,
  role text,
  status text,
  joined_at timestamptz,
  invited_at timestamptz,
  expires_at timestamptz,
  invited_by_name text
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT is_playze_admin() THEN
    RAISE EXCEPTION 'Only Playze administrators can view this data';
  END IF;

  -- Check organization exists
  IF NOT EXISTS (SELECT 1 FROM organizations WHERE organizations.id = p_org_id) THEN
    RAISE EXCEPTION 'Organization not found';
  END IF;

  RETURN QUERY
  -- Active members
  SELECT
    om.user_id::text as id,
    'member'::text as entry_type,
    au.email::text,
    p.full_name::text,
    p.avatar_url::text,
    om.role::text,
    'active'::text as status,
    om.joined_at,
    NULL::timestamptz as invited_at,
    NULL::timestamptz as expires_at,
    NULL::text as invited_by_name
  FROM organization_members om
  LEFT JOIN auth.users au ON au.id = om.user_id
  LEFT JOIN profiles p ON p.id = om.user_id
  WHERE om.organization_id = p_org_id

  UNION ALL

  -- Pending invitations
  SELECT
    oi.id::text,
    'invitation'::text as entry_type,
    oi.email::text,
    NULL::text as full_name,
    NULL::text as avatar_url,
    oi.role::text,
    oi.status::text,
    NULL::timestamptz as joined_at,
    oi.invited_at,
    oi.expires_at,
    ip.full_name::text as invited_by_name
  FROM organization_invitations oi
  LEFT JOIN profiles ip ON ip.id = oi.invited_by
  WHERE oi.organization_id = p_org_id
    AND oi.status = 'pending'

  ORDER BY entry_type ASC, joined_at DESC NULLS LAST, invited_at DESC NULLS LAST;
END;
$$;

COMMENT ON FUNCTION admin_get_members_and_invitations IS
'Admin-only function to get a unified list of organization members and pending invitations for display in the Admin Portal.';

-- =====================================================
-- 5. HANDLE EXISTING USER INVITATION ACCEPTANCE
-- =====================================================
-- Called by Edge Function when an existing user accepts an invitation
-- Adds them to the organization and marks the invitation as accepted

CREATE OR REPLACE FUNCTION handle_existing_user_invitation(
  p_user_id uuid,
  p_invitation_id uuid
)
RETURNS TABLE (
  success boolean,
  organization_id uuid,
  organization_name text,
  role text
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_invitation RECORD;
  v_org_name text;
  v_user_email text;
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

  -- Get organization name
  SELECT name INTO v_org_name FROM organizations WHERE id = v_invitation.organization_id;

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

    RETURN QUERY SELECT true, v_invitation.organization_id, v_org_name, v_invitation.role;
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

  RETURN QUERY SELECT true, v_invitation.organization_id, v_org_name, v_invitation.role;
END;
$$;

COMMENT ON FUNCTION handle_existing_user_invitation IS
'Processes invitation acceptance for existing users. Adds them to the organization and updates their JWT metadata.';

-- =====================================================
-- 6. ADMIN: RESEND INVITATION (RESET EXPIRY)
-- =====================================================
-- Resets the expiration date for an invitation so it can be resent

CREATE OR REPLACE FUNCTION admin_reset_invitation_expiry(p_invitation_id uuid)
RETURNS TABLE (
  id uuid,
  email text,
  expires_at timestamptz
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT is_playze_admin() THEN
    RAISE EXCEPTION 'Only Playze administrators can resend invitations';
  END IF;

  -- Check invitation exists and is pending
  IF NOT EXISTS (
    SELECT 1 FROM organization_invitations
    WHERE organization_invitations.id = p_invitation_id
    AND organization_invitations.status = 'pending'
  ) THEN
    RAISE EXCEPTION 'Invitation not found or already processed';
  END IF;

  RETURN QUERY
  UPDATE organization_invitations oi
  SET
    expires_at = now() + interval '7 days',
    updated_at = now()
  WHERE oi.id = p_invitation_id
    AND oi.status = 'pending'
  RETURNING oi.id, oi.email, oi.expires_at;
END;
$$;

COMMENT ON FUNCTION admin_reset_invitation_expiry IS
'Admin-only function to reset the expiration date of a pending invitation before resending.';

-- =====================================================
-- 7. GET INVITATION DETAILS (FOR ACCEPT PAGE)
-- =====================================================
-- Public function to get invitation details for the accept-invite page
-- Does not require admin access, but does require the invitation to exist

CREATE OR REPLACE FUNCTION get_invitation_details(p_invitation_id uuid)
RETURNS TABLE (
  id uuid,
  organization_id uuid,
  organization_name text,
  organization_description text,
  email text,
  role text,
  status text,
  expires_at timestamptz
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
    oi.expires_at
  FROM organization_invitations oi
  LEFT JOIN organizations o ON o.id = oi.organization_id
  WHERE oi.id = p_invitation_id;
END;
$$;

COMMENT ON FUNCTION get_invitation_details IS
'Public function to get invitation details for the accept-invite page. Returns organization info and invitation status.';

-- =====================================================
-- GRANT EXECUTE PERMISSIONS
-- =====================================================

-- Admin functions (check is_playze_admin internally)
GRANT EXECUTE ON FUNCTION admin_invite_member(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_cancel_invitation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_update_invitation_role(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_members_and_invitations(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_reset_invitation_expiry(uuid) TO authenticated;

-- Service role functions (called by Edge Functions)
GRANT EXECUTE ON FUNCTION handle_existing_user_invitation(uuid, uuid) TO service_role;

-- Public function (for accept-invite page)
GRANT EXECUTE ON FUNCTION get_invitation_details(uuid) TO authenticated;

-- =====================================================
-- USAGE EXAMPLES
-- =====================================================

-- From Admin Portal (JavaScript/TypeScript):
--
-- // Create invitation
-- const { data, error } = await supabase.rpc('admin_invite_member', {
--   p_organization_id: 'org-uuid',
--   p_email: 'user@example.com',
--   p_role: 'member'
-- })
--
-- // Cancel invitation
-- const { data, error } = await supabase.rpc('admin_cancel_invitation', {
--   p_invitation_id: 'invitation-uuid'
-- })
--
-- // Update invitation role
-- const { data, error } = await supabase.rpc('admin_update_invitation_role', {
--   p_invitation_id: 'invitation-uuid',
--   p_new_role: 'admin'
-- })
--
-- // Get members and invitations
-- const { data, error } = await supabase.rpc('admin_get_members_and_invitations', {
--   p_org_id: 'org-uuid'
-- })
--
-- // From Edge Function (service role):
-- const { data, error } = await supabase.rpc('handle_existing_user_invitation', {
--   p_user_id: 'user-uuid',
--   p_invitation_id: 'invitation-uuid'
-- })
