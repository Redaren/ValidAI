-- Migration: Fix admin_list_organization_members function
-- Purpose: Remove references to non-existent om.id column
-- Created: 2025-01-20
-- Issue: organization_members has composite primary key (organization_id, user_id), no id column

-- =====================================================
-- FIX: Update admin_list_organizations function
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

-- =====================================================
-- FIX: Update admin_get_organization function
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

-- =====================================================
-- FIX: Update admin_list_organization_members function
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
