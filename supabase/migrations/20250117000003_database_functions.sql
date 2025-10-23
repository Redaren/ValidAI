-- =============================================================================
-- PLAYZE CORE - PHASE 2: DATABASE FUNCTIONS
-- =============================================================================
-- Description: Business logic functions for complex queries
-- Created: 2025-01-17
-- CRITICAL: All functions MUST use RETURNS TABLE(...), NOT JSON
-- Access: Called via PostgREST using supabase.rpc('function_name', params)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. GET USER ORGANIZATIONS
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_user_organizations()
RETURNS TABLE (
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
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION get_user_organizations() IS
'Returns all organizations the current user is a member of with their role.
Returns: TABLE with organization details and user role per org
Access: All authenticated users via PostgREST
Client usage: supabase.rpc("get_user_organizations")';

-- -----------------------------------------------------------------------------
-- 2. GET ORGANIZATION APPS
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_organization_apps(org_id uuid DEFAULT NULL)
RETURNS TABLE (
  app_id text,
  app_name text,
  app_description text,
  tier_name text,
  tier_display_name text,
  status text,
  features jsonb,
  limits jsonb,
  current_usage jsonb
) AS $$
DECLARE
  target_org_id uuid;
BEGIN
  -- Use provided org_id or fall back to current user's org
  target_org_id := COALESCE(org_id, public.user_organization_id());

  -- Verify user has access to this organization
  IF NOT EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_id = target_org_id
      AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied: Not a member of this organization';
  END IF;

  RETURN QUERY
  SELECT
    a.id,
    a.name,
    a.description,
    oas.tier_name,
    at.display_name,
    oas.status,
    at.features,
    at.limits,
    COALESCE(
      (SELECT jsonb_object_agg(usage_type, quantity)
       FROM organization_app_usage
       WHERE subscription_id = oas.id
         AND period_start >= date_trunc('month', now())
         AND period_end <= date_trunc('month', now()) + interval '1 month'),
      '{}'::jsonb
    ) AS current_usage
  FROM organization_app_subscriptions oas
  JOIN apps a ON a.id = oas.app_id
  JOIN app_tiers at ON at.id = oas.tier_id
  WHERE oas.organization_id = target_org_id
    AND oas.status = 'active'
  ORDER BY a.name;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION get_organization_apps(uuid) IS
'Returns organization''s app subscriptions with features, limits, and current usage.
Parameters:
  org_id - Organization UUID (optional, defaults to current user''s org)
Returns: TABLE with app details, tier info, and usage metrics
Access: Organization members via PostgREST
Client usage: supabase.rpc("get_organization_apps", { org_id: "..." })';

-- -----------------------------------------------------------------------------
-- 3. CHECK ORG FEATURE ACCESS
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION check_org_feature_access(
  org_id uuid,
  app_id text,
  feature_name text
)
RETURNS boolean AS $$
DECLARE
  has_access boolean;
BEGIN
  -- Check if feature exists and is enabled for org's tier
  -- Qualify all parameters with function name to avoid ambiguity with app_tiers.app_id column
  SELECT (at.features ->> check_org_feature_access.feature_name)::boolean INTO has_access
  FROM organization_app_subscriptions oas
  JOIN app_tiers at ON at.id = oas.tier_id
  WHERE oas.organization_id = check_org_feature_access.org_id
    AND oas.app_id = check_org_feature_access.app_id
    AND oas.status = 'active';

  -- Return false if subscription not found or feature not enabled
  RETURN COALESCE(has_access, false);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION check_org_feature_access(uuid, text, text) IS
'Checks if organization has access to a specific feature based on tier.
Parameters:
  org_id - Organization UUID
  app_id - App ID (e.g., "roadcloud")
  feature_name - Feature key from tier.features JSONB
Returns: true if feature enabled, false otherwise
Access: All authenticated users via PostgREST
Client usage: supabase.rpc("check_org_feature_access", { org_id, app_id, feature_name })';

-- -----------------------------------------------------------------------------
-- 4. INCREMENT APP USAGE
-- -----------------------------------------------------------------------------

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
  -- Get active subscription ID
  SELECT id INTO sub_id
  FROM organization_app_subscriptions
  WHERE organization_id = org_id
    AND organization_app_subscriptions.app_id = increment_app_usage.app_id
    AND status = 'active';

  IF sub_id IS NULL THEN
    RAISE EXCEPTION 'No active subscription for app: %', app_id;
  END IF;

  -- Insert or update usage record atomically
  INSERT INTO organization_app_usage (
    subscription_id,
    organization_id,
    app_id,
    usage_type,
    quantity,
    period_start,
    period_end
  )
  VALUES (
    sub_id,
    org_id,
    increment_app_usage.app_id,
    increment_app_usage.usage_type,
    increment_by,
    period_start,
    period_end
  )
  ON CONFLICT (subscription_id, usage_type, period_start, period_end)
  DO UPDATE SET
    quantity = organization_app_usage.quantity + increment_by,
    updated_at = now();
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;

COMMENT ON FUNCTION increment_app_usage(uuid, text, text, numeric) IS
'Atomically increments usage counter for billing tracking.
Parameters:
  org_id - Organization UUID
  app_id - App ID
  usage_type - Type of usage (e.g., "roads_created")
  increment_by - Amount to increment (default 1)
Returns: void (updates usage table)
Access: Apps via PostgREST (RLS ensures user in org)
Client usage: supabase.rpc("increment_app_usage", { org_id, app_id, usage_type, increment_by })';

-- -----------------------------------------------------------------------------
-- 5. UPDATE ORGANIZATION MEMBER ROLE
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION update_organization_member_role(
  org_id uuid,
  target_user_id uuid,
  new_role text
)
RETURNS TABLE (
  success boolean,
  message text
) AS $$
DECLARE
  caller_role text;
  current_role text;
  owner_count integer;
BEGIN
  -- Validate new role
  IF new_role NOT IN ('owner', 'admin', 'member', 'viewer') THEN
    RETURN QUERY SELECT false, 'Invalid role: ' || new_role;
    RETURN;
  END IF;

  -- Get caller's role
  SELECT role INTO caller_role
  FROM organization_members
  WHERE organization_id = org_id
    AND user_id = auth.uid();

  -- Check caller has permission (must be owner or admin)
  IF caller_role NOT IN ('owner', 'admin') THEN
    RETURN QUERY SELECT false, 'Permission denied: Admin role required';
    RETURN;
  END IF;

  -- Get target user's current role
  SELECT role INTO current_role
  FROM organization_members
  WHERE organization_id = org_id
    AND user_id = target_user_id;

  IF current_role IS NULL THEN
    RETURN QUERY SELECT false, 'User is not a member of this organization';
    RETURN;
  END IF;

  -- Prevent demoting last owner
  IF current_role = 'owner' AND new_role != 'owner' THEN
    SELECT COUNT(*) INTO owner_count
    FROM organization_members
    WHERE organization_id = org_id
      AND role = 'owner';

    IF owner_count <= 1 THEN
      RETURN QUERY SELECT false, 'Cannot demote last owner';
      RETURN;
    END IF;
  END IF;

  -- Update role
  UPDATE organization_members
  SET role = new_role
  WHERE organization_id = org_id
    AND user_id = target_user_id;

  RETURN QUERY SELECT true, 'Role updated successfully';
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;

COMMENT ON FUNCTION update_organization_member_role(uuid, uuid, text) IS
'Updates member role with validation (admin-only, prevents demoting last owner).
Parameters:
  org_id - Organization UUID
  target_user_id - User ID to update
  new_role - New role (owner/admin/member/viewer)
Returns: TABLE(success boolean, message text)
Access: Organization admins via PostgREST
Client usage: supabase.rpc("update_organization_member_role", { org_id, target_user_id, new_role })';

-- -----------------------------------------------------------------------------
-- 6. REMOVE ORGANIZATION MEMBER
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION remove_organization_member(
  org_id uuid,
  target_user_id uuid
)
RETURNS TABLE (
  success boolean,
  message text
) AS $$
DECLARE
  caller_role text;
  target_role text;
  owner_count integer;
BEGIN
  -- Get caller's role
  SELECT role INTO caller_role
  FROM organization_members
  WHERE organization_id = org_id
    AND user_id = auth.uid();

  -- Check caller has permission
  IF caller_role NOT IN ('owner', 'admin') THEN
    RETURN QUERY SELECT false, 'Permission denied: Admin role required';
    RETURN;
  END IF;

  -- Get target user's role
  SELECT role INTO target_role
  FROM organization_members
  WHERE organization_id = org_id
    AND user_id = target_user_id;

  IF target_role IS NULL THEN
    RETURN QUERY SELECT false, 'User is not a member of this organization';
    RETURN;
  END IF;

  -- Prevent removing last owner
  IF target_role = 'owner' THEN
    SELECT COUNT(*) INTO owner_count
    FROM organization_members
    WHERE organization_id = org_id
      AND role = 'owner';

    IF owner_count <= 1 THEN
      RETURN QUERY SELECT false, 'Cannot remove last owner';
      RETURN;
    END IF;
  END IF;

  -- Prevent removing self
  IF target_user_id = auth.uid() THEN
    RETURN QUERY SELECT false, 'Cannot remove yourself from organization';
    RETURN;
  END IF;

  -- Remove member
  DELETE FROM organization_members
  WHERE organization_id = org_id
    AND user_id = target_user_id;

  RETURN QUERY SELECT true, 'Member removed successfully';
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;

COMMENT ON FUNCTION remove_organization_member(uuid, uuid) IS
'Removes member with validation (admin-only, prevents removing last owner/self).
Parameters:
  org_id - Organization UUID
  target_user_id - User ID to remove
Returns: TABLE(success boolean, message text)
Access: Organization admins via PostgREST
Client usage: supabase.rpc("remove_organization_member", { org_id, target_user_id })';

-- -----------------------------------------------------------------------------
-- 7. GET BILLING USAGE SUMMARY
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_billing_usage_summary(
  org_id uuid,
  period_start timestamptz,
  period_end timestamptz
)
RETURNS TABLE (
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
  -- Check caller has permission (owner or admin)
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
      (SELECT jsonb_object_agg(usage_type, quantity)
       FROM organization_app_usage
       WHERE subscription_id = oas.id
         AND organization_app_usage.period_start >= get_billing_usage_summary.period_start
         AND organization_app_usage.period_end <= get_billing_usage_summary.period_end),
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
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION get_billing_usage_summary(uuid, timestamptz, timestamptz) IS
'Returns billing summary for organization with usage aggregated by app.
Parameters:
  org_id - Organization UUID
  period_start - Billing period start
  period_end - Billing period end
Returns: TABLE with app subscriptions, usage, and pricing
Access: Organization owners/admins via PostgREST
Client usage: supabase.rpc("get_billing_usage_summary", { org_id, period_start, period_end })';

-- =============================================================================
-- END OF DATABASE FUNCTIONS
-- =============================================================================
