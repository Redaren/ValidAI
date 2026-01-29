-- ============================================================================
-- SECURITY FIX: Restrict invitation UPDATE policy to only allow cancellation
--
-- Issue: The UPDATE policy allowed admins/owners to modify ANY column,
-- not just cancel invitations. This could lead to:
-- - Redirecting invitations to different emails
-- - Privilege escalation (changing role to owner)
-- - Moving invitations between organizations
--
-- Fix: Add WITH CHECK to ensure only status can change to 'cancelled'
-- ============================================================================

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Admins and owners can cancel invitations" ON organization_invitations;

-- Create a properly restricted policy
-- Only allows setting status to 'cancelled', all other fields must remain unchanged
CREATE POLICY "Admins and owners can cancel invitations"
ON organization_invitations FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_members.organization_id = organization_invitations.organization_id
      AND organization_members.user_id = auth.uid()
      AND organization_members.role IN ('owner', 'admin')
  )
)
WITH CHECK (
  -- Only allow setting status to cancelled
  status = 'cancelled'
);
