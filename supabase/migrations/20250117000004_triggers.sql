-- =============================================================================
-- PLAYZE CORE - PHASE 2: TRIGGERS
-- =============================================================================
-- Description: Database triggers for automated workflows
-- Created: 2025-01-17
-- Primary: handle_invited_user trigger for invite-only B2B flow
-- =============================================================================

-- -----------------------------------------------------------------------------
-- TRIGGER FUNCTION: Handle Invited User Signup
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION handle_invited_user()
RETURNS TRIGGER AS $$
DECLARE
  invitation_org_id uuid;
  invitation_role text;
  invitation_invited_by uuid;
BEGIN
  -- Create profile automatically
  INSERT INTO profiles (id, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  );

  -- Create preferences automatically
  INSERT INTO user_preferences (user_id)
  VALUES (NEW.id);

  -- Check for pending invitation
  SELECT
    organization_id,
    role,
    invited_by
  INTO
    invitation_org_id,
    invitation_role,
    invitation_invited_by
  FROM organization_invitations
  WHERE email = NEW.email
    AND status = 'pending'
    AND expires_at > now()
  ORDER BY invited_at DESC
  LIMIT 1;

  -- If invited, add to organization
  IF invitation_org_id IS NOT NULL THEN
    -- Add user to organization
    INSERT INTO organization_members (
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

    -- Mark invitation as accepted
    UPDATE organization_invitations
    SET
      status = 'accepted',
      accepted_at = now(),
      updated_at = now()
    WHERE email = NEW.email
      AND organization_id = invitation_org_id
      AND status = 'pending';

    -- Set initial organization in JWT metadata
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION handle_invited_user() IS
'Trigger function that runs on user signup to:
1. Create user profile automatically
2. Create user preferences automatically
3. Check for pending invitations
4. Add user to organization if invited
5. Mark invitation as accepted
6. Set initial organization in JWT metadata';

-- -----------------------------------------------------------------------------
-- CREATE TRIGGER: On User Creation
-- -----------------------------------------------------------------------------

-- Drop trigger if exists (for idempotency)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_invited_user();

-- Note: COMMENT ON TRIGGER removed due to permission restrictions on auth schema
-- Trigger purpose: Automatically processes user signup: creates profile/preferences, handles invitations

-- =============================================================================
-- END OF TRIGGERS
-- =============================================================================
