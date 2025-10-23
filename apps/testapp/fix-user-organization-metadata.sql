-- =============================================================================
-- FIX USER ORGANIZATION METADATA
-- =============================================================================
-- Purpose: Fix users who don't have organization_id in JWT metadata
-- This happens when users were created outside the invitation flow
-- =============================================================================

-- -----------------------------------------------------------------------------
-- STEP 1: Find Users Missing organization_id in JWT
-- -----------------------------------------------------------------------------

-- Check all users and their current metadata
SELECT
  u.id,
  u.email,
  u.raw_app_metadata,
  u.created_at,
  CASE
    WHEN u.raw_app_metadata ? 'organization_id' THEN 'HAS org_id'
    ELSE 'MISSING org_id'
  END as metadata_status
FROM auth.users u
ORDER BY u.created_at DESC;

-- -----------------------------------------------------------------------------
-- STEP 2: Find User's Organization Memberships
-- -----------------------------------------------------------------------------

-- For each user, show which organizations they belong to
-- Replace 'user@example.com' with the actual email from Step 1
SELECT
  u.id as user_id,
  u.email,
  om.organization_id,
  o.name as org_name,
  om.role,
  om.joined_at,
  u.raw_app_metadata
FROM auth.users u
LEFT JOIN organization_members om ON om.user_id = u.id
LEFT JOIN organizations o ON o.id = om.organization_id
WHERE u.email = 'user@example.com';  -- ⚠️ REPLACE THIS EMAIL

-- -----------------------------------------------------------------------------
-- STEP 3: Update User's JWT Metadata
-- -----------------------------------------------------------------------------

-- Set organization_id in user's app_metadata
-- ⚠️ IMPORTANT: Replace BOTH placeholders below:
--    1. 'user@example.com' - The user's email
--    2. 'ORG_UUID_HERE' - The organization UUID from Step 2

UPDATE auth.users
SET raw_app_metadata = jsonb_set(
  COALESCE(raw_app_metadata, '{}'::jsonb),
  '{organization_id}',
  to_jsonb('ORG_UUID_HERE'::uuid)  -- ⚠️ REPLACE with actual UUID
)
WHERE email = 'user@example.com';  -- ⚠️ REPLACE with actual email

-- -----------------------------------------------------------------------------
-- STEP 4: Verify the Fix
-- -----------------------------------------------------------------------------

-- Check that metadata was updated correctly
SELECT
  u.id,
  u.email,
  u.raw_app_metadata,
  u.raw_app_metadata -> 'organization_id' as organization_id_in_jwt,
  o.name as org_name
FROM auth.users u
LEFT JOIN organizations o ON o.id = (u.raw_app_metadata ->> 'organization_id')::uuid
WHERE u.email = 'user@example.com';  -- ⚠️ REPLACE with actual email

-- =============================================================================
-- AFTER RUNNING THIS SQL
-- =============================================================================
-- The user MUST refresh their session to get the new JWT:
--
-- Option A: Sign out and sign back in
-- Option B: Call: await supabase.auth.refreshSession()
-- Option C: Use the organization switcher (calls switch-organization Edge Function)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- BONUS: Create Utility Function (Optional)
-- -----------------------------------------------------------------------------

-- This function automatically fixes metadata for any user
CREATE OR REPLACE FUNCTION fix_user_organization_metadata(target_user_id uuid)
RETURNS TABLE (
  success boolean,
  message text,
  organization_id uuid
) AS $$
DECLARE
  user_org_id uuid;
  user_email text;
BEGIN
  -- Get user's email for logging
  SELECT email INTO user_email FROM auth.users WHERE id = target_user_id;

  IF user_email IS NULL THEN
    RETURN QUERY SELECT false, 'User not found'::text, NULL::uuid;
    RETURN;
  END IF;

  -- Find user's primary organization (first one they joined)
  SELECT om.organization_id INTO user_org_id
  FROM organization_members om
  WHERE om.user_id = target_user_id
  ORDER BY om.joined_at ASC
  LIMIT 1;

  IF user_org_id IS NULL THEN
    RETURN QUERY SELECT false, ('User ' || user_email || ' is not a member of any organization')::text, NULL::uuid;
    RETURN;
  END IF;

  -- Update user's JWT metadata
  UPDATE auth.users
  SET raw_app_metadata = jsonb_set(
    COALESCE(raw_app_metadata, '{}'::jsonb),
    '{organization_id}',
    to_jsonb(user_org_id)
  )
  WHERE id = target_user_id;

  RETURN QUERY SELECT
    true,
    ('Successfully set organization_id for ' || user_email)::text,
    user_org_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION fix_user_organization_metadata(uuid) IS
'Fixes missing organization_id in user JWT metadata.
Finds user''s primary organization and sets it in app_metadata.
User must refresh session after running this.';

-- Example usage of the utility function:
-- SELECT * FROM fix_user_organization_metadata('USER_UUID_HERE');
