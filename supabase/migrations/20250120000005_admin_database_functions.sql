-- Migration: Admin Database Functions
-- Purpose: Provide SECURITY DEFINER functions for admin portal to bypass RLS
-- Created: 2025-01-20
-- Approach: Separate admin access via database functions instead of RLS policies

-- =====================================================
-- CONTEXT & RATIONALE
-- =====================================================
-- Problem: RLS policies with OR is_playze_admin() cause infinite recursion
-- because organizations policy queries organization_members, which also
-- has RLS policies that query organization_members.
--
-- Solution: Admin portal uses dedicated database functions that:
-- 1. Check is_playze_admin() first
-- 2. Use SECURITY DEFINER to bypass RLS entirely
-- 3. Perform joins and aggregations server-side
-- 4. Return complete data in single query
--
-- Regular users continue to use PostgREST with simple RLS policies.

-- =====================================================
-- 1. ADMIN: LIST ALL ORGANIZATIONS
-- =====================================================

CREATE OR REPLACE FUNCTION admin_list_organizations()
RETURNS TABLE (
  id uuid,
  name text,
  description text,
  is_active boolean,
  created_at timestamptz,
  updated_at timestamptz,
  member_count bigint
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- Authorization: Only Playze admins can call this function
  IF NOT is_playze_admin() THEN
    RAISE EXCEPTION 'Only Playze administrators can list all organizations';
  END IF;

  -- Bypass RLS and return all organizations with member counts
  RETURN QUERY
  SELECT
    o.id,
    o.name,
    o.description,
    o.is_active,
    o.created_at,
    o.updated_at,
    COUNT(*)::bigint as member_count
  FROM organizations o
  LEFT JOIN organization_members om ON om.organization_id = o.id
  GROUP BY o.id, o.name, o.description, o.is_active, o.created_at, o.updated_at
  ORDER BY o.name ASC;
END;
$$;

COMMENT ON FUNCTION admin_list_organizations IS
'Admin-only function to list all organizations with member counts. Bypasses RLS. Called by Admin Portal.';

-- =====================================================
-- 2. ADMIN: GET SINGLE ORGANIZATION
-- =====================================================

CREATE OR REPLACE FUNCTION admin_get_organization(org_id uuid)
RETURNS TABLE (
  id uuid,
  name text,
  description text,
  is_active boolean,
  created_at timestamptz,
  updated_at timestamptz,
  member_count bigint
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- Authorization
  IF NOT is_playze_admin() THEN
    RAISE EXCEPTION 'Only Playze administrators can view organization details';
  END IF;

  -- Return single organization with member count
  RETURN QUERY
  SELECT
    o.id,
    o.name,
    o.description,
    o.is_active,
    o.created_at,
    o.updated_at,
    COUNT(*)::bigint as member_count
  FROM organizations o
  LEFT JOIN organization_members om ON om.organization_id = o.id
  WHERE o.id = org_id
  GROUP BY o.id, o.name, o.description, o.is_active, o.created_at, o.updated_at;
END;
$$;

COMMENT ON FUNCTION admin_get_organization IS
'Admin-only function to get single organization with member count. Bypasses RLS.';

-- =====================================================
-- 3. ADMIN: LIST ORGANIZATION MEMBERS
-- =====================================================

CREATE OR REPLACE FUNCTION admin_list_organization_members(org_id uuid)
RETURNS TABLE (
  organization_id uuid,
  user_id uuid,
  role text,
  joined_at timestamptz,
  invited_by uuid,
  -- Profile info
  user_email text,
  user_full_name text,
  user_avatar_url text
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- Authorization
  IF NOT is_playze_admin() THEN
    RAISE EXCEPTION 'Only Playze administrators can list organization members';
  END IF;

  -- Return members with profile info
  RETURN QUERY
  SELECT
    om.organization_id,
    om.user_id,
    om.role,
    om.joined_at,
    om.invited_by,
    -- Join with auth.users for email
    au.email as user_email,
    -- Join with profiles for name and avatar
    p.full_name as user_full_name,
    p.avatar_url as user_avatar_url
  FROM organization_members om
  LEFT JOIN auth.users au ON au.id = om.user_id
  LEFT JOIN profiles p ON p.id = om.user_id
  WHERE om.organization_id = org_id
  ORDER BY om.joined_at DESC;
END;
$$;

COMMENT ON FUNCTION admin_list_organization_members IS
'Admin-only function to list members of an organization with profile info. Bypasses RLS.';

-- =====================================================
-- 4. ADMIN: LIST ORGANIZATION SUBSCRIPTIONS
-- =====================================================

CREATE OR REPLACE FUNCTION admin_list_organization_subscriptions(org_id uuid)
RETURNS TABLE (
  id uuid,
  organization_id uuid,
  app_id text,
  tier_id uuid,
  tier_name text,
  status text,
  billing_period_start timestamptz,
  billing_period_end timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  notes text,
  -- App info
  app_name text,
  app_description text,
  -- Tier info
  tier_display_name text,
  tier_features jsonb,
  tier_limits jsonb
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- Authorization
  IF NOT is_playze_admin() THEN
    RAISE EXCEPTION 'Only Playze administrators can list organization subscriptions';
  END IF;

  -- Return subscriptions with app and tier details
  RETURN QUERY
  SELECT
    oas.id,
    oas.organization_id,
    oas.app_id,
    oas.tier_id,
    oas.tier_name,
    oas.status,
    oas.billing_period_start,
    oas.billing_period_end,
    oas.created_at,
    oas.updated_at,
    oas.notes,
    -- App details
    a.name as app_name,
    a.description as app_description,
    -- Tier details
    at.display_name as tier_display_name,
    at.features as tier_features,
    at.limits as tier_limits
  FROM organization_app_subscriptions oas
  LEFT JOIN apps a ON a.id = oas.app_id
  LEFT JOIN app_tiers at ON at.id = oas.tier_id
  WHERE oas.organization_id = org_id
  ORDER BY oas.created_at DESC;
END;
$$;

COMMENT ON FUNCTION admin_list_organization_subscriptions IS
'Admin-only function to list subscriptions for an organization with app and tier details. Bypasses RLS.';

-- =====================================================
-- 5. ADMIN: LIST ORGANIZATION INVITATIONS
-- =====================================================

CREATE OR REPLACE FUNCTION admin_list_organization_invitations(org_id uuid)
RETURNS TABLE (
  id uuid,
  organization_id uuid,
  email text,
  role text,
  invited_by uuid,
  invited_at timestamptz,
  expires_at timestamptz,
  status text,
  -- Inviter info
  inviter_email text,
  inviter_full_name text
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- Authorization
  IF NOT is_playze_admin() THEN
    RAISE EXCEPTION 'Only Playze administrators can list organization invitations';
  END IF;

  -- Return invitations with inviter details
  RETURN QUERY
  SELECT
    oi.id,
    oi.organization_id,
    oi.email,
    oi.role,
    oi.invited_by,
    oi.invited_at,
    oi.expires_at,
    oi.status,
    -- Inviter details
    au.email as inviter_email,
    p.full_name as inviter_full_name
  FROM organization_invitations oi
  LEFT JOIN auth.users au ON au.id = oi.invited_by
  LEFT JOIN profiles p ON p.id = oi.invited_by
  WHERE oi.organization_id = org_id
  ORDER BY oi.invited_at DESC;
END;
$$;

COMMENT ON FUNCTION admin_list_organization_invitations IS
'Admin-only function to list invitations for an organization with inviter details. Bypasses RLS.';

-- =====================================================
-- GRANT EXECUTE PERMISSIONS
-- =====================================================

-- Allow authenticated users to call these functions
-- (Functions themselves check is_playze_admin())
GRANT EXECUTE ON FUNCTION admin_list_organizations() TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_organization(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_list_organization_members(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_list_organization_subscriptions(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_list_organization_invitations(uuid) TO authenticated;

-- =====================================================
-- USAGE EXAMPLES
-- =====================================================

-- From JavaScript/TypeScript (Admin Portal):
--
-- // List all organizations
-- const { data, error } = await supabase.rpc('admin_list_organizations')
--
-- // Get single organization
-- const { data, error } = await supabase.rpc('admin_get_organization', {
--   org_id: '123e4567-e89b-12d3-a456-426614174000'
-- })
--
-- // List members
-- const { data, error } = await supabase.rpc('admin_list_organization_members', {
--   org_id: '123e4567-e89b-12d3-a456-426614174000'
-- })
--
-- // List subscriptions
-- const { data, error } = await supabase.rpc('admin_list_organization_subscriptions', {
--   org_id: '123e4567-e89b-12d3-a456-426614174000'
-- })
--
-- // List invitations
-- const { data, error } = await supabase.rpc('admin_list_organization_invitations', {
--   org_id: '123e4567-e89b-12d3-a456-426614174000'
-- })
