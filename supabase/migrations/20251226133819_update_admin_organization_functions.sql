-- Migration: Update admin organization functions for extended fields
-- Purpose: Add new organization fields to admin functions (get, list, update)
-- Created: 2025-12-26

-- =====================================================
-- DROP EXISTING FUNCTIONS (required to change return types)
-- =====================================================

DROP FUNCTION IF EXISTS admin_list_organizations();
DROP FUNCTION IF EXISTS admin_get_organization(uuid);
DROP FUNCTION IF EXISTS admin_update_organization(uuid, text, text, boolean);

-- =====================================================
-- RECREATE: admin_list_organizations
-- Returns all new fields for organization list view
-- =====================================================

CREATE OR REPLACE FUNCTION admin_list_organizations()
RETURNS TABLE (
  id uuid,
  name text,
  description text,
  is_active boolean,
  created_at timestamptz,
  updated_at timestamptz,
  member_count bigint,
  -- New fields
  org_number text,
  vat_number text,
  street_address text,
  postal_code text,
  city text,
  country text,
  contact_person text,
  contact_role text,
  contact_email text,
  contact_phone text,
  referral text,
  lead_source text,
  kam text,
  created_by uuid
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
    COUNT(om.user_id)::bigint as member_count,
    -- New fields
    o.org_number,
    o.vat_number,
    o.street_address,
    o.postal_code,
    o.city,
    o.country,
    o.contact_person,
    o.contact_role,
    o.contact_email,
    o.contact_phone,
    o.referral,
    o.lead_source,
    o.kam,
    o.created_by
  FROM organizations o
  LEFT JOIN organization_members om ON om.organization_id = o.id
  GROUP BY o.id
  ORDER BY o.name ASC;
END;
$$;

COMMENT ON FUNCTION admin_list_organizations IS
'Admin-only function to list all organizations with member counts and extended fields. Bypasses RLS.';

-- Grant execute permission
GRANT EXECUTE ON FUNCTION admin_list_organizations() TO authenticated;

-- =====================================================
-- RECREATE: admin_get_organization
-- Returns all new fields for single organization view
-- =====================================================

CREATE OR REPLACE FUNCTION admin_get_organization(org_id uuid)
RETURNS TABLE (
  id uuid,
  name text,
  description text,
  is_active boolean,
  created_at timestamptz,
  updated_at timestamptz,
  member_count bigint,
  -- New fields
  org_number text,
  vat_number text,
  street_address text,
  postal_code text,
  city text,
  country text,
  contact_person text,
  contact_role text,
  contact_email text,
  contact_phone text,
  referral text,
  lead_source text,
  kam text,
  created_by uuid,
  created_by_email text
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

  -- Return single organization with member count and creator email
  RETURN QUERY
  SELECT
    o.id,
    o.name,
    o.description,
    o.is_active,
    o.created_at,
    o.updated_at,
    COUNT(om.user_id)::bigint as member_count,
    -- New fields
    o.org_number,
    o.vat_number,
    o.street_address,
    o.postal_code,
    o.city,
    o.country,
    o.contact_person,
    o.contact_role,
    o.contact_email,
    o.contact_phone,
    o.referral,
    o.lead_source,
    o.kam,
    o.created_by,
    -- Join to get creator email
    au.email as created_by_email
  FROM organizations o
  LEFT JOIN organization_members om ON om.organization_id = o.id
  LEFT JOIN auth.users au ON au.id = o.created_by
  WHERE o.id = org_id
  GROUP BY o.id, au.email;
END;
$$;

COMMENT ON FUNCTION admin_get_organization IS
'Admin-only function to get single organization with member count, extended fields, and creator info. Bypasses RLS.';

-- Grant execute permission
GRANT EXECUTE ON FUNCTION admin_get_organization(uuid) TO authenticated;

-- =====================================================
-- RECREATE: admin_update_organization
-- Accepts and updates all new fields
-- =====================================================

CREATE OR REPLACE FUNCTION admin_update_organization(
  org_id uuid,
  org_name text,
  org_description text,
  org_is_active boolean,
  -- New fields
  org_org_number text DEFAULT NULL,
  org_vat_number text DEFAULT NULL,
  org_street_address text DEFAULT NULL,
  org_postal_code text DEFAULT NULL,
  org_city text DEFAULT NULL,
  org_country text DEFAULT NULL,
  org_contact_person text DEFAULT NULL,
  org_contact_role text DEFAULT NULL,
  org_contact_email text DEFAULT NULL,
  org_contact_phone text DEFAULT NULL,
  org_referral text DEFAULT NULL,
  org_lead_source text DEFAULT NULL,
  org_kam text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  name text,
  description text,
  is_active boolean,
  created_at timestamptz,
  updated_at timestamptz,
  -- New fields
  org_number text,
  vat_number text,
  street_address text,
  postal_code text,
  city text,
  country text,
  contact_person text,
  contact_role text,
  contact_email text,
  contact_phone text,
  referral text,
  lead_source text,
  kam text,
  created_by uuid
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
    -- New fields
    org_number = org_org_number,
    vat_number = org_vat_number,
    street_address = org_street_address,
    postal_code = org_postal_code,
    city = org_city,
    country = org_country,
    contact_person = org_contact_person,
    contact_role = org_contact_role,
    contact_email = org_contact_email,
    contact_phone = org_contact_phone,
    referral = org_referral,
    lead_source = org_lead_source,
    kam = org_kam,
    updated_at = now()
  WHERE organizations.id = org_id
  RETURNING
    organizations.id,
    organizations.name,
    organizations.description,
    organizations.is_active,
    organizations.created_at,
    organizations.updated_at,
    organizations.org_number,
    organizations.vat_number,
    organizations.street_address,
    organizations.postal_code,
    organizations.city,
    organizations.country,
    organizations.contact_person,
    organizations.contact_role,
    organizations.contact_email,
    organizations.contact_phone,
    organizations.referral,
    organizations.lead_source,
    organizations.kam,
    organizations.created_by;
END;
$$;

COMMENT ON FUNCTION admin_update_organization IS
'Admin-only function to update organization details including extended fields. Bypasses RLS to avoid infinite recursion.';

-- Grant execute permission to authenticated users
-- (Function itself checks is_playze_admin())
GRANT EXECUTE ON FUNCTION admin_update_organization(
  uuid, text, text, boolean,
  text, text, text, text, text, text,
  text, text, text, text, text, text, text
) TO authenticated;
