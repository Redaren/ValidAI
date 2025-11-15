-- =============================================================================
-- FIX: JWT Enrichment to Use Correct Platform Organizations Table Schema
-- =============================================================================
-- Created: 2025-11-15
-- Issue: Edge Functions and trigger try to query non-existent columns from organizations table
-- Root Cause: Platform organizations table has NO slug or plan_type columns
-- Solution: Update trigger to query only columns that exist in platform schema
-- =============================================================================

-- -----------------------------------------------------------------------------
-- UPDATE TRIGGER FUNCTION: handle_invited_user
-- -----------------------------------------------------------------------------
-- Remove queries for non-existent columns (slug, plan_type)
-- Use ONLY columns that exist in platform organizations table

CREATE OR REPLACE FUNCTION public.handle_invited_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public, auth
LANGUAGE plpgsql
AS $$
DECLARE
  invitation_org_id uuid;
  invitation_role text;
  invitation_invited_by uuid;
  org_name text;
  active_app_ids text[];
BEGIN
  -- Create profile automatically (WITH SCHEMA PREFIX)
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  );

  -- Create preferences automatically (WITH SCHEMA PREFIX)
  INSERT INTO public.user_preferences (user_id)
  VALUES (NEW.id);

  -- Check for pending invitation (WITH SCHEMA PREFIX)
  SELECT
    organization_id,
    role,
    invited_by
  INTO
    invitation_org_id,
    invitation_role,
    invitation_invited_by
  FROM public.organization_invitations
  WHERE email = NEW.email
    AND status = 'pending'
    AND expires_at > now()
  ORDER BY invited_at DESC
  LIMIT 1;

  -- If invited, add to organization
  IF invitation_org_id IS NOT NULL THEN
    -- Fetch organization name from PLATFORM table
    -- NOTE: Platform organizations table has ONLY: id, name, description, is_active, created_at, updated_at
    -- NO slug, NO plan_type columns (those were in legacy validai_organizations table)
    SELECT name
    INTO org_name
    FROM public.organizations
    WHERE id = invitation_org_id;

    -- Fetch active app subscriptions
    SELECT ARRAY_AGG(app_id)
    INTO active_app_ids
    FROM public.organization_app_subscriptions
    WHERE organization_id = invitation_org_id
      AND status = 'active';

    -- Add user to organization (WITH SCHEMA PREFIX)
    INSERT INTO public.organization_members (
      organization_id,
      user_id,
      role,
      invited_by
    )
    VALUES (
      invitation_org_id,
      NEW.id,
      invitation_role,
      invitation_invited_by
    );

    -- Mark invitation as accepted (WITH SCHEMA PREFIX)
    UPDATE public.organization_invitations
    SET
      status = 'accepted',
      accepted_at = now(),
      updated_at = now()
    WHERE email = NEW.email
      AND organization_id = invitation_org_id
      AND status = 'pending';

    -- Set JWT metadata with ONLY available fields from platform schema
    UPDATE auth.users
    SET raw_app_metadata = jsonb_build_object(
      'organization_id', invitation_org_id,
      'organization_name', org_name,
      'organization_role', invitation_role,
      'app_subscriptions', COALESCE(active_app_ids, ARRAY[]::text[])
      -- REMOVED: organization_slug (doesn't exist in platform organizations table)
      -- REMOVED: organization_plan_type (doesn't exist in platform organizations table)
    )
    WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

-- Update function comment to reflect the fix
COMMENT ON FUNCTION public.handle_invited_user() IS
'Trigger function that runs on user signup to:
1. Create user profile automatically
2. Create user preferences automatically
3. Check for pending invitations
4. Add user to organization if invited
5. Mark invitation as accepted
6. Set JWT metadata with organization context

FIXED (2025-11-15): Updated to query ONLY columns that exist in platform organizations table
Platform schema has: id, name, description, is_active, created_at, updated_at, created_by, llm_configuration
Legacy validai_organizations had: slug, plan_type (NOT in platform table)';

-- =============================================================================
-- VERIFICATION
-- =============================================================================

DO $$
BEGIN
  RAISE NOTICE ' JWT Enrichment Fix Applied';
  RAISE NOTICE '   - Trigger updated: public.handle_invited_user()';
  RAISE NOTICE '   - Queries ONLY platform organizations table';
  RAISE NOTICE '   - Removed: slug, plan_type (non-existent columns)';
  RAISE NOTICE '   - JWT fields: organization_id, organization_name, organization_role, app_subscriptions';
END $$;

-- =============================================================================
-- END OF MIGRATION
-- =============================================================================
