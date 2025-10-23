-- Migration: Add admin bypass to organization_members RLS policy
-- Purpose: Fix infinite recursion error when admins query organization members
-- Created: 2025-01-20
-- Issue: Error code 42P17 - "infinite recursion detected in policy for relation organization_members"

-- =====================================================
-- PROBLEM ANALYSIS
-- =====================================================
-- The current RLS policy on organization_members creates infinite recursion:
--
-- CREATE POLICY "Users can view members of their organizations"
--   ON organization_members FOR SELECT
--   USING (
--     EXISTS (
--       SELECT 1 FROM organization_members AS om  -- ← Queries same table!
--       WHERE om.organization_id = organization_members.organization_id
--         AND om.user_id = auth.uid()
--     )
--   );
--
-- This works for regular users (Postgres optimizes it), but fails for admins
-- who are NOT members of any organization. Admin portal needs to view all
-- organization members without being a member themselves.

-- =====================================================
-- FIX: Add is_playze_admin() bypass
-- =====================================================

-- Drop the old policy
DROP POLICY IF EXISTS "Users can view members of their organizations"
  ON organization_members;

-- Create new policy with admin bypass
CREATE POLICY "Users and admins can view organization members"
  ON organization_members FOR SELECT
  USING (
    -- Path 1: Regular users can see members of orgs they belong to
    EXISTS (
      SELECT 1 FROM organization_members AS om
      WHERE om.organization_id = organization_members.organization_id
        AND om.user_id = auth.uid()
    )
    OR
    -- Path 2: Playze admins can see all organization members (no recursion)
    is_playze_admin()
  );

COMMENT ON POLICY "Users and admins can view organization members"
  ON organization_members IS
  'Allows users to view members of their organizations, and allows Playze admins to view all organization members without triggering infinite recursion';

-- =====================================================
-- VERIFICATION QUERY
-- =====================================================
-- Run this to verify the policy was updated:
-- SELECT policyname, cmd, qual FROM pg_policies WHERE tablename = 'organization_members';
