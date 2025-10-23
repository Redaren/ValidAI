-- Migration: Fix type mismatch in admin_list_organization_members
-- Purpose: Cast auth.users.email from varchar(255) to text to match return type
-- Created: 2025-01-20
-- Issue: PostgREST error 42804 - "Returned type character varying(255) does not match expected type text in column 6"

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
    -- Join with auth.users for email (cast varchar(255) to text)
    au.email::text as user_email,
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
