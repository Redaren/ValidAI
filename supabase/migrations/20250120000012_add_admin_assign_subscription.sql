-- Migration: Add admin_assign_subscription function
-- Purpose: Allow admins to assign app subscriptions without triggering RLS recursion
-- Created: 2025-01-20
-- Issue: INSERT via PostgREST has no policy (admin-only by design) and would trigger recursion if evaluated

-- =====================================================
-- ADMIN: ASSIGN SUBSCRIPTION TO ORGANIZATION
-- =====================================================

CREATE OR REPLACE FUNCTION admin_assign_subscription(
  p_organization_id uuid,
  p_app_id text,
  p_tier_id uuid,
  p_tier_name text,
  p_notes text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  organization_id uuid,
  app_id text,
  tier_id uuid,
  tier_name text,
  status text,
  billing_period_start timestamptz,
  billing_period_end timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  notes text
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- Authorization: Only Playze admins can assign subscriptions
  IF NOT is_playze_admin() THEN
    RAISE EXCEPTION 'Only Playze administrators can assign subscriptions';
  END IF;

  -- Insert subscription and return the created row
  RETURN QUERY
  INSERT INTO organization_app_subscriptions (
    organization_id,
    app_id,
    tier_id,
    tier_name,
    status,
    notes
  )
  VALUES (
    p_organization_id,
    p_app_id,
    p_tier_id,
    p_tier_name,
    'active',
    p_notes
  )
  RETURNING
    organization_app_subscriptions.id,
    organization_app_subscriptions.organization_id,
    organization_app_subscriptions.app_id,
    organization_app_subscriptions.tier_id,
    organization_app_subscriptions.tier_name,
    organization_app_subscriptions.status,
    organization_app_subscriptions.billing_period_start,
    organization_app_subscriptions.billing_period_end,
    organization_app_subscriptions.created_at,
    organization_app_subscriptions.updated_at,
    organization_app_subscriptions.notes;
END;
$$;

COMMENT ON FUNCTION admin_assign_subscription IS
'Admin-only function to assign app subscription to organization. Bypasses RLS to avoid infinite recursion. Called by Admin Portal.';

-- Grant execute permission to authenticated users
-- (Function itself checks is_playze_admin())
GRANT EXECUTE ON FUNCTION admin_assign_subscription(uuid, text, uuid, text, text) TO authenticated;
