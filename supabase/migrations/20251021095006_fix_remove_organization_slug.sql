-- Migration: Fix admin functions - Remove non-existent organization_slug field
-- Purpose: Remove references to o.slug which doesn't exist in organizations table
-- Created: 2025-10-21
-- Issue: Functions admin_list_user_memberships and admin_list_all_subscriptions
--        were incorrectly returning organization_slug field that doesn't exist

-- =====================================================
-- CONTEXT
-- =====================================================
-- The organizations table does NOT have a 'slug' column
-- (only id, name, description, is_active, created_at, updated_at)
-- Organizations are identified by UUID, not slug.
--
-- Two functions were incorrectly trying to return o.slug:
-- 1. admin_list_user_memberships
-- 2. admin_list_all_subscriptions

-- =====================================================
-- FIX 1: admin_list_user_memberships
-- =====================================================

-- Drop existing function first (required to change return type)
DROP FUNCTION IF EXISTS admin_list_user_memberships(uuid);

CREATE OR REPLACE FUNCTION admin_list_user_memberships(p_user_id uuid)
RETURNS TABLE (
  organization_id uuid,
  organization_name text,
  organization_is_active boolean,
  role text,
  joined_at timestamptz
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- Authorization
  IF NOT is_playze_admin() THEN
    RAISE EXCEPTION 'Only Playze administrators can list user memberships';
  END IF;

  -- Return all memberships for this user across ALL organizations
  RETURN QUERY
  SELECT
    o.id as organization_id,
    o.name as organization_name,
    o.is_active as organization_is_active,
    om.role,
    om.joined_at
  FROM organization_members om
  LEFT JOIN organizations o ON o.id = om.organization_id
  WHERE om.user_id = p_user_id
  ORDER BY om.joined_at DESC;
END;
$$;

COMMENT ON FUNCTION admin_list_user_memberships IS
'Admin-only function to list ALL memberships for a user across ALL organizations. Bypasses RLS. Fixed: removed non-existent organization_slug field.';

-- =====================================================
-- FIX 2: admin_list_all_subscriptions
-- =====================================================

-- Drop existing function first (required to change return type)
DROP FUNCTION IF EXISTS admin_list_all_subscriptions();

CREATE OR REPLACE FUNCTION admin_list_all_subscriptions()
RETURNS TABLE (
  id uuid,
  organization_id uuid,
  organization_name text,
  app_id text,
  app_name text,
  app_description text,
  tier_id uuid,
  tier_name text,
  tier_display_name text,
  tier_features jsonb,
  tier_limits jsonb,
  status text,
  billing_period_start timestamptz,
  billing_period_end timestamptz,
  assigned_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  notes text
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- Authorization
  IF NOT is_playze_admin() THEN
    RAISE EXCEPTION 'Only Playze administrators can list all subscriptions';
  END IF;

  -- Return ALL subscriptions across ALL organizations with full details
  RETURN QUERY
  SELECT
    oas.id,
    oas.organization_id,
    o.name as organization_name,
    oas.app_id,
    a.name as app_name,
    a.description as app_description,
    oas.tier_id,
    oas.tier_name,
    at.display_name as tier_display_name,
    at.features as tier_features,
    at.limits as tier_limits,
    oas.status,
    oas.billing_period_start,
    oas.billing_period_end,
    oas.assigned_at,
    oas.created_at,
    oas.updated_at,
    oas.notes
  FROM organization_app_subscriptions oas
  LEFT JOIN organizations o ON o.id = oas.organization_id
  LEFT JOIN apps a ON a.id = oas.app_id
  LEFT JOIN app_tiers at ON at.id = oas.tier_id
  ORDER BY oas.assigned_at DESC;
END;
$$;

COMMENT ON FUNCTION admin_list_all_subscriptions IS
'Admin-only function to list ALL subscriptions across ALL organizations. Bypasses RLS. Fixed: removed non-existent organization_slug field.';
