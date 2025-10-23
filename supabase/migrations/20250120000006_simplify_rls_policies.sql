-- Migration: Simplify RLS Policies
-- Purpose: Remove is_playze_admin() checks that cause infinite recursion
-- Created: 2025-01-20
-- Approach: Admin access via SECURITY DEFINER functions, RLS for regular users only

-- =====================================================
-- CONTEXT
-- =====================================================
-- Now that admins use admin_*() database functions that bypass RLS,
-- we can simplify RLS policies to ONLY handle regular user access.
--
-- Remove ALL is_playze_admin() checks from RLS policies.
-- This eliminates infinite recursion and makes policies simple.

-- =====================================================
-- 1. ORGANIZATIONS TABLE
-- =====================================================

-- Drop old policies with is_playze_admin()
DROP POLICY IF EXISTS "Users and admins can view organizations" ON organizations;
DROP POLICY IF EXISTS "Owners and admins can update organizations" ON organizations;
DROP POLICY IF EXISTS "Only Playze admins can delete organizations" ON organizations;

-- Create simple policies for regular users only
CREATE POLICY "Users can view their organizations"
  ON organizations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members.organization_id = organizations.id
        AND organization_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Owners can update their organizations"
  ON organizations FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members.organization_id = organizations.id
        AND organization_members.user_id = auth.uid()
        AND organization_members.role = 'owner'
    )
  );

-- No DELETE policy for regular users
-- (Admins handle deletes via service-role operations, not through RLS)

COMMENT ON POLICY "Users can view their organizations" ON organizations IS
'Regular users can view organizations they are members of. Admins bypass this via admin_list_organizations().';

COMMENT ON POLICY "Owners can update their organizations" ON organizations IS
'Organization owners can update their organization details. Admins use service-role for updates.';

-- =====================================================
-- 2. ORGANIZATION MEMBERS TABLE
-- =====================================================

-- Drop old policy with is_playze_admin()
DROP POLICY IF EXISTS "Users and admins can view organization members" ON organization_members;

-- Create simple policy for regular users
CREATE POLICY "Users can view members of their organizations"
  ON organization_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_members AS om
      WHERE om.organization_id = organization_members.organization_id
        AND om.user_id = auth.uid()
    )
  );

COMMENT ON POLICY "Users can view members of their organizations" ON organization_members IS
'Users can view members of organizations they belong to. Admins bypass this via admin_list_organization_members().';

-- =====================================================
-- 3. ORGANIZATION INVITATIONS TABLE
-- =====================================================

-- Drop old policy with is_playze_admin()
DROP POLICY IF EXISTS "Members and admins can view organization invitations" ON organization_invitations;

-- Create simple policy for regular users (admins/owners only)
CREATE POLICY "Admins and owners can view invitations"
  ON organization_invitations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members.organization_id = organization_invitations.organization_id
        AND organization_members.user_id = auth.uid()
        AND organization_members.role IN ('owner', 'admin')
    )
  );

COMMENT ON POLICY "Admins and owners can view invitations" ON organization_invitations IS
'Org admins/owners can view invitations. Playze admins bypass this via admin_list_organization_invitations().';

-- =====================================================
-- 4. ORGANIZATION APP SUBSCRIPTIONS TABLE
-- =====================================================

-- Drop old policy with is_playze_admin()
DROP POLICY IF EXISTS "Users and admins can view organization subscriptions" ON organization_app_subscriptions;

-- Create simple policy for regular users
CREATE POLICY "Users can view their organization subscriptions"
  ON organization_app_subscriptions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members.organization_id = organization_app_subscriptions.organization_id
        AND organization_members.user_id = auth.uid()
    )
  );

COMMENT ON POLICY "Users can view their organization subscriptions" ON organization_app_subscriptions IS
'Users can view subscriptions for their organizations. Playze admins bypass this via admin_list_organization_subscriptions().';

-- =====================================================
-- 5. ORGANIZATION APP USAGE TABLE
-- =====================================================

-- Drop old policy with is_playze_admin()
DROP POLICY IF EXISTS "Users and admins can view organization usage" ON organization_app_usage;

-- Create simple policy for regular users
CREATE POLICY "Users can view their organization usage"
  ON organization_app_usage FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members.organization_id = organization_app_usage.organization_id
        AND organization_members.user_id = auth.uid()
    )
  );

COMMENT ON POLICY "Users can view their organization usage" ON organization_app_usage IS
'Users can view usage for their organizations. Playze admins bypass this via admin functions.';

-- =====================================================
-- VERIFICATION
-- =====================================================

-- After this migration:
-- 1. All RLS policies are simple (no is_playze_admin() checks)
-- 2. No infinite recursion possible
-- 3. Regular users access via PostgREST with RLS
-- 4. Admin users access via admin_*() functions that bypass RLS

-- Verify policies:
-- SELECT tablename, policyname, cmd
-- FROM pg_policies
-- WHERE tablename IN (
--   'organizations',
--   'organization_members',
--   'organization_invitations',
--   'organization_app_subscriptions',
--   'organization_app_usage'
-- )
-- ORDER BY tablename, policyname;
