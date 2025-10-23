-- Migration: Fix member count calculation in admin functions
-- Purpose: Use COUNT(om.user_id) instead of COUNT(*) to get accurate member counts
-- Created: 2025-01-20
-- Issue: COUNT(*) with LEFT JOIN counts organization row even when no members exist

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
    COUNT(om.user_id)::bigint as member_count  -- Changed from COUNT(*)
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
    COUNT(om.user_id)::bigint as member_count  -- Changed from COUNT(*)
  FROM organizations o
  LEFT JOIN organization_members om ON om.organization_id = o.id
  WHERE o.id = org_id
  GROUP BY o.id, o.name, o.description, o.is_active, o.created_at, o.updated_at;
END;
$$;

COMMENT ON FUNCTION admin_list_organizations IS
'Admin-only function to list all organizations with accurate member counts. Bypasses RLS. Called by Admin Portal.';

COMMENT ON FUNCTION admin_get_organization IS
'Admin-only function to get single organization with accurate member count. Bypasses RLS.';
