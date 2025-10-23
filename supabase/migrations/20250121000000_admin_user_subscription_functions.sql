-- Migration: Admin User and Subscription Management Functions
-- Purpose: Provide SECURITY DEFINER functions for Phase 5D (User Management) and Phase 5E (Subscription Management)
-- Created: 2025-01-21
-- Pattern: Admin Portal uses 100% admin functions (NO PostgREST) for god-mode access

-- =====================================================
-- CONTEXT & RATIONALE
-- =====================================================
-- PLAYZE ADMIN users need god-mode access to:
-- - ALL users (not just users in organizations they belong to)
-- - ALL organization memberships (across all organizations)
-- - ALL user preferences (not just their own)
-- - ALL subscriptions (across all organizations)
--
-- RLS policies restrict regular users to their own data/organizations.
-- Admin Portal must bypass RLS entirely using SECURITY DEFINER functions.
--
-- Pattern Reference: docs/playze-core-architecture-elevated-access.md

-- =====================================================
-- PHASE 5D: USER MANAGEMENT FUNCTIONS
-- =====================================================

-- -----------------------------------------------------
-- 1. ADMIN: LIST ALL USERS
-- -----------------------------------------------------

CREATE OR REPLACE FUNCTION admin_list_all_users()
RETURNS TABLE (
  id uuid,
  email varchar,
  full_name text,
  avatar_url text,
  created_at timestamptz,
  updated_at timestamptz,
  organization_count bigint
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- Authorization: Only Playze admins can list all users
  IF NOT is_playze_admin() THEN
    RAISE EXCEPTION 'Only Playze administrators can list all users';
  END IF;

  -- Bypass RLS and return all users with organization counts
  RETURN QUERY
  SELECT
    p.id,
    au.email,
    p.full_name,
    p.avatar_url,
    p.created_at,
    p.updated_at,
    COALESCE(COUNT(om.organization_id), 0)::bigint as organization_count
  FROM profiles p
  LEFT JOIN auth.users au ON au.id = p.id
  LEFT JOIN organization_members om ON om.user_id = p.id
  GROUP BY p.id, au.email, p.full_name, p.avatar_url, p.created_at, p.updated_at
  ORDER BY p.created_at DESC;
END;
$$;

COMMENT ON FUNCTION admin_list_all_users IS
'Admin-only function to list ALL users with organization counts. Bypasses RLS. Used by Admin Portal Phase 5D.';

-- -----------------------------------------------------
-- 2. ADMIN: GET SINGLE USER
-- -----------------------------------------------------

CREATE OR REPLACE FUNCTION admin_get_user(p_user_id uuid)
RETURNS TABLE (
  id uuid,
  email varchar,
  full_name text,
  avatar_url text,
  created_at timestamptz,
  updated_at timestamptz,
  organization_count bigint
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- Authorization
  IF NOT is_playze_admin() THEN
    RAISE EXCEPTION 'Only Playze administrators can view user details';
  END IF;

  -- Return single user with metadata
  RETURN QUERY
  SELECT
    p.id,
    au.email,
    p.full_name,
    p.avatar_url,
    p.created_at,
    p.updated_at,
    COALESCE(COUNT(om.organization_id), 0)::bigint as organization_count
  FROM profiles p
  LEFT JOIN auth.users au ON au.id = p.id
  LEFT JOIN organization_members om ON om.user_id = p.id
  WHERE p.id = p_user_id
  GROUP BY p.id, au.email, p.full_name, p.avatar_url, p.created_at, p.updated_at;
END;
$$;

COMMENT ON FUNCTION admin_get_user IS
'Admin-only function to get single user with metadata. Bypasses RLS.';

-- -----------------------------------------------------
-- 3. ADMIN: LIST USER MEMBERSHIPS
-- -----------------------------------------------------

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
'Admin-only function to list ALL memberships for a user across ALL organizations. Bypasses RLS.';

-- -----------------------------------------------------
-- 4. ADMIN: GET USER PREFERENCES
-- -----------------------------------------------------

CREATE OR REPLACE FUNCTION admin_get_user_preferences(p_user_id uuid)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  theme text,
  language text,
  timezone text,
  email_notifications boolean,
  push_notifications boolean,
  created_at timestamptz,
  updated_at timestamptz
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- Authorization
  IF NOT is_playze_admin() THEN
    RAISE EXCEPTION 'Only Playze administrators can view user preferences';
  END IF;

  -- Return preferences for any user (bypasses user_id = auth.uid() RLS check)
  RETURN QUERY
  SELECT
    up.id,
    up.user_id,
    up.theme,
    up.language,
    up.timezone,
    up.email_notifications,
    up.push_notifications,
    up.created_at,
    up.updated_at
  FROM user_preferences up
  WHERE up.user_id = p_user_id;
END;
$$;

COMMENT ON FUNCTION admin_get_user_preferences IS
'Admin-only function to get preferences for ANY user. Bypasses RLS (user_id = auth.uid() check).';

-- =====================================================
-- PHASE 5E: SUBSCRIPTION MANAGEMENT FUNCTIONS
-- =====================================================

-- -----------------------------------------------------
-- 5. ADMIN: LIST ALL SUBSCRIPTIONS
-- -----------------------------------------------------

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
'Admin-only function to list ALL subscriptions across ALL organizations. Bypasses RLS. Used by Admin Portal Phase 5E.';

-- -----------------------------------------------------
-- 6. ADMIN: UPDATE SUBSCRIPTION TIER
-- -----------------------------------------------------

CREATE OR REPLACE FUNCTION admin_update_subscription_tier(
  subscription_id uuid,
  new_tier_id uuid,
  new_tier_name text,
  admin_notes text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  organization_id uuid,
  app_id text,
  tier_id uuid,
  tier_name text,
  status text,
  notes text,
  updated_at timestamptz
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- Authorization
  IF NOT is_playze_admin() THEN
    RAISE EXCEPTION 'Only Playze administrators can update subscription tiers';
  END IF;

  -- Update tier and return updated subscription
  RETURN QUERY
  UPDATE organization_app_subscriptions
  SET
    tier_id = new_tier_id,
    tier_name = new_tier_name,
    notes = CASE
      WHEN admin_notes IS NOT NULL THEN admin_notes
      ELSE organization_app_subscriptions.notes
    END,
    updated_at = now()
  WHERE organization_app_subscriptions.id = subscription_id
  RETURNING
    organization_app_subscriptions.id,
    organization_app_subscriptions.organization_id,
    organization_app_subscriptions.app_id,
    organization_app_subscriptions.tier_id,
    organization_app_subscriptions.tier_name,
    organization_app_subscriptions.status,
    organization_app_subscriptions.notes,
    organization_app_subscriptions.updated_at;
END;
$$;

COMMENT ON FUNCTION admin_update_subscription_tier IS
'Admin-only function to update subscription tier. Bypasses RLS (no UPDATE policy exists). Used by Admin Portal Phase 5E.';

-- -----------------------------------------------------
-- 7. ADMIN: CANCEL SUBSCRIPTION
-- -----------------------------------------------------

CREATE OR REPLACE FUNCTION admin_cancel_subscription(
  subscription_id uuid,
  cancellation_reason text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  organization_id uuid,
  app_id text,
  status text,
  notes text,
  updated_at timestamptz
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  cancel_note text;
BEGIN
  -- Authorization
  IF NOT is_playze_admin() THEN
    RAISE EXCEPTION 'Only Playze administrators can cancel subscriptions';
  END IF;

  -- Build cancellation note
  cancel_note := CASE
    WHEN cancellation_reason IS NOT NULL THEN 'Canceled by admin: ' || cancellation_reason
    ELSE 'Canceled by admin'
  END;

  -- Cancel subscription (soft delete - set status)
  RETURN QUERY
  UPDATE organization_app_subscriptions
  SET
    status = 'canceled',
    notes = cancel_note,
    updated_at = now()
  WHERE organization_app_subscriptions.id = subscription_id
  RETURNING
    organization_app_subscriptions.id,
    organization_app_subscriptions.organization_id,
    organization_app_subscriptions.app_id,
    organization_app_subscriptions.status,
    organization_app_subscriptions.notes,
    organization_app_subscriptions.updated_at;
END;
$$;

COMMENT ON FUNCTION admin_cancel_subscription IS
'Admin-only function to cancel subscription (soft delete). Bypasses RLS. Used by Admin Portal Phase 5E.';

-- -----------------------------------------------------
-- 8. ADMIN: LIST APP TIERS
-- -----------------------------------------------------

CREATE OR REPLACE FUNCTION admin_list_app_tiers(p_app_id text)
RETURNS TABLE (
  id uuid,
  app_id text,
  tier_name text,
  display_name text,
  description text,
  features jsonb,
  limits jsonb,
  price_monthly numeric,
  price_yearly numeric,
  is_active boolean,
  created_at timestamptz
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- Authorization
  IF NOT is_playze_admin() THEN
    RAISE EXCEPTION 'Only Playze administrators can list app tiers';
  END IF;

  -- Return tiers for specified app
  RETURN QUERY
  SELECT
    at.id,
    at.app_id,
    at.tier_name,
    at.display_name,
    at.description,
    at.features,
    at.limits,
    at.price_monthly,
    at.price_yearly,
    at.is_active,
    at.created_at
  FROM app_tiers at
  WHERE at.app_id = p_app_id
  ORDER BY
    CASE at.tier_name
      WHEN 'free' THEN 1
      WHEN 'pro' THEN 2
      WHEN 'enterprise' THEN 3
      ELSE 4
    END;
END;
$$;

COMMENT ON FUNCTION admin_list_app_tiers IS
'Admin-only function to list tiers for an app. Provides consistent admin RPC pattern. Used by Admin Portal Phase 5E.';

-- =====================================================
-- GRANT EXECUTE PERMISSIONS
-- =====================================================

-- Allow authenticated users to call these functions
-- (Functions themselves check is_playze_admin())

-- Phase 5D: User Management
GRANT EXECUTE ON FUNCTION admin_list_all_users() TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_list_user_memberships(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_user_preferences(uuid) TO authenticated;

-- Phase 5E: Subscription Management
GRANT EXECUTE ON FUNCTION admin_list_all_subscriptions() TO authenticated;
GRANT EXECUTE ON FUNCTION admin_update_subscription_tier(uuid, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_cancel_subscription(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_list_app_tiers(text) TO authenticated;

-- =====================================================
-- USAGE EXAMPLES
-- =====================================================

-- From JavaScript/TypeScript (Admin Portal):
--
-- PHASE 5D: USER MANAGEMENT
--
-- // List all users
-- const { data, error } = await supabase.rpc('admin_list_all_users')
--
-- // Get single user
-- const { data, error } = await supabase.rpc('admin_get_user', {
--   user_id: 'user-uuid'
-- })
--
-- // List user memberships
-- const { data, error } = await supabase.rpc('admin_list_user_memberships', {
--   user_id: 'user-uuid'
-- })
--
-- // Get user preferences
-- const { data, error } = await supabase.rpc('admin_get_user_preferences', {
--   user_id: 'user-uuid'
-- })
--
-- PHASE 5E: SUBSCRIPTION MANAGEMENT
--
-- // List all subscriptions
-- const { data, error } = await supabase.rpc('admin_list_all_subscriptions')
--
-- // Update subscription tier
-- const { data, error } = await supabase.rpc('admin_update_subscription_tier', {
--   subscription_id: 'sub-uuid',
--   new_tier_id: 'tier-uuid',
--   new_tier_name: 'pro',
--   admin_notes: 'Upgraded to Pro tier'
-- })
--
-- // Cancel subscription
-- const { data, error } = await supabase.rpc('admin_cancel_subscription', {
--   subscription_id: 'sub-uuid',
--   cancellation_reason: 'Organization requested cancellation'
-- })
--
-- // List app tiers
-- const { data, error } = await supabase.rpc('admin_list_app_tiers', {
--   p_app_id: 'roadcloud'
-- })
