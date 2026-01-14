-- Migration: Fix user_get_org_members return type mismatch
-- Purpose: Cast auth.users.email from varchar to text to match RETURNS TABLE declaration
-- Issue: PostgreSQL's RETURNS TABLE is strict about types - varchar != text

CREATE OR REPLACE FUNCTION user_get_org_members(
  p_organization_id uuid,
  p_app_id text DEFAULT NULL
)
RETURNS TABLE (
  user_id uuid,
  email text,
  full_name text,
  avatar_url text,
  role text,
  is_active boolean,
  joined_at timestamptz
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
    SELECT 1 FROM organization_members
    WHERE organization_id = p_organization_id
    AND organization_members.user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'You are not a member of this organization';
  END IF;

  RETURN QUERY
  SELECT
    om.user_id,
    u.email::text,          -- FIX: Cast varchar to text
    p.full_name,
    p.avatar_url,
    om.role,
    om.is_active,
    om.joined_at
  FROM organization_members om
  JOIN auth.users u ON u.id = om.user_id
  LEFT JOIN profiles p ON p.id = om.user_id
  WHERE om.organization_id = p_organization_id
  ORDER BY
    -- Sort by role level (owners first)
    CASE om.role
      WHEN 'owner' THEN 1
      WHEN 'admin' THEN 2
      WHEN 'member' THEN 3
      WHEN 'viewer' THEN 4
    END,
    -- Then by active status (active first)
    om.is_active DESC,
    -- Then by name/email
    COALESCE(p.full_name, u.email);
END;
$$;
