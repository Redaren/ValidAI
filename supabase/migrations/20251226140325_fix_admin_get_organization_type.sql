-- Migration: Fix admin_get_organization type mismatch
-- Problem: auth.users.email is VARCHAR but function declares TEXT return type
-- Fix: Cast au.email::text to match RETURNS TABLE declaration
-- Created: 2025-12-26

-- Drop and recreate the function with proper type casting
DROP FUNCTION IF EXISTS admin_get_organization(uuid);

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
    -- Extended fields
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
    -- FIX: Cast VARCHAR to TEXT to match RETURNS TABLE declaration
    au.email::text as created_by_email
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
