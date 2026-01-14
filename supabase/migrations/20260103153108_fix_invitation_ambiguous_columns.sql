-- Migration: Fix ambiguous column references in invitation functions
-- Purpose: Rename RETURNS TABLE columns to avoid conflicts with table columns
-- Issue: PostgreSQL error "column reference 'role' is ambiguous" because
--        RETURNS TABLE columns become PL/pgSQL variables that shadow table columns

-- =====================================================
-- DROP EXISTING FUNCTIONS (required to change return types)
-- =====================================================

DROP FUNCTION IF EXISTS user_invite_member(uuid, text, text, text);
DROP FUNCTION IF EXISTS user_get_org_invitations(uuid);
DROP FUNCTION IF EXISTS user_cancel_invitation(uuid, text);

-- =====================================================
-- 1. FIX user_invite_member
-- =====================================================

CREATE FUNCTION user_invite_member(
  p_organization_id uuid,
  p_email text,
  p_role text DEFAULT 'member',
  p_app_id text DEFAULT NULL
)
RETURNS TABLE (
  invitation_id uuid,
  out_email text,           -- Renamed from 'email' to avoid conflict
  out_role text,            -- Renamed from 'role' to avoid conflict
  out_status text,          -- Renamed from 'status' to avoid conflict
  user_exists boolean,
  is_already_member boolean
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id uuid;
  v_user_role text;
  v_existing_user_id uuid;
  v_is_member boolean := false;
  v_invitation_id uuid;
  v_normalized_email text;
  v_can_invite boolean;
  v_tier_can_invite boolean;
  v_user_role_level int;
  v_target_role_level int;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Check user is member of organization and get their role
  SELECT om.role INTO v_user_role
  FROM organization_members om
  WHERE om.organization_id = p_organization_id
    AND om.user_id = v_user_id;

  IF v_user_role IS NULL THEN
    RAISE EXCEPTION 'You are not a member of this organization';
  END IF;

  -- Check role-based permission (can_invite from role_permissions_for_role)
  SELECT (role_permissions_for_role(p_app_id, v_user_role) ->> 'can_invite')::boolean
  INTO v_can_invite;

  IF NOT COALESCE(v_can_invite, false) THEN
    RAISE EXCEPTION 'Your role does not have permission to invite members';
  END IF;

  -- Check tier-based feature flag (can_invite_members)
  IF p_app_id IS NOT NULL THEN
    SELECT (at.features ->> 'can_invite_members')::boolean INTO v_tier_can_invite
    FROM organization_app_subscriptions oas
    JOIN app_tiers at ON at.id = oas.tier_id
    WHERE oas.organization_id = p_organization_id
      AND oas.app_id = p_app_id
      AND oas.status = 'active';

    IF NOT COALESCE(v_tier_can_invite, false) THEN
      RAISE EXCEPTION 'Self-service invitations are not available on your current plan. Please contact an administrator.';
    END IF;
  END IF;

  -- Validate role hierarchy
  v_user_role_level := CASE v_user_role
    WHEN 'owner' THEN 4
    WHEN 'admin' THEN 3
    WHEN 'member' THEN 2
    WHEN 'viewer' THEN 1
    ELSE 0
  END;

  v_target_role_level := CASE p_role
    WHEN 'owner' THEN 4
    WHEN 'admin' THEN 3
    WHEN 'member' THEN 2
    WHEN 'viewer' THEN 1
    ELSE 0
  END;

  IF v_target_role_level > v_user_role_level THEN
    RAISE EXCEPTION 'You cannot assign a role higher than your own';
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

  -- Check if user exists in auth.users
  SELECT u.id INTO v_existing_user_id
  FROM auth.users u
  WHERE u.email = v_normalized_email;

  -- If user exists, check if already a member
  IF v_existing_user_id IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = p_organization_id
      AND om.user_id = v_existing_user_id
    ) INTO v_is_member;

    IF v_is_member THEN
      RAISE EXCEPTION 'User is already a member of this organization';
    END IF;
  END IF;

  -- Cancel any existing pending invitations for this email/org
  UPDATE organization_invitations oi
  SET status = 'canceled', updated_at = now()
  WHERE oi.organization_id = p_organization_id
    AND oi.email = v_normalized_email
    AND oi.status = 'pending';

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
    v_user_id,
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

-- =====================================================
-- 2. FIX user_get_org_invitations
-- =====================================================

CREATE FUNCTION user_get_org_invitations(p_organization_id uuid)
RETURNS TABLE (
  id uuid,
  out_email text,           -- Renamed from 'email' to avoid conflict
  out_role text,            -- Renamed from 'role' to avoid conflict
  out_status text,          -- Renamed from 'status' to avoid conflict
  invited_at timestamptz,
  expires_at timestamptz,
  invited_by_name text
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Check user is member of organization
  IF NOT EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = p_organization_id
    AND om.user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'You are not a member of this organization';
  END IF;

  RETURN QUERY
  SELECT
    oi.id,
    oi.email::text,
    oi.role::text,
    oi.status::text,
    oi.invited_at,
    oi.expires_at,
    p.full_name as invited_by_name
  FROM organization_invitations oi
  LEFT JOIN profiles p ON p.id = oi.invited_by
  WHERE oi.organization_id = p_organization_id
    AND oi.status = 'pending'
  ORDER BY oi.invited_at DESC;
END;
$$;

-- =====================================================
-- 3. FIX user_cancel_invitation (same pattern)
-- =====================================================

CREATE FUNCTION user_cancel_invitation(
  p_invitation_id uuid,
  p_app_id text DEFAULT NULL
)
RETURNS TABLE (
  out_id uuid,              -- Renamed from 'id' to avoid conflict
  out_email text,           -- Renamed from 'email' to avoid conflict
  out_status text           -- Renamed from 'status' to avoid conflict
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id uuid;
  v_user_role text;
  v_invitation_org_id uuid;
  v_can_manage boolean;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Get invitation's organization
  SELECT oi.organization_id INTO v_invitation_org_id
  FROM organization_invitations oi
  WHERE oi.id = p_invitation_id
    AND oi.status = 'pending';

  IF v_invitation_org_id IS NULL THEN
    RAISE EXCEPTION 'Invitation not found or already processed';
  END IF;

  -- Check user's role in that organization
  SELECT om.role INTO v_user_role
  FROM organization_members om
  WHERE om.organization_id = v_invitation_org_id
    AND om.user_id = v_user_id;

  IF v_user_role IS NULL THEN
    RAISE EXCEPTION 'You are not a member of this organization';
  END IF;

  -- Check can_manage_members permission
  SELECT (role_permissions_for_role(p_app_id, v_user_role) ->> 'can_manage_members')::boolean
  INTO v_can_manage;

  IF NOT COALESCE(v_can_manage, false) THEN
    RAISE EXCEPTION 'Your role does not have permission to manage invitations';
  END IF;

  -- Cancel invitation
  RETURN QUERY
  UPDATE organization_invitations oi
  SET status = 'canceled', updated_at = now()
  WHERE oi.id = p_invitation_id AND oi.status = 'pending'
  RETURNING oi.id, oi.email::text, oi.status::text;
END;
$$;

-- =====================================================
-- GRANT EXECUTE PERMISSIONS
-- =====================================================

GRANT EXECUTE ON FUNCTION user_invite_member(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION user_get_org_invitations(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION user_cancel_invitation(uuid, text) TO authenticated;
