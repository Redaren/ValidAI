-- Migration: Add invited_by_name to user_get_org_members_paginated
-- Purpose: Return the name of the person who invited each member
-- Created: 2026-01-03
-- Feature: "Invited by" column in OrgMembersTable (hidden by default)

-- =====================================================
-- CONTEXT & RATIONALE
-- =====================================================
-- The organization_members table has an invited_by UUID column.
-- This migration modifies user_get_org_members_paginated() to also
-- return the inviter's display name (full_name or email fallback).

-- =====================================================
-- USER: GET ORGANIZATION MEMBERS (PAGINATED) - WITH INVITED BY
-- =====================================================

-- Must drop first to change return type (add invited_by_name column)
DROP FUNCTION IF EXISTS user_get_org_members_paginated(uuid, text, text, integer, integer);

CREATE OR REPLACE FUNCTION user_get_org_members_paginated(
  p_organization_id uuid,
  p_app_id text DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 10,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  user_id uuid,
  email text,
  full_name text,
  avatar_url text,
  role text,
  is_active boolean,
  joined_at timestamptz,
  invited_by_name text,
  total_count bigint
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id uuid;
  v_total_count bigint;
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

  -- Get total count first (for pagination metadata)
  SELECT COUNT(*) INTO v_total_count
  FROM organization_members om
  JOIN auth.users u ON u.id = om.user_id
  LEFT JOIN profiles p ON p.id = om.user_id
  WHERE om.organization_id = p_organization_id
    AND (
      p_search IS NULL
      OR p.full_name ILIKE '%' || p_search || '%'
      OR u.email ILIKE '%' || p_search || '%'
    );

  -- Return paginated results with total count
  RETURN QUERY
  SELECT
    om.user_id,
    u.email::text,
    p.full_name,
    p.avatar_url,
    om.role::text,
    om.is_active,
    om.joined_at,
    COALESCE(inviter_profile.full_name, inviter_user.email)::text as invited_by_name,
    v_total_count as total_count
  FROM organization_members om
  JOIN auth.users u ON u.id = om.user_id
  LEFT JOIN profiles p ON p.id = om.user_id
  LEFT JOIN auth.users inviter_user ON inviter_user.id = om.invited_by
  LEFT JOIN profiles inviter_profile ON inviter_profile.id = om.invited_by
  WHERE om.organization_id = p_organization_id
    AND (
      p_search IS NULL
      OR p.full_name ILIKE '%' || p_search || '%'
      OR u.email ILIKE '%' || p_search || '%'
    )
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
    COALESCE(p.full_name, u.email)
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

COMMENT ON FUNCTION user_get_org_members_paginated IS
'Returns paginated members of an organization with server-side search.
Requires user to be a member of the organization.
Parameters:
  - p_organization_id: Organization UUID
  - p_app_id: App ID for context (optional, for consistency)
  - p_search: Optional search term (ILIKE on full_name or email)
  - p_limit: Number of results per page (default 10)
  - p_offset: Offset for pagination (default 0)
Returns total_count in each row for pagination UI.
Returns invited_by_name (inviter full_name or email) for audit display.';
