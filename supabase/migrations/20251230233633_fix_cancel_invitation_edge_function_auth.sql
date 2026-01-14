-- Migration: Fix admin_cancel_invitation for Edge Function auth
-- Purpose: Remove is_playze_admin() check since Edge Function validates admin status
-- Created: 2025-12-30
--
-- PROBLEM:
-- Edge Functions use service-role client which has no JWT context.
-- is_playze_admin() fails because auth.email() returns NULL.
--
-- SOLUTION:
-- Remove is_playze_admin() check from function.
-- Edge Function already validates admin status via isPlayzeAdmin() helper before calling RPC.
--
-- This follows the same pattern used for admin_reset_invitation_expiry
-- (fixed in migration 20251221182358_fix_invitation_edge_function_auth.sql)

CREATE OR REPLACE FUNCTION admin_cancel_invitation(p_invitation_id uuid)
RETURNS TABLE (id uuid, email text, status text)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- NOTE: Authorization is handled by Edge Function (isPlayzeAdmin check)
  -- This function is called with service-role, so is_playze_admin() would fail

  -- Check invitation exists and is pending
  IF NOT EXISTS (
    SELECT 1 FROM organization_invitations
    WHERE organization_invitations.id = p_invitation_id
    AND organization_invitations.status = 'pending'
  ) THEN
    RAISE EXCEPTION 'Invitation not found or already processed';
  END IF;

  RETURN QUERY
  UPDATE organization_invitations oi
  SET
    status = 'canceled',
    updated_at = now()
  WHERE oi.id = p_invitation_id
    AND oi.status = 'pending'
  RETURNING oi.id, oi.email, oi.status;
END;
$$;

COMMENT ON FUNCTION admin_cancel_invitation IS
'Cancels a pending invitation. Called via Edge Function which handles authorization.';

-- Grant execute to service_role (for Edge Functions)
GRANT EXECUTE ON FUNCTION admin_cancel_invitation(uuid) TO service_role;

-- Keep authenticated for backwards compatibility if called directly
GRANT EXECUTE ON FUNCTION admin_cancel_invitation(uuid) TO authenticated;
