-- Migration: Fix is_playze_admin() email extraction
-- Purpose: Use auth.email() helper instead of direct JWT access for better compatibility
-- Created: 2025-01-20
-- Issue: Organizations not showing for admins because email extraction from JWT was incorrect

-- =====================================================
-- FIX: Update is_playze_admin() function
-- =====================================================

-- The original function used auth.jwt() ->> 'email' which doesn't work correctly
-- with browser client sessions. Use auth.email() helper instead.
CREATE OR REPLACE FUNCTION is_playze_admin()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM admin_users
    WHERE email = auth.email()
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION is_playze_admin IS 'Returns true if current user is a Playze admin (using auth.email() helper)';
