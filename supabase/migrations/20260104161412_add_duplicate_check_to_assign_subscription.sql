-- Migration: Add duplicate check to admin_assign_subscription function
-- Purpose: Provide clear error message when attempting to assign duplicate subscription
-- instead of relying on database constraint violation
-- Created: 2026-01-04

-- =====================================================
-- UPDATE: ADMIN ASSIGN SUBSCRIPTION WITH DUPLICATE CHECK
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

  -- Check for existing subscription (any status - active, canceled, etc.)
  -- This provides a clear error message instead of a generic constraint violation
  IF EXISTS (
    SELECT 1 FROM organization_app_subscriptions s
    WHERE s.organization_id = p_organization_id AND s.app_id = p_app_id
  ) THEN
    RAISE EXCEPTION 'Organization already has a subscription for this app. Use "Update Tier" or "Activate" instead of assigning a new subscription.';
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
'Admin-only function to assign app subscription to organization. Includes duplicate check for clear error messages. Bypasses RLS to avoid infinite recursion. Called by Admin Portal.';
