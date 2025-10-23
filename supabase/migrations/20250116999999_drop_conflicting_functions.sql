-- =============================================================================
-- DROP CONFLICTING ITEMS BEFORE PLAYZE CORE IMPORT
-- =============================================================================
-- Description: Drop ValidAI functions and policies that conflict with Playze Core
-- Created: 2025-01-23
-- Risk: Low (will be recreated by Playze Core migrations with enhanced functionality)
-- =============================================================================

-- Drop ValidAI versions of functions that will be replaced by Playze Core
DROP FUNCTION IF EXISTS get_user_organizations();
DROP FUNCTION IF EXISTS has_app_access(text);
DROP FUNCTION IF EXISTS user_organization_id();

-- Drop ValidAI RLS policies that will conflict with Playze Core
-- Organizations table policies
DROP POLICY IF EXISTS "Users can view their organizations" ON organizations;
DROP POLICY IF EXISTS "Members can view their organizations" ON organizations;
DROP POLICY IF EXISTS "Owners can update organizations" ON organizations;
DROP POLICY IF EXISTS "Admins can update organizations" ON organizations;

-- Organization members policies
DROP POLICY IF EXISTS "Users can view members of their organizations" ON organization_members;
DROP POLICY IF EXISTS "Owners can manage members" ON organization_members;
DROP POLICY IF EXISTS "Admins can manage members" ON organization_members;

-- Profiles policies
DROP POLICY IF EXISTS "Users can view their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;

-- Note: Playze Core will create comprehensive RLS policies with admin bypass support
