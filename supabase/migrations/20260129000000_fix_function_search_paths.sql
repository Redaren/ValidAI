-- ============================================================================
-- SECURITY FIX: Add SET search_path = '' to all 23 functions
-- This prevents search_path hijacking attacks where malicious objects
-- in earlier schemas could intercept function calls
-- ============================================================================

-- ============================================================================
-- TRIGGER FUNCTIONS (8 functions)
-- These are simple functions that don't reference tables directly
-- ============================================================================

-- 1. update_updated_at_column
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- 2. update_workbench_executions_updated_at
CREATE OR REPLACE FUNCTION public.update_workbench_executions_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- 3. update_validai_playbook_catalog_updated_at
CREATE OR REPLACE FUNCTION public.update_validai_playbook_catalog_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- 4. update_validai_galleries_updated_at
CREATE OR REPLACE FUNCTION public.update_validai_galleries_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- 5. update_validai_gallery_areas_updated_at
CREATE OR REPLACE FUNCTION public.update_validai_gallery_areas_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- 6. update_validai_gallery_area_processors_updated_at
CREATE OR REPLACE FUNCTION public.update_validai_gallery_area_processors_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- 7. update_validai_playbook_snapshots_updated_at
CREATE OR REPLACE FUNCTION public.update_validai_playbook_snapshots_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- 8. unpublish_snapshots_on_archive
CREATE OR REPLACE FUNCTION public.unpublish_snapshots_on_archive()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  -- When processor is archived, unpublish all its snapshots and remove catalog entries
  IF NEW.status = 'archived' AND OLD.status != 'archived' THEN
    -- Delete catalog entries for any published snapshots
    DELETE FROM public.validai_playbook_catalog
    WHERE snapshot_id IN (
      SELECT id FROM public.validai_playbook_snapshots
      WHERE processor_id = NEW.id AND is_published = true
    );

    -- Unpublish all snapshots
    UPDATE public.validai_playbook_snapshots
    SET
      is_published = false,
      unpublished_at = now(),
      updated_at = now()
    WHERE processor_id = NEW.id AND is_published = true;
  END IF;
  RETURN NEW;
END;
$function$;

-- ============================================================================
-- BUSINESS LOGIC FUNCTIONS (15 functions)
-- These reference tables and need public. qualification
-- ============================================================================

-- 9. is_playze_admin
CREATE OR REPLACE FUNCTION public.is_playze_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE email = auth.email()
  );
END;
$function$;

-- 10. role_permissions_for_role
CREATE OR REPLACE FUNCTION public.role_permissions_for_role(p_app_id text, p_role text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  -- Owner and Admin have full permissions
  IF p_role IN ('owner', 'admin') THEN
    RETURN jsonb_build_object(
      'can_edit', true,
      'can_delete', true,
      'can_export', true,
      'can_invite', true,
      'can_manage_members', true,
      'can_manage_settings', true
    );
  END IF;

  -- Member has edit permission only
  IF p_role = 'member' THEN
    RETURN jsonb_build_object(
      'can_edit', true,
      'can_delete', false,
      'can_export', false,
      'can_invite', false,
      'can_manage_members', false,
      'can_manage_settings', false
    );
  END IF;

  -- Viewer has read-only access
  IF p_role = 'viewer' THEN
    RETURN jsonb_build_object(
      'can_edit', false,
      'can_delete', false,
      'can_export', false,
      'can_invite', false,
      'can_manage_members', false,
      'can_manage_settings', false
    );
  END IF;

  -- Default: no permissions
  RETURN '{}'::jsonb;
END;
$function$;

-- 11. check_org_feature_access
CREATE OR REPLACE FUNCTION public.check_org_feature_access(org_id uuid, app_id text, feature_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  has_access boolean;
BEGIN
  SELECT (at.features ->> feature_name)::boolean INTO has_access
  FROM public.organization_app_subscriptions oas
  JOIN public.app_tiers at ON at.id = oas.tier_id
  WHERE oas.organization_id = org_id
    AND oas.app_id = check_org_feature_access.app_id
    AND oas.status = 'active';

  RETURN COALESCE(has_access, false);
END;
$function$;

-- 12. get_user_organizations
CREATE OR REPLACE FUNCTION public.get_user_organizations()
RETURNS TABLE(organization_id uuid, organization_name text, organization_description text, user_role text, joined_at timestamp with time zone, is_active boolean)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    o.id,
    o.name,
    o.description,
    om.role,
    om.joined_at,
    o.is_active
  FROM public.organizations o
  JOIN public.organization_members om ON om.organization_id = o.id
  WHERE om.user_id = auth.uid()
    AND o.is_active = true
    AND om.is_active = true
  ORDER BY o.name;
END;
$function$;

-- 13. get_current_organization
CREATE OR REPLACE FUNCTION public.get_current_organization()
RETURNS TABLE(id uuid, name text, description text, is_active boolean, created_at timestamp with time zone, updated_at timestamp with time zone)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  current_org_id uuid;
BEGIN
  -- Get organization_id from JWT metadata
  current_org_id := (auth.jwt() -> 'app_metadata' ->> 'organization_id')::uuid;

  -- Return empty result if no organization set in JWT
  IF current_org_id IS NULL THEN
    RETURN;
  END IF;

  -- Security check: Verify user is an ACTIVE member of this organization
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE public.organization_members.organization_id = current_org_id
      AND public.organization_members.user_id = auth.uid()
      AND public.organization_members.is_active = true
  ) THEN
    RAISE EXCEPTION 'Access denied: User is not an active member of this organization';
  END IF;

  -- Return only ACTIVE organization details
  RETURN QUERY
  SELECT
    o.id,
    o.name,
    o.description,
    o.is_active,
    o.created_at,
    o.updated_at
  FROM public.organizations o
  WHERE o.id = current_org_id
    AND o.is_active = true;
END;
$function$;

-- 14. get_organization_apps
CREATE OR REPLACE FUNCTION public.get_organization_apps(org_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(app_id text, app_name text, app_description text, app_url text, tier_name text, tier_display_name text, status text, features jsonb, limits jsonb, current_usage jsonb)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  target_org_id uuid;
BEGIN
  -- Use provided org_id or fall back to current user's org
  target_org_id := COALESCE(org_id, public.user_organization_id());

  -- Verify user has access to this organization
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members
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
    a.app_url,
    oas.tier_name,
    at.display_name,
    oas.status,
    at.features,
    at.limits,
    COALESCE(
      (SELECT jsonb_object_agg(usage_type, quantity)
       FROM public.organization_app_usage
       WHERE subscription_id = oas.id
         AND period_start >= date_trunc('month', now())
         AND period_end <= date_trunc('month', now()) + interval '1 month'),
      '{}'::jsonb
    ) AS current_usage
  FROM public.organization_app_subscriptions oas
  JOIN public.apps a ON a.id = oas.app_id
  JOIN public.app_tiers at ON at.id = oas.tier_id
  WHERE oas.organization_id = target_org_id
    AND oas.status = 'active'
    AND a.is_active = true
  ORDER BY a.name;
END;
$function$;

-- 15. get_user_apps_with_admin
CREATE OR REPLACE FUNCTION public.get_user_apps_with_admin()
RETURNS TABLE(app_id text, app_name text, app_description text, app_url text, tier_name text, tier_display_name text, status text, features jsonb, limits jsonb, current_usage jsonb, is_platform_app boolean)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  -- Step 1: Return organization's subscribed apps
  RETURN QUERY
  SELECT
    a.app_id,
    a.app_name,
    a.app_description,
    a.app_url,
    a.tier_name,
    a.tier_display_name,
    a.status,
    a.features,
    a.limits,
    a.current_usage,
    false as is_platform_app
  FROM public.get_organization_apps() a;

  -- Step 2: If user is platform admin, append Admin Portal
  IF public.is_playze_admin() THEN
    RETURN QUERY
    SELECT
      'admin'::text as app_id,
      'Admin Portal'::text as app_name,
      'Platform administration interface'::text as app_description,
      'http://localhost:3001'::text as app_url,
      'platform'::text as tier_name,
      'Platform Admin'::text as tier_display_name,
      'active'::text as status,
      '{}'::jsonb as features,
      '{}'::jsonb as limits,
      '{}'::jsonb as current_usage,
      true as is_platform_app
    ;
  END IF;
END;
$function$;

-- 16. get_user_authorization
CREATE OR REPLACE FUNCTION public.get_user_authorization(p_org_id uuid DEFAULT NULL::uuid, p_app_id text DEFAULT NULL::text)
RETURNS TABLE(organization_id uuid, organization_name text, user_role text, app_id text, app_name text, app_description text, tier_name text, tier_display_name text, tier_features jsonb, role_permissions jsonb, tier_limits jsonb, current_usage jsonb, subscription_status text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_org_id uuid;
  v_user_id uuid;
BEGIN
  -- Get current user ID
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  -- Validate app_id is provided
  IF p_app_id IS NULL THEN
    RAISE EXCEPTION 'app_id is required';
  END IF;

  -- Determine which organization to use
  v_org_id := COALESCE(p_org_id, public.user_organization_id());

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'No organization context available';
  END IF;

  -- Return authorization context
  RETURN QUERY
  SELECT
    o.id AS organization_id,
    o.name AS organization_name,
    COALESCE(om.role, 'viewer') AS user_role,
    a.id AS app_id,
    a.name AS app_name,
    a.description AS app_description,
    COALESCE(sub.tier_name, 'free') AS tier_name,
    COALESCE(at.display_name, 'Free') AS tier_display_name,
    COALESCE(at.features, '{}'::jsonb) AS tier_features,
    public.role_permissions_for_role(a.id, COALESCE(om.role, 'viewer')) AS role_permissions,
    COALESCE(at.limits, '{}'::jsonb) AS tier_limits,
    '{}'::jsonb AS current_usage,
    COALESCE(sub.status, 'inactive') AS subscription_status
  FROM public.organizations o
  CROSS JOIN public.apps a
  LEFT JOIN public.organization_members om ON om.organization_id = o.id AND om.user_id = v_user_id
  LEFT JOIN public.organization_app_subscriptions sub ON sub.organization_id = o.id AND sub.app_id = a.id
  LEFT JOIN public.app_tiers at ON at.id = sub.tier_id
  WHERE o.id = v_org_id
    AND a.id = p_app_id
    AND a.is_active = true
  LIMIT 1;

END;
$function$;

-- 17. get_billing_usage_summary
CREATE OR REPLACE FUNCTION public.get_billing_usage_summary(org_id uuid, period_start timestamp with time zone, period_end timestamp with time zone)
RETURNS TABLE(app_id text, app_name text, tier_name text, tier_display_name text, tier_price numeric, usage_items jsonb, total_amount numeric)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  caller_role text;
BEGIN
  -- Check caller has permission (owner or admin)
  SELECT role INTO caller_role
  FROM public.organization_members
  WHERE organization_id = get_billing_usage_summary.org_id
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
       FROM public.organization_app_usage
       WHERE subscription_id = oas.id
         AND public.organization_app_usage.period_start >= get_billing_usage_summary.period_start
         AND public.organization_app_usage.period_end <= get_billing_usage_summary.period_end),
      '{}'::jsonb
    ) AS usage_items,
    COALESCE(at.price_monthly, 0) AS total_amount
  FROM public.organization_app_subscriptions oas
  JOIN public.apps a ON a.id = oas.app_id
  JOIN public.app_tiers at ON at.id = oas.tier_id
  WHERE oas.organization_id = get_billing_usage_summary.org_id
    AND oas.status = 'active'
  ORDER BY a.name;
END;
$function$;

-- 18. get_processor_with_operations
CREATE OR REPLACE FUNCTION public.get_processor_with_operations(p_processor_id uuid)
RETURNS TABLE(processor_id uuid, processor_name text, processor_description text, processor_usage_description text, processor_status text, processor_visibility text, processor_system_prompt text, processor_area_configuration jsonb, processor_configuration jsonb, processor_tags text[], processor_created_at timestamp with time zone, processor_updated_at timestamp with time zone, processor_published_at timestamp with time zone, processor_loaded_snapshot_id uuid, creator_name text, operation_id uuid, operation_name text, operation_description text, operation_type text, operation_prompt text, operation_output_schema jsonb, operation_validation_rules jsonb, operation_area text, operation_position numeric, operation_required boolean, operation_configuration jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.name,
    p.description,
    p.usage_description,
    p.status::text,
    p.visibility::text,
    p.system_prompt,
    p.area_configuration,
    p.configuration,
    p.tags,
    p.created_at,
    p.updated_at,
    p.published_at,
    p.loaded_snapshot_id,
    prof.full_name,
    o.id,
    o.name,
    o.description,
    o.operation_type::text,
    o.prompt,
    o.output_schema,
    o.validation_rules,
    o.area,
    o.position,
    o.required,
    o.configuration
  FROM public.validai_processors p
  LEFT JOIN public.profiles prof ON prof.id = p.created_by
  LEFT JOIN public.validai_operations o ON o.processor_id = p.id
  WHERE p.id = p_processor_id
    AND p.deleted_at IS NULL
  ORDER BY o.area, o.position;
END;
$function$;

-- 19. update_organization_member_role
CREATE OR REPLACE FUNCTION public.update_organization_member_role(org_id uuid, target_user_id uuid, new_role text)
RETURNS TABLE(success boolean, message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
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
  FROM public.organization_members
  WHERE organization_id = update_organization_member_role.org_id
    AND user_id = auth.uid();

  -- Check caller has permission (must be owner or admin)
  IF caller_role NOT IN ('owner', 'admin') THEN
    RETURN QUERY SELECT false, 'Permission denied: Admin role required';
    RETURN;
  END IF;

  -- Get target user's current role
  SELECT role INTO current_role
  FROM public.organization_members
  WHERE organization_id = update_organization_member_role.org_id
    AND user_id = target_user_id;

  IF current_role IS NULL THEN
    RETURN QUERY SELECT false, 'User is not a member of this organization';
    RETURN;
  END IF;

  -- Prevent demoting last owner
  IF current_role = 'owner' AND new_role != 'owner' THEN
    SELECT COUNT(*) INTO owner_count
    FROM public.organization_members
    WHERE organization_id = update_organization_member_role.org_id
      AND role = 'owner';

    IF owner_count <= 1 THEN
      RETURN QUERY SELECT false, 'Cannot demote last owner';
      RETURN;
    END IF;
  END IF;

  -- Update role
  UPDATE public.organization_members
  SET role = new_role
  WHERE organization_id = update_organization_member_role.org_id
    AND user_id = target_user_id;

  RETURN QUERY SELECT true, 'Role updated successfully';
END;
$function$;

-- 20. remove_organization_member
CREATE OR REPLACE FUNCTION public.remove_organization_member(org_id uuid, target_user_id uuid)
RETURNS TABLE(success boolean, message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  caller_role text;
  target_role text;
  owner_count integer;
BEGIN
  -- Get caller's role
  SELECT role INTO caller_role
  FROM public.organization_members
  WHERE organization_id = remove_organization_member.org_id
    AND user_id = auth.uid();

  -- Check caller has permission
  IF caller_role NOT IN ('owner', 'admin') THEN
    RETURN QUERY SELECT false, 'Permission denied: Admin role required';
    RETURN;
  END IF;

  -- Get target user's role
  SELECT role INTO target_role
  FROM public.organization_members
  WHERE organization_id = remove_organization_member.org_id
    AND user_id = target_user_id;

  IF target_role IS NULL THEN
    RETURN QUERY SELECT false, 'User is not a member of this organization';
    RETURN;
  END IF;

  -- Prevent removing last owner
  IF target_role = 'owner' THEN
    SELECT COUNT(*) INTO owner_count
    FROM public.organization_members
    WHERE organization_id = remove_organization_member.org_id
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
  DELETE FROM public.organization_members
  WHERE organization_id = remove_organization_member.org_id
    AND user_id = target_user_id;

  RETURN QUERY SELECT true, 'Member removed successfully';
END;
$function$;

-- 21. increment_app_usage
CREATE OR REPLACE FUNCTION public.increment_app_usage(org_id uuid, app_id text, usage_type text, increment_by numeric DEFAULT 1)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  sub_id uuid;
  period_start timestamptz := date_trunc('month', now());
  period_end timestamptz := date_trunc('month', now()) + interval '1 month';
BEGIN
  -- Get active subscription ID
  SELECT id INTO sub_id
  FROM public.organization_app_subscriptions
  WHERE organization_id = increment_app_usage.org_id
    AND public.organization_app_subscriptions.app_id = increment_app_usage.app_id
    AND status = 'active';

  IF sub_id IS NULL THEN
    RAISE EXCEPTION 'No active subscription for app: %', app_id;
  END IF;

  -- Insert or update usage record atomically
  INSERT INTO public.organization_app_usage (
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
    increment_app_usage.org_id,
    increment_app_usage.app_id,
    increment_app_usage.usage_type,
    increment_by,
    period_start,
    period_end
  )
  ON CONFLICT (subscription_id, usage_type, period_start, period_end)
  DO UPDATE SET
    quantity = public.organization_app_usage.quantity + increment_by,
    updated_at = now();
END;
$function$;

-- 22. save_as_version
CREATE OR REPLACE FUNCTION public.save_as_version(p_processor_id uuid, p_visibility text DEFAULT 'private'::text)
RETURNS TABLE(snapshot_id uuid, version_number integer, operation_count integer, message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid;
  v_org_id uuid;
  v_processor record;
  v_operations jsonb;
  v_operation_count integer;
  v_next_version integer;
  v_snapshot_id uuid;
  v_snapshot jsonb;
BEGIN
  -- Get current user and organization from JWT
  v_user_id := auth.uid();
  v_org_id := (auth.jwt() -> 'app_metadata' ->> 'organization_id')::uuid;

  IF v_user_id IS NULL OR v_org_id IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated with an active organization';
  END IF;

  -- Validate visibility
  IF p_visibility NOT IN ('private', 'organization', 'public') THEN
    RAISE EXCEPTION 'Invalid visibility. Must be: private, organization, or public';
  END IF;

  -- Fetch processor (must belong to user's organization)
  SELECT *
  INTO v_processor
  FROM public.validai_processors
  WHERE id = p_processor_id
    AND organization_id = v_org_id
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Processor not found or access denied';
  END IF;

  -- Fetch and build operations array
  SELECT
    jsonb_agg(
      jsonb_build_object(
        'id', op.id,
        'name', op.name,
        'description', op.description,
        'operation_type', op.operation_type,
        'prompt', op.prompt,
        'position', op.position,
        'area', op.area,
        'configuration', op.configuration,
        'output_schema', op.output_schema
      ) ORDER BY op.position
    ),
    COUNT(*)::integer
  INTO v_operations, v_operation_count
  FROM public.validai_operations op
  WHERE op.processor_id = p_processor_id;

  -- Check for at least one operation
  IF v_operation_count = 0 THEN
    RAISE EXCEPTION 'Cannot save version with no operations';
  END IF;

  -- Calculate next version number for this processor
  SELECT COALESCE(MAX(ps.version_number), 0) + 1
  INTO v_next_version
  FROM public.validai_playbook_snapshots ps
  WHERE ps.processor_id = p_processor_id;

  -- Build the complete snapshot
  v_snapshot := jsonb_build_object(
    'processor', jsonb_build_object(
      'id', v_processor.id,
      'name', v_processor.name,
      'description', v_processor.description,
      'system_prompt', v_processor.system_prompt,
      'configuration', v_processor.configuration,
      'area_configuration', v_processor.area_configuration
    ),
    'operations', COALESCE(v_operations, '[]'::jsonb)
  );

  -- Insert the snapshot (NOT published by default)
  INSERT INTO public.validai_playbook_snapshots (
    processor_id,
    creator_organization_id,
    created_by,
    name,
    description,
    version_number,
    visibility,
    is_published,
    snapshot,
    published_at
  )
  VALUES (
    p_processor_id,
    v_org_id,
    v_user_id,
    v_processor.name,
    v_processor.description,
    v_next_version,
    p_visibility,
    false,
    v_snapshot,
    now()
  )
  RETURNING id INTO v_snapshot_id;

  -- Update processor with loaded_snapshot_id
  UPDATE public.validai_processors
  SET
    loaded_snapshot_id = v_snapshot_id,
    updated_at = now()
  WHERE id = p_processor_id;

  -- Return result
  RETURN QUERY SELECT
    v_snapshot_id,
    v_next_version,
    v_operation_count,
    format('Saved version %s with %s operations', v_next_version, v_operation_count);
END;
$function$;

-- 23. load_snapshot
CREATE OR REPLACE FUNCTION public.load_snapshot(p_processor_id uuid, p_snapshot_id uuid)
RETURNS TABLE(success boolean, message text, version_number integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_org_id uuid;
  v_snapshot record;
  v_processor record;
  v_op record;
BEGIN
  -- Get current organization from JWT
  v_org_id := (auth.jwt() -> 'app_metadata' ->> 'organization_id')::uuid;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated with an active organization';
  END IF;

  -- Fetch processor (must belong to user's organization)
  SELECT *
  INTO v_processor
  FROM public.validai_processors
  WHERE id = p_processor_id
    AND organization_id = v_org_id
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Processor not found or access denied';
  END IF;

  -- Fetch snapshot (must belong to same processor and organization)
  SELECT *
  INTO v_snapshot
  FROM public.validai_playbook_snapshots
  WHERE id = p_snapshot_id
    AND processor_id = p_processor_id
    AND creator_organization_id = v_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Snapshot not found or does not belong to this processor';
  END IF;

  -- Update processor fields from snapshot
  UPDATE public.validai_processors
  SET
    system_prompt = v_snapshot.snapshot -> 'processor' ->> 'system_prompt',
    configuration = (v_snapshot.snapshot -> 'processor' -> 'configuration'),
    area_configuration = (v_snapshot.snapshot -> 'processor' -> 'area_configuration'),
    loaded_snapshot_id = p_snapshot_id,
    updated_at = now()
  WHERE id = p_processor_id;

  -- Delete existing operations
  DELETE FROM public.validai_operations
  WHERE processor_id = p_processor_id;

  -- Insert operations from snapshot
  FOR v_op IN
    SELECT * FROM jsonb_array_elements(v_snapshot.snapshot -> 'operations')
  LOOP
    INSERT INTO public.validai_operations (
      processor_id,
      organization_id,
      name,
      description,
      operation_type,
      prompt,
      position,
      area,
      configuration,
      output_schema,
      created_at,
      updated_at
    )
    VALUES (
      p_processor_id,
      v_org_id,
      v_op.value ->> 'name',
      v_op.value ->> 'description',
      (v_op.value ->> 'operation_type')::public.operation_type,
      v_op.value ->> 'prompt',
      (v_op.value ->> 'position')::numeric,
      v_op.value ->> 'area',
      v_op.value -> 'configuration',
      v_op.value -> 'output_schema',
      now(),
      now()
    );
  END LOOP;

  RETURN QUERY SELECT
    true,
    format('Loaded version %s', v_snapshot.version_number),
    v_snapshot.version_number;
END;
$function$;
