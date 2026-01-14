-- Migration: Fix RLS and function security issues
-- Description: Enable RLS on app_role_permissions and fix function search_path for 17 functions
-- Date: 2025-12-22
-- Issue: Supabase security linter flagged missing RLS and mutable search_path

-- =============================================================================
-- 1. CRITICAL: Enable RLS on app_role_permissions
-- =============================================================================

ALTER TABLE app_role_permissions ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read (configuration is public knowledge)
CREATE POLICY "Authenticated users can view role permissions"
  ON app_role_permissions FOR SELECT
  TO authenticated
  USING (true);

-- Only platform admins can modify
CREATE POLICY "Only platform admins can insert role permissions"
  ON app_role_permissions FOR INSERT
  TO authenticated
  WITH CHECK (is_playze_admin());

CREATE POLICY "Only platform admins can update role permissions"
  ON app_role_permissions FOR UPDATE
  TO authenticated
  USING (is_playze_admin())
  WITH CHECK (is_playze_admin());

CREATE POLICY "Only platform admins can delete role permissions"
  ON app_role_permissions FOR DELETE
  TO authenticated
  USING (is_playze_admin());

-- =============================================================================
-- 2. HIGH: Fix function search_path for security
-- =============================================================================

-- update_updated_at_column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path TO 'public';

-- user_organization_id
CREATE OR REPLACE FUNCTION user_organization_id()
RETURNS uuid AS $$
BEGIN
  RETURN (auth.jwt() -> 'app_metadata' ->> 'organization_id')::uuid;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public';

-- user_role_in_org
CREATE OR REPLACE FUNCTION user_role_in_org(org_id uuid)
RETURNS text AS $$
DECLARE
  user_role text;
BEGIN
  SELECT role INTO user_role
  FROM organization_members
  WHERE organization_id = org_id
    AND user_id = auth.uid();
  RETURN user_role;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public';

-- get_user_organizations
CREATE OR REPLACE FUNCTION get_user_organizations()
RETURNS TABLE(
  organization_id uuid,
  organization_name text,
  organization_description text,
  user_role text,
  joined_at timestamptz,
  is_active boolean
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    o.id,
    o.name,
    o.description,
    om.role,
    om.joined_at,
    o.is_active
  FROM organizations o
  JOIN organization_members om ON om.organization_id = o.id
  WHERE om.user_id = auth.uid()
  ORDER BY o.name;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public';

-- increment_app_usage
CREATE OR REPLACE FUNCTION increment_app_usage(
  org_id uuid,
  app_id text,
  usage_type text,
  increment_by numeric DEFAULT 1
)
RETURNS void AS $$
DECLARE
  sub_id uuid;
  period_start timestamptz := date_trunc('month', now());
  period_end timestamptz := date_trunc('month', now()) + interval '1 month';
BEGIN
  SELECT id INTO sub_id
  FROM organization_app_subscriptions
  WHERE organization_id = org_id
    AND organization_app_subscriptions.app_id = increment_app_usage.app_id
    AND status = 'active';

  IF sub_id IS NULL THEN
    RAISE EXCEPTION 'No active subscription for app: %', app_id;
  END IF;

  INSERT INTO organization_app_usage (
    subscription_id, organization_id, app_id, usage_type, quantity, period_start, period_end
  )
  VALUES (sub_id, org_id, increment_app_usage.app_id, increment_app_usage.usage_type, increment_by, period_start, period_end)
  ON CONFLICT (subscription_id, usage_type, period_start, period_end)
  DO UPDATE SET quantity = organization_app_usage.quantity + increment_by, updated_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

-- is_playze_admin
CREATE OR REPLACE FUNCTION is_playze_admin()
RETURNS boolean AS $$
DECLARE
  current_email text;
  admin_exists boolean;
BEGIN
  current_email := auth.email();
  SELECT EXISTS (SELECT 1 FROM admin_users WHERE email = current_email) INTO admin_exists;
  RETURN admin_exists;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public';

-- update_organization_member_role
CREATE OR REPLACE FUNCTION update_organization_member_role(org_id uuid, target_user_id uuid, new_role text)
RETURNS TABLE(success boolean, message text) AS $$
DECLARE
  caller_role text;
  current_role text;
  owner_count integer;
BEGIN
  IF new_role NOT IN ('owner', 'admin', 'member', 'viewer') THEN
    RETURN QUERY SELECT false, 'Invalid role: ' || new_role;
    RETURN;
  END IF;

  SELECT role INTO caller_role
  FROM organization_members
  WHERE organization_id = org_id AND user_id = auth.uid();

  IF caller_role NOT IN ('owner', 'admin') THEN
    RETURN QUERY SELECT false, 'Permission denied: Admin role required';
    RETURN;
  END IF;

  SELECT role INTO current_role
  FROM organization_members
  WHERE organization_id = org_id AND user_id = target_user_id;

  IF current_role IS NULL THEN
    RETURN QUERY SELECT false, 'User is not a member of this organization';
    RETURN;
  END IF;

  IF current_role = 'owner' AND new_role != 'owner' THEN
    SELECT COUNT(*) INTO owner_count
    FROM organization_members
    WHERE organization_id = org_id AND role = 'owner';

    IF owner_count <= 1 THEN
      RETURN QUERY SELECT false, 'Cannot demote last owner';
      RETURN;
    END IF;
  END IF;

  UPDATE organization_members SET role = new_role
  WHERE organization_id = org_id AND user_id = target_user_id;

  RETURN QUERY SELECT true, 'Role updated successfully';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

-- remove_organization_member
CREATE OR REPLACE FUNCTION remove_organization_member(org_id uuid, target_user_id uuid)
RETURNS TABLE(success boolean, message text) AS $$
DECLARE
  caller_role text;
  target_role text;
  owner_count integer;
BEGIN
  SELECT role INTO caller_role
  FROM organization_members
  WHERE organization_id = org_id AND user_id = auth.uid();

  IF caller_role NOT IN ('owner', 'admin') THEN
    RETURN QUERY SELECT false, 'Permission denied: Admin role required';
    RETURN;
  END IF;

  SELECT role INTO target_role
  FROM organization_members
  WHERE organization_id = org_id AND user_id = target_user_id;

  IF target_role IS NULL THEN
    RETURN QUERY SELECT false, 'User is not a member of this organization';
    RETURN;
  END IF;

  IF target_role = 'owner' THEN
    SELECT COUNT(*) INTO owner_count
    FROM organization_members
    WHERE organization_id = org_id AND role = 'owner';

    IF owner_count <= 1 THEN
      RETURN QUERY SELECT false, 'Cannot remove last owner';
      RETURN;
    END IF;
  END IF;

  IF target_user_id = auth.uid() THEN
    RETURN QUERY SELECT false, 'Cannot remove yourself from organization';
    RETURN;
  END IF;

  DELETE FROM organization_members
  WHERE organization_id = org_id AND user_id = target_user_id;

  RETURN QUERY SELECT true, 'Member removed successfully';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

-- get_current_organization
CREATE OR REPLACE FUNCTION get_current_organization()
RETURNS TABLE(
  id uuid, name text, description text, is_active boolean,
  created_at timestamptz, updated_at timestamptz
) AS $$
DECLARE
  current_org_id uuid;
BEGIN
  current_org_id := (auth.jwt() -> 'app_metadata' ->> 'organization_id')::uuid;

  IF current_org_id IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_id = current_org_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied: User is not a member of organization specified in JWT';
  END IF;

  RETURN QUERY
  SELECT o.id, o.name, o.description, o.is_active, o.created_at, o.updated_at
  FROM organizations o
  WHERE o.id = current_org_id;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public';

-- get_organization_apps
CREATE OR REPLACE FUNCTION get_organization_apps(org_id uuid DEFAULT NULL)
RETURNS TABLE(
  app_id text, app_name text, app_description text, app_url text,
  tier_name text, tier_display_name text, status text,
  features jsonb, limits jsonb, current_usage jsonb
) AS $$
DECLARE
  target_org_id uuid;
BEGIN
  target_org_id := COALESCE(org_id, user_organization_id());

  IF NOT EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_id = target_org_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied: Not a member of this organization';
  END IF;

  RETURN QUERY
  SELECT
    a.id, a.name, a.description, a.app_url,
    oas.tier_name, at.display_name, oas.status,
    at.features, at.limits,
    COALESCE(
      (SELECT jsonb_object_agg(oau.usage_type, oau.quantity)
       FROM organization_app_usage oau
       WHERE oau.subscription_id = oas.id
         AND oau.period_start >= date_trunc('month', now())
         AND oau.period_end <= date_trunc('month', now()) + interval '1 month'),
      '{}'::jsonb
    ) AS current_usage
  FROM organization_app_subscriptions oas
  JOIN apps a ON a.id = oas.app_id
  JOIN app_tiers at ON at.id = oas.tier_id
  WHERE oas.organization_id = target_org_id
    AND oas.status = 'active'
    AND a.is_active = true
  ORDER BY a.name;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public';

-- get_user_apps_with_admin
CREATE OR REPLACE FUNCTION get_user_apps_with_admin()
RETURNS TABLE(
  app_id text, app_name text, app_description text, app_url text,
  tier_name text, tier_display_name text, status text,
  features jsonb, limits jsonb, current_usage jsonb, is_platform_app boolean
) AS $$
BEGIN
  RETURN QUERY
  SELECT goa.app_id, goa.app_name, goa.app_description, goa.app_url,
    goa.tier_name, goa.tier_display_name, goa.status,
    goa.features, goa.limits, goa.current_usage, false as is_platform_app
  FROM get_organization_apps() goa;

  IF is_playze_admin() THEN
    RETURN QUERY
    SELECT 'admin'::text, 'Admin Portal'::text, 'Platform administration interface'::text,
      'http://localhost:3001'::text, 'platform'::text, 'Platform Admin'::text,
      'active'::text, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, true;
  END IF;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public';

-- has_app_access
CREATE OR REPLACE FUNCTION has_app_access(app_name text)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM organization_app_subscriptions
    WHERE organization_id = user_organization_id()
      AND app_id = app_name
      AND status = 'active'
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public';

-- is_org_admin
CREATE OR REPLACE FUNCTION is_org_admin()
RETURNS boolean AS $$
DECLARE
  user_role text;
BEGIN
  SELECT role INTO user_role
  FROM organization_members
  WHERE organization_id = user_organization_id()
    AND user_id = auth.uid();
  RETURN user_role IN ('owner', 'admin');
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public';

-- role_permissions_for_role
CREATE OR REPLACE FUNCTION role_permissions_for_role(p_app_id text, p_role text)
RETURNS jsonb AS $$
BEGIN
  IF p_role IN ('owner', 'admin') THEN
    RETURN jsonb_build_object(
      'can_edit', true, 'can_delete', true, 'can_export', true,
      'can_invite', true, 'can_manage_members', true, 'can_manage_settings', true
    );
  END IF;

  IF p_role = 'member' THEN
    RETURN jsonb_build_object(
      'can_edit', true, 'can_delete', false, 'can_export', false,
      'can_invite', false, 'can_manage_members', false, 'can_manage_settings', false
    );
  END IF;

  IF p_role = 'viewer' THEN
    RETURN jsonb_build_object(
      'can_edit', false, 'can_delete', false, 'can_export', false,
      'can_invite', false, 'can_manage_members', false, 'can_manage_settings', false
    );
  END IF;

  RETURN '{}'::jsonb;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public';

-- get_user_authorization
CREATE OR REPLACE FUNCTION get_user_authorization(p_org_id uuid DEFAULT NULL, p_app_id text DEFAULT NULL)
RETURNS TABLE(
  organization_id uuid, organization_name text, user_role text, app_id text,
  app_name text, app_description text, tier_name text, tier_display_name text,
  tier_features jsonb, role_permissions jsonb, tier_limits jsonb,
  current_usage jsonb, subscription_status text
) AS $$
DECLARE
  v_org_id uuid;
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  IF p_app_id IS NULL THEN
    RAISE EXCEPTION 'app_id is required';
  END IF;

  v_org_id := COALESCE(p_org_id, user_organization_id());

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'No organization context available';
  END IF;

  RETURN QUERY
  SELECT
    o.id, o.name, COALESCE(om.role, 'viewer'), a.id, a.name, a.description,
    COALESCE(sub.tier_name, 'free'), COALESCE(at.display_name, 'Free'),
    COALESCE(at.features, '{}'::jsonb),
    role_permissions_for_role(a.id, COALESCE(om.role, 'viewer')),
    COALESCE(at.limits, '{}'::jsonb), '{}'::jsonb,
    COALESCE(sub.status, 'inactive')
  FROM organizations o
  CROSS JOIN apps a
  LEFT JOIN organization_members om ON om.organization_id = o.id AND om.user_id = v_user_id
  LEFT JOIN organization_app_subscriptions sub ON sub.organization_id = o.id AND sub.app_id = a.id
  LEFT JOIN app_tiers at ON at.id = sub.tier_id
  WHERE o.id = v_org_id AND a.id = p_app_id AND a.is_active = true
  LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public';

-- check_org_feature_access
CREATE OR REPLACE FUNCTION check_org_feature_access(org_id uuid, app_id text, feature_name text)
RETURNS boolean AS $$
DECLARE
  has_access boolean;
BEGIN
  SELECT (at.features ->> feature_name)::boolean INTO has_access
  FROM organization_app_subscriptions oas
  JOIN app_tiers at ON at.id = oas.tier_id
  WHERE oas.organization_id = org_id
    AND oas.app_id = check_org_feature_access.app_id
    AND oas.status = 'active';

  RETURN COALESCE(has_access, false);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public';

-- get_billing_usage_summary (if exists - recreate with search_path)
-- Note: This function may not exist in the database. If so, this will create it.
CREATE OR REPLACE FUNCTION get_billing_usage_summary(org_id uuid, app_id text)
RETURNS TABLE(
  usage_type text,
  quantity numeric,
  period_start timestamptz,
  period_end timestamptz
) AS $$
BEGIN
  -- Verify user has access to this organization
  IF NOT EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_id = org_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied: Not a member of this organization';
  END IF;

  RETURN QUERY
  SELECT
    oau.usage_type,
    oau.quantity,
    oau.period_start,
    oau.period_end
  FROM organization_app_usage oau
  JOIN organization_app_subscriptions oas ON oas.id = oau.subscription_id
  WHERE oau.organization_id = org_id
    AND oau.app_id = get_billing_usage_summary.app_id
    AND oau.period_start >= date_trunc('month', now())
  ORDER BY oau.usage_type;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public';

-- get_billing_usage_summary (3 args version - original function)
CREATE OR REPLACE FUNCTION get_billing_usage_summary(org_id uuid, period_start timestamptz, period_end timestamptz)
RETURNS TABLE(
  app_id text,
  app_name text,
  tier_name text,
  tier_display_name text,
  tier_price numeric,
  usage_items jsonb,
  total_amount numeric
) AS $$
DECLARE
  caller_role text;
BEGIN
  SELECT role INTO caller_role
  FROM organization_members
  WHERE organization_id = org_id
    AND user_id = auth.uid();

  IF caller_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Permission denied: Owner/Admin role required';
  END IF;

  RETURN QUERY
  SELECT
    oas.app_id,
    a.name AS app_name,
    oas.tier_name,
    at.display_name AS tier_display_name,
    at.price_monthly AS tier_price,
    COALESCE(
      (SELECT jsonb_object_agg(oau.usage_type, oau.quantity)
       FROM organization_app_usage oau
       WHERE oau.subscription_id = oas.id
         AND oau.period_start >= get_billing_usage_summary.period_start
         AND oau.period_end <= get_billing_usage_summary.period_end),
      '{}'::jsonb
    ) AS usage_items,
    COALESCE(at.price_monthly, 0) AS total_amount
  FROM organization_app_subscriptions oas
  JOIN apps a ON a.id = oas.app_id
  JOIN app_tiers at ON at.id = oas.tier_id
  WHERE oas.organization_id = org_id
    AND oas.status = 'active'
  ORDER BY a.name;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public';
