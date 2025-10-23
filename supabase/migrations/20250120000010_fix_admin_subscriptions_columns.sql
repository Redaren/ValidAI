-- Migration: Fix column names in admin_list_organization_subscriptions
-- Purpose: Use correct column names from organization_app_subscriptions table
-- Created: 2025-01-20
-- Issue: PostgREST error 42703 - column oas.current_period_start does not exist
-- Actual columns: billing_period_start, billing_period_end (not current_period_*)

-- Drop existing function first (can't change return type with CREATE OR REPLACE)
DROP FUNCTION IF EXISTS admin_list_organization_subscriptions(uuid);

-- Recreate with correct column names and types
CREATE FUNCTION admin_list_organization_subscriptions(org_id uuid)
RETURNS TABLE (
  id uuid,
  organization_id uuid,
  app_id text,
  tier_id uuid,  -- Changed from text to uuid
  tier_name text,
  status text,
  billing_period_start timestamptz,  -- Changed from current_period_start
  billing_period_end timestamptz,    -- Changed from current_period_end
  created_at timestamptz,
  updated_at timestamptz,
  notes text,
  -- App info
  app_name text,
  app_description text,
  -- Tier info
  tier_display_name text,
  tier_features jsonb,
  tier_limits jsonb
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- Authorization
  IF NOT is_playze_admin() THEN
    RAISE EXCEPTION 'Only Playze administrators can list organization subscriptions';
  END IF;

  -- Return subscriptions with app and tier details
  RETURN QUERY
  SELECT
    oas.id,
    oas.organization_id,
    oas.app_id,
    oas.tier_id,
    oas.tier_name,
    oas.status,
    oas.billing_period_start,  -- Changed from current_period_start
    oas.billing_period_end,    -- Changed from current_period_end
    oas.created_at,
    oas.updated_at,
    oas.notes,
    -- App details
    a.name as app_name,
    a.description as app_description,
    -- Tier details
    at.display_name as tier_display_name,
    at.features as tier_features,
    at.limits as tier_limits
  FROM organization_app_subscriptions oas
  LEFT JOIN apps a ON a.id = oas.app_id
  LEFT JOIN app_tiers at ON at.id = oas.tier_id
  WHERE oas.organization_id = org_id
  ORDER BY oas.created_at DESC;
END;
$$;

COMMENT ON FUNCTION admin_list_organization_subscriptions IS
'Admin-only function to list subscriptions for an organization with app and tier details. Uses billing_period_start/end columns. Bypasses RLS.';
