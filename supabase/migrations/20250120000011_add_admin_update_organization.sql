-- Migration: Add admin_update_organization function
-- Purpose: Allow admins to update organizations without triggering RLS recursion
-- Created: 2025-01-20
-- Issue: UPDATE via PostgREST triggers RLS policy recursion (organizations → organization_members → organization_members)

-- =====================================================
-- ADMIN: UPDATE ORGANIZATION
-- =====================================================

CREATE OR REPLACE FUNCTION admin_update_organization(
  org_id uuid,
  org_name text,
  org_description text,
  org_is_active boolean
)
RETURNS TABLE (
  id uuid,
  name text,
  description text,
  is_active boolean,
  created_at timestamptz,
  updated_at timestamptz
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- Authorization: Only Playze admins can update organizations
  IF NOT is_playze_admin() THEN
    RAISE EXCEPTION 'Only Playze administrators can update organizations';
  END IF;

  -- Perform update and return updated row
  RETURN QUERY
  UPDATE organizations
  SET
    name = org_name,
    description = org_description,
    is_active = org_is_active,
    updated_at = now()
  WHERE organizations.id = org_id
  RETURNING
    organizations.id,
    organizations.name,
    organizations.description,
    organizations.is_active,
    organizations.created_at,
    organizations.updated_at;
END;
$$;

COMMENT ON FUNCTION admin_update_organization IS
'Admin-only function to update organization details. Bypasses RLS to avoid infinite recursion. Called by Admin Portal.';

-- Grant execute permission to authenticated users
-- (Function itself checks is_playze_admin())
GRANT EXECUTE ON FUNCTION admin_update_organization(uuid, text, text, boolean) TO authenticated;
