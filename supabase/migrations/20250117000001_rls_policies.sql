-- =============================================================================
-- PLAYZE CORE - PHASE 2: RLS POLICIES
-- =============================================================================
-- Description: Row Level Security policies for multi-tenant data isolation
-- Created: 2025-01-17
-- Security Model: Organization-based multi-tenancy
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. ENABLE RLS ON ALL TABLES
-- -----------------------------------------------------------------------------

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE apps ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_app_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_app_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 2. ORGANIZATIONS POLICIES
-- -----------------------------------------------------------------------------

-- Policy: Users can view organizations they are members of
CREATE POLICY "Users can view their organizations"
  ON organizations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members.organization_id = organizations.id
        AND organization_members.user_id = auth.uid()
    )
  );

-- Policy: Only owners can update organization details
CREATE POLICY "Owners can update organization details"
  ON organizations FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members.organization_id = organizations.id
        AND organization_members.user_id = auth.uid()
        AND organization_members.role = 'owner'
    )
  );

-- Policy: Only owners can delete organizations (soft delete recommended)
CREATE POLICY "Owners can delete organizations"
  ON organizations FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members.organization_id = organizations.id
        AND organization_members.user_id = auth.uid()
        AND organization_members.role = 'owner'
    )
  );

-- -----------------------------------------------------------------------------
-- 3. ORGANIZATION MEMBERS POLICIES
-- -----------------------------------------------------------------------------

-- Policy: Users can view members of their organizations
CREATE POLICY "Users can view members of their organizations"
  ON organization_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_members AS om
      WHERE om.organization_id = organization_members.organization_id
        AND om.user_id = auth.uid()
    )
  );

-- Policy: Admins and owners can invite members (handled by database function)
-- Note: INSERT is restricted to database functions for validation

-- Policy: Admins and owners can update member roles (via database function)
-- Note: UPDATE is restricted to database functions for validation

-- Policy: Admins and owners can remove members (via database function)
-- Note: DELETE is restricted to database functions for validation

-- -----------------------------------------------------------------------------
-- 4. ORGANIZATION INVITATIONS POLICIES
-- -----------------------------------------------------------------------------

-- Policy: Organization members can view invitations for their org
CREATE POLICY "Members can view organization invitations"
  ON organization_invitations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members.organization_id = organization_invitations.organization_id
        AND organization_members.user_id = auth.uid()
        AND organization_members.role IN ('owner', 'admin')
    )
  );

-- Policy: Admins and owners can create invitations
CREATE POLICY "Admins and owners can create invitations"
  ON organization_invitations FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members.organization_id = organization_invitations.organization_id
        AND organization_members.user_id = auth.uid()
        AND organization_members.role IN ('owner', 'admin')
    )
  );

-- Policy: Admins and owners can cancel invitations
CREATE POLICY "Admins and owners can cancel invitations"
  ON organization_invitations FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members.organization_id = organization_invitations.organization_id
        AND organization_members.user_id = auth.uid()
        AND organization_members.role IN ('owner', 'admin')
    )
  );

-- -----------------------------------------------------------------------------
-- 5. APPS & APP TIERS POLICIES (Public Read)
-- -----------------------------------------------------------------------------

-- Policy: All authenticated users can view apps
CREATE POLICY "Authenticated users can view apps"
  ON apps FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Policy: All authenticated users can view app tiers
CREATE POLICY "Authenticated users can view app tiers"
  ON app_tiers FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Note: Only Playze admins can modify apps/tiers (via service-role, not RLS)

-- -----------------------------------------------------------------------------
-- 6. ORGANIZATION APP SUBSCRIPTIONS POLICIES
-- -----------------------------------------------------------------------------

-- Policy: Users can view subscriptions of their organizations
CREATE POLICY "Users can view their organization subscriptions"
  ON organization_app_subscriptions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members.organization_id = organization_app_subscriptions.organization_id
        AND organization_members.user_id = auth.uid()
    )
  );

-- Note: Creating/updating subscriptions is admin-only (handled by Edge Functions with service-role)

-- -----------------------------------------------------------------------------
-- 7. ORGANIZATION APP USAGE POLICIES
-- -----------------------------------------------------------------------------

-- Policy: Users can view usage of their organizations
CREATE POLICY "Users can view their organization usage"
  ON organization_app_usage FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members.organization_id = organization_app_usage.organization_id
        AND organization_members.user_id = auth.uid()
    )
  );

-- Policy: Apps can insert/update usage via database functions
-- Note: INSERT/UPDATE restricted to database functions for atomic operations

-- -----------------------------------------------------------------------------
-- 8. PROFILES POLICIES
-- -----------------------------------------------------------------------------

-- Policy: Users can view all profiles (for member listings)
CREATE POLICY "Authenticated users can view profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (true);

-- Policy: Users can update their own profile
CREATE POLICY "Users can update their own profile"
  ON profiles FOR UPDATE
  USING (id = auth.uid());

-- -----------------------------------------------------------------------------
-- 9. USER PREFERENCES POLICIES
-- -----------------------------------------------------------------------------

-- Policy: Users can view their own preferences
CREATE POLICY "Users can view their own preferences"
  ON user_preferences FOR SELECT
  USING (user_id = auth.uid());

-- Policy: Users can update their own preferences
CREATE POLICY "Users can update their own preferences"
  ON user_preferences FOR UPDATE
  USING (user_id = auth.uid());

-- Policy: Users can insert their own preferences (first-time setup)
CREATE POLICY "Users can insert their own preferences"
  ON user_preferences FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- 10. INVOICES POLICIES
-- -----------------------------------------------------------------------------

-- Policy: Organization owners can view invoices
CREATE POLICY "Organization owners can view invoices"
  ON invoices FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members.organization_id = invoices.organization_id
        AND organization_members.user_id = auth.uid()
        AND organization_members.role = 'owner'
    )
  );

-- Note: Invoice creation/updates are admin-only (via Edge Functions with service-role)

-- =============================================================================
-- END OF RLS POLICIES
-- =============================================================================
