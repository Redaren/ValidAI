-- Migration: Fix Invitation Edge Function Auth
-- Purpose: Remove redundant is_playze_admin() checks from functions called via Edge Functions
-- Created: 2025-12-21
--
-- PROBLEM:
-- Edge Functions use service-role client which has no JWT context.
-- Database functions that check is_playze_admin() fail because auth.email() returns NULL.
--
-- SOLUTION:
-- Remove is_playze_admin() check from functions called ONLY via Edge Functions.
-- Edge Functions already validate admin status via isPlayzeAdmin() helper before calling RPC.
--
-- ARCHITECTURE COMPLIANCE:
-- Per docs/playze-core-architecture-elevated-access.md:
-- - Edge Functions are for service-role-only operations (like inviteUserByEmail)
-- - Authorization is done in Edge Function, not duplicated in DB function

-- =====================================================
-- 1. UPDATE: admin_invite_member
-- =====================================================
-- Add p_admin_user_id parameter (passed from Edge Function)
-- Remove is_playze_admin() check (Edge Function already validated)

-- First, drop the old function signature to avoid conflicts
DROP FUNCTION IF EXISTS admin_invite_member(uuid, text, text);

CREATE OR REPLACE FUNCTION admin_invite_member(
  p_organization_id uuid,
  p_email text,
  p_role text DEFAULT 'member',
  p_admin_user_id uuid DEFAULT NULL  -- NEW: passed from Edge Function
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
  v_normalized_email text;
BEGIN
  -- NOTE: Authorization is handled by Edge Function (isPlayzeAdmin check)
  -- This function is called with service-role, so is_playze_admin() would fail

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
  -- Use p_admin_user_id if provided, otherwise fall back to auth.uid()
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
    COALESCE(p_admin_user_id, auth.uid()),
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

COMMENT ON FUNCTION admin_invite_member(uuid, text, text, uuid) IS
'Creates an invitation for a user to join an organization. Called via Edge Function which handles authorization. Returns invitation details and whether user already exists.';

-- =====================================================
-- 2. UPDATE: admin_reset_invitation_expiry
-- =====================================================
-- Remove is_playze_admin() check (Edge Function already validated)

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
  -- NOTE: Authorization is handled by Edge Function (isPlayzeAdmin check)
  -- This function is called with service-role, so is_playze_admin() would fail

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
'Resets the expiration date of a pending invitation. Called via Edge Function which handles authorization.';

-- =====================================================
-- UPDATE PERMISSIONS
-- =====================================================

-- Grant execute on new function signature to service_role (for Edge Functions)
GRANT EXECUTE ON FUNCTION admin_invite_member(uuid, text, text, uuid) TO service_role;

-- Keep authenticated for backwards compatibility if called directly
GRANT EXECUTE ON FUNCTION admin_invite_member(uuid, text, text, uuid) TO authenticated;

-- admin_reset_invitation_expiry permissions already granted in original migration
-- (signature unchanged, so no need to re-grant)
