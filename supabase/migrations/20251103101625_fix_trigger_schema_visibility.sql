-- =============================================================================
-- FIX: Trigger Function Schema Visibility Issue
-- =============================================================================
-- Created: 2025-11-03
-- Issue: handle_invited_user() trigger fails with "relation 'profiles' does not exist"
-- Root Cause: Missing explicit schema prefixes on table references
-- Solution: Add public. schema prefix to all table references + SET search_path
-- =============================================================================

-- -----------------------------------------------------------------------------
-- RECREATE TRIGGER FUNCTION WITH SCHEMA PREFIXES
-- -----------------------------------------------------------------------------

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

    -- Set initial organization in JWT metadata (ALREADY HAS SCHEMA PREFIX)
    UPDATE auth.users
    SET raw_app_metadata = jsonb_set(
      COALESCE(raw_app_metadata, '{}'::jsonb),
      '{organization_id}',
      to_jsonb(invitation_org_id)
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
6. Set initial organization in JWT metadata

FIXED (2025-11-03): Added explicit public. schema prefixes to prevent "relation does not exist" errors';

-- =============================================================================
-- END OF MIGRATION
-- =============================================================================
