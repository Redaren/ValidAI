-- Migration: Add admin bypass to remaining organization-related RLS policies
-- Purpose: Allow admins to view invitations, subscriptions, and usage without being org members
-- Created: 2025-01-20
-- Related: Follows 20250120000002 which fixed organization_members

-- =====================================================
-- CONTEXT
-- =====================================================
-- Admin portal needs to view organization-related data for any organization
-- without requiring the admin user to be a member of those organizations.
--
-- All policies that check organization_members for access control need
-- an admin bypass to avoid requiring admin users to be members.

-- =====================================================
-- 1. ORGANIZATION INVITATIONS
-- =====================================================

-- Drop old SELECT policy
DROP POLICY IF EXISTS "Members can view organization invitations"
  ON organization_invitations;

-- Create new SELECT policy with admin bypass
CREATE POLICY "Members and admins can view organization invitations"
  ON organization_invitations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members.organization_id = organization_invitations.organization_id
        AND organization_members.user_id = auth.uid()
        AND organization_members.role IN ('owner', 'admin')
    )
    OR
    is_playze_admin()
  );

-- =====================================================
-- 2. ORGANIZATION APP SUBSCRIPTIONS
-- =====================================================

-- Drop old SELECT policy
DROP POLICY IF EXISTS "Users can view their organization subscriptions"
  ON organization_app_subscriptions;

-- Create new SELECT policy with admin bypass
CREATE POLICY "Users and admins can view organization subscriptions"
  ON organization_app_subscriptions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members.organization_id = organization_app_subscriptions.organization_id
        AND organization_members.user_id = auth.uid()
    )
    OR
    is_playze_admin()
  );

-- =====================================================
-- 3. ORGANIZATION APP USAGE
-- =====================================================

-- Drop old SELECT policy
DROP POLICY IF EXISTS "Users can view their organization usage"
  ON organization_app_usage;

-- Create new SELECT policy with admin bypass
CREATE POLICY "Users and admins can view organization usage"
  ON organization_app_usage FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members.organization_id = organization_app_usage.organization_id
        AND organization_members.user_id = auth.uid()
    )
    OR
    is_playze_admin()
  );

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON POLICY "Members and admins can view organization invitations"
  ON organization_invitations IS
  'Allows organization admins/owners to view invitations, and allows Playze admins to view all invitations';

COMMENT ON POLICY "Users and admins can view organization subscriptions"
  ON organization_app_subscriptions IS
  'Allows organization members to view subscriptions, and allows Playze admins to view all subscriptions';

COMMENT ON POLICY "Users and admins can view organization usage"
  ON organization_app_usage IS
  'Allows organization members to view usage data, and allows Playze admins to view all usage data';

-- =====================================================
-- VERIFICATION QUERY
-- =====================================================
-- Run this to verify all policies were updated:
--
-- SELECT tablename, policyname, cmd
-- FROM pg_policies
-- WHERE tablename IN (
--   'organization_invitations',
--   'organization_app_subscriptions',
--   'organization_app_usage'
-- )
-- AND cmd = 'SELECT'
-- ORDER BY tablename;
