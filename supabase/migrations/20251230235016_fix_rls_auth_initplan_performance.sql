-- Fix RLS Auth InitPlan Performance Issues
--
-- This migration fixes 17 RLS policies that re-evaluate auth.uid() and auth.jwt()
-- for each row, causing suboptimal query performance at scale.
--
-- The fix wraps auth.<function>() calls with (select auth.<function>()) so the
-- value is computed once per query instead of per row.
--
-- See: https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan

-- ============================================================================
-- 1. user_preferences (3 policies)
-- ============================================================================

DROP POLICY IF EXISTS "Users can view their own preferences" ON user_preferences;
CREATE POLICY "Users can view their own preferences" ON user_preferences
  FOR SELECT USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update their own preferences" ON user_preferences;
CREATE POLICY "Users can update their own preferences" ON user_preferences
  FOR UPDATE USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can insert their own preferences" ON user_preferences;
CREATE POLICY "Users can insert their own preferences" ON user_preferences
  FOR INSERT WITH CHECK (user_id = (select auth.uid()));

-- ============================================================================
-- 2. profiles (1 policy)
-- ============================================================================

DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
CREATE POLICY "Users can update their own profile" ON profiles
  FOR UPDATE USING (id = (select auth.uid()));

-- ============================================================================
-- 3. admin_users (4 policies)
-- ============================================================================

DROP POLICY IF EXISTS "Users can check their own admin status" ON admin_users;
CREATE POLICY "Users can check their own admin status" ON admin_users
  FOR SELECT USING (email = lower(((select auth.jwt()) ->> 'email'::text)));

DROP POLICY IF EXISTS "Admins can create other admins" ON admin_users;
CREATE POLICY "Admins can create other admins" ON admin_users
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE email = ((select auth.jwt()) ->> 'email'::text)
    )
  );

DROP POLICY IF EXISTS "Admins can update admin records" ON admin_users;
CREATE POLICY "Admins can update admin records" ON admin_users
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE email = ((select auth.jwt()) ->> 'email'::text)
    )
  );

DROP POLICY IF EXISTS "Admins can delete admin records" ON admin_users;
CREATE POLICY "Admins can delete admin records" ON admin_users
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE email = ((select auth.jwt()) ->> 'email'::text)
    )
  );

-- ============================================================================
-- 4. organizations (2 policies)
-- ============================================================================

DROP POLICY IF EXISTS "Users can view their organizations" ON organizations;
CREATE POLICY "Users can view their organizations" ON organizations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members.organization_id = organizations.id
        AND organization_members.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Owners can update their organizations" ON organizations;
CREATE POLICY "Owners can update their organizations" ON organizations
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members.organization_id = organizations.id
        AND organization_members.user_id = (select auth.uid())
        AND organization_members.role = 'owner'::text
    )
  );

-- ============================================================================
-- 5. organization_members (1 policy)
-- ============================================================================

DROP POLICY IF EXISTS "Users can view members of their organizations" ON organization_members;
CREATE POLICY "Users can view members of their organizations" ON organization_members
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = organization_members.organization_id
        AND om.user_id = (select auth.uid())
    )
  );

-- ============================================================================
-- 6. organization_invitations (3 policies)
-- ============================================================================

DROP POLICY IF EXISTS "Admins and owners can view invitations" ON organization_invitations;
CREATE POLICY "Admins and owners can view invitations" ON organization_invitations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members.organization_id = organization_invitations.organization_id
        AND organization_members.user_id = (select auth.uid())
        AND organization_members.role = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  );

DROP POLICY IF EXISTS "Admins and owners can create invitations" ON organization_invitations;
CREATE POLICY "Admins and owners can create invitations" ON organization_invitations
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members.organization_id = organization_invitations.organization_id
        AND organization_members.user_id = (select auth.uid())
        AND organization_members.role = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  );

DROP POLICY IF EXISTS "Admins and owners can cancel invitations" ON organization_invitations;
CREATE POLICY "Admins and owners can cancel invitations" ON organization_invitations
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members.organization_id = organization_invitations.organization_id
        AND organization_members.user_id = (select auth.uid())
        AND organization_members.role = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  );

-- ============================================================================
-- 7. organization_app_subscriptions (1 policy)
-- ============================================================================

DROP POLICY IF EXISTS "Users can view their organization subscriptions" ON organization_app_subscriptions;
CREATE POLICY "Users can view their organization subscriptions" ON organization_app_subscriptions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members.organization_id = organization_app_subscriptions.organization_id
        AND organization_members.user_id = (select auth.uid())
    )
  );

-- ============================================================================
-- 8. organization_app_usage (1 policy)
-- ============================================================================

DROP POLICY IF EXISTS "Users can view their organization usage" ON organization_app_usage;
CREATE POLICY "Users can view their organization usage" ON organization_app_usage
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members.organization_id = organization_app_usage.organization_id
        AND organization_members.user_id = (select auth.uid())
    )
  );

-- ============================================================================
-- 9. invoices (1 policy)
-- ============================================================================

DROP POLICY IF EXISTS "Organization owners can view invoices" ON invoices;
CREATE POLICY "Organization owners can view invoices" ON invoices
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members.organization_id = invoices.organization_id
        AND organization_members.user_id = (select auth.uid())
        AND organization_members.role = 'owner'::text
    )
  );
