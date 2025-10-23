-- Migration: Admin Users Table
-- Purpose: Database-backed admin authorization for Admin Portal and Edge Functions
-- Created: 2025-01-20
-- Phase: 5A Part 1

-- =====================================================
-- ADMIN USERS TABLE
-- =====================================================

-- Table to track Playze administrators
-- Replaces hardcoded email whitelist with queryable database table
CREATE TABLE admin_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  notes text,

  CONSTRAINT admin_users_email_lowercase CHECK (email = lower(email))
);

-- =====================================================
-- INDEXES
-- =====================================================

-- Index for fast lookups by user_id
CREATE INDEX admin_users_user_id_idx ON admin_users(user_id);

-- Index for fast lookups by email (most common query)
CREATE INDEX admin_users_email_idx ON admin_users(email);

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================

-- Enable RLS on admin_users table
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

-- Policy: Only admins can read the admin list
-- This creates a circular dependency that's resolved via bootstrapping
-- First admin is created via direct SQL, then they can see the admin list
CREATE POLICY "Admins can read admin list"
  ON admin_users FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE email = (auth.jwt() ->> 'email')::text
    )
  );

-- Policy: Only admins can insert new admins
CREATE POLICY "Admins can create other admins"
  ON admin_users FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE email = (auth.jwt() ->> 'email')::text
    )
  );

-- Policy: Only admins can update admin records
CREATE POLICY "Admins can update admin records"
  ON admin_users FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE email = (auth.jwt() ->> 'email')::text
    )
  );

-- Policy: Only admins can delete admin records
CREATE POLICY "Admins can delete admin records"
  ON admin_users FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE email = (auth.jwt() ->> 'email')::text
    )
  );

-- =====================================================
-- HELPER FUNCTION
-- =====================================================

-- Function to check if current user is a Playze admin
-- Used by middleware, Edge Functions, and Admin Portal
CREATE OR REPLACE FUNCTION is_playze_admin()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM admin_users
    WHERE email = (auth.jwt() ->> 'email')::text
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON TABLE admin_users IS 'Playze administrators with access to Admin Portal and service-role operations';
COMMENT ON COLUMN admin_users.user_id IS 'Reference to auth.users - can be NULL if admin added before user exists';
COMMENT ON COLUMN admin_users.email IS 'Admin email address (lowercase enforced)';
COMMENT ON COLUMN admin_users.created_by IS 'Which admin added this admin (NULL for bootstrap admin)';
COMMENT ON COLUMN admin_users.notes IS 'Optional notes about this admin (e.g., "Bootstrap admin", "Engineering team lead")';
COMMENT ON FUNCTION is_playze_admin IS 'Returns true if current user is a Playze admin';

-- =====================================================
-- BOOTSTRAP INSTRUCTIONS
-- =====================================================

-- To create the first admin (run this ONCE in Supabase SQL Editor):
--
-- INSERT INTO admin_users (user_id, email, notes)
-- VALUES (
--   (SELECT id FROM auth.users WHERE email = 'admin@playze.com'),
--   'admin@playze.com',
--   'Bootstrap admin - created manually on 2025-01-20'
-- );
--
-- Replace 'admin@playze.com' with your actual admin email address.
-- The user must already exist in auth.users (created via Supabase Auth UI).
