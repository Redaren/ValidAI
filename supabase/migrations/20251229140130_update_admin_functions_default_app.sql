-- Migration: Update admin functions to handle default_app_id
-- Purpose: Include default_app_id in organization CRUD operations
-- Created: 2025-12-29

-- =====================================================
-- DROP EXISTING FUNCTIONS (required to change signatures)
-- =====================================================

DROP FUNCTION IF EXISTS admin_list_organizations();
DROP FUNCTION IF EXISTS admin_get_organization(uuid);
DROP FUNCTION IF EXISTS admin_update_organization(uuid, text, text, boolean, text, text, text, text, text, text, text, text, text, text, text, text, text);

-- =====================================================
-- RECREATE: admin_list_organizations (with default_app_id)
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
  -- Extended fields
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
  -- New field
  default_app_id text
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT is_playze_admin() THEN
    RAISE EXCEPTION 'Only Playze administrators can list all organizations';
  END IF;

  RETURN QUERY
  SELECT
    o.id,
    o.name,
    o.description,
    o.is_active,
    o.created_at,
    o.updated_at,
    COUNT(om.user_id)::bigint as member_count,
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
    o.default_app_id
  FROM organizations o
  LEFT JOIN organization_members om ON om.organization_id = o.id
  GROUP BY o.id
  ORDER BY o.name ASC;
END;
$$;

COMMENT ON FUNCTION admin_list_organizations IS
'Admin-only function to list all organizations with member counts, extended fields, and default_app_id. Bypasses RLS.';

GRANT EXECUTE ON FUNCTION admin_list_organizations() TO authenticated;

-- =====================================================
-- RECREATE: admin_get_organization (with default_app_id)
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
  -- Extended fields
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
  created_by_email text,
  -- New field
  default_app_id text
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT is_playze_admin() THEN
    RAISE EXCEPTION 'Only Playze administrators can view organization details';
  END IF;

  RETURN QUERY
  SELECT
    o.id,
    o.name,
    o.description,
    o.is_active,
    o.created_at,
    o.updated_at,
    COUNT(om.user_id)::bigint as member_count,
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
    au.email::text as created_by_email,
    o.default_app_id
  FROM organizations o
  LEFT JOIN organization_members om ON om.organization_id = o.id
  LEFT JOIN auth.users au ON au.id = o.created_by
  WHERE o.id = org_id
  GROUP BY o.id, au.email;
END;
$$;

COMMENT ON FUNCTION admin_get_organization IS
'Admin-only function to get single organization with member count, extended fields, default_app_id, and creator info. Bypasses RLS.';

GRANT EXECUTE ON FUNCTION admin_get_organization(uuid) TO authenticated;

-- =====================================================
-- RECREATE: admin_update_organization (with default_app_id)
-- =====================================================

CREATE OR REPLACE FUNCTION admin_update_organization(
  org_id uuid,
  org_name text,
  org_description text,
  org_is_active boolean,
  -- Extended fields
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
  org_kam text DEFAULT NULL,
  -- New field
  org_default_app_id text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  name text,
  description text,
  is_active boolean,
  created_at timestamptz,
  updated_at timestamptz,
  -- Extended fields
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
  -- New field
  default_app_id text
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT is_playze_admin() THEN
    RAISE EXCEPTION 'Only Playze administrators can update organizations';
  END IF;

  -- Validate default_app_id if provided (must exist in apps table and be active)
  IF org_default_app_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM apps WHERE apps.id = org_default_app_id AND apps.is_active = true) THEN
      RAISE EXCEPTION 'Invalid default_app_id: app does not exist or is not active';
    END IF;
  END IF;

  RETURN QUERY
  UPDATE organizations
  SET
    name = org_name,
    description = org_description,
    is_active = org_is_active,
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
    default_app_id = org_default_app_id,
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
    organizations.created_by,
    organizations.default_app_id;
END;
$$;

COMMENT ON FUNCTION admin_update_organization IS
'Admin-only function to update organization details including extended fields and default_app_id. Bypasses RLS to avoid infinite recursion.';

GRANT EXECUTE ON FUNCTION admin_update_organization(
  uuid, text, text, boolean,
  text, text, text, text, text, text,
  text, text, text, text, text, text, text, text
) TO authenticated;

-- =====================================================
-- CREATE admin_list_apps (for dropdown selection)
-- =====================================================

CREATE OR REPLACE FUNCTION admin_list_apps()
RETURNS TABLE (
  id text,
  name text,
  description text,
  app_url text,
  is_active boolean
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT is_playze_admin() THEN
    RAISE EXCEPTION 'Only Playze administrators can list apps';
  END IF;

  RETURN QUERY
  SELECT
    a.id,
    a.name,
    a.description,
    a.app_url,
    a.is_active
  FROM apps a
  WHERE a.is_active = true
    AND a.id != 'admin'
  ORDER BY a.name;
END;
$$;

COMMENT ON FUNCTION admin_list_apps IS
'Admin-only function to list available apps for default_app_id selection. Excludes admin portal.';

GRANT EXECUTE ON FUNCTION admin_list_apps() TO authenticated;
