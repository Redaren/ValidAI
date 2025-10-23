-- =============================================================================
-- PLAYZE CORE - PHASE 2: CORE SCHEMA MIGRATION
-- =============================================================================
-- Description: Core multi-tenant database schema for Playze platform
-- Created: 2025-01-17
-- Tables: 10 (organizations, members, apps, subscriptions, users, billing)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. UTILITY FUNCTIONS
-- -----------------------------------------------------------------------------

-- Function: update_updated_at_column()
-- Purpose: Auto-update updated_at timestamp on row updates
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- -----------------------------------------------------------------------------
-- 2. ORGANIZATIONS & MEMBERSHIP TABLES
-- -----------------------------------------------------------------------------

-- Table: organizations
-- Purpose: Core tenant entities (companies/teams)
CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX organizations_name_idx ON organizations(name);
CREATE INDEX organizations_active_idx ON organizations(is_active);

-- Trigger
CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE organizations IS 'Core tenant entities representing companies or teams';
COMMENT ON COLUMN organizations.name IS 'Organization display name (e.g., "Acme Corp")';
COMMENT ON COLUMN organizations.is_active IS 'Allows soft deactivation without deletion';

-- -----------------------------------------------------------------------------

-- Table: organization_members
-- Purpose: User memberships with roles per organization
CREATE TABLE organization_members (
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  joined_at timestamptz DEFAULT now(),
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  PRIMARY KEY (organization_id, user_id)
);

-- Indexes
CREATE INDEX organization_members_user_id_idx ON organization_members(user_id);
CREATE INDEX organization_members_role_idx ON organization_members(role);
CREATE INDEX organization_members_org_id_idx ON organization_members(organization_id);

COMMENT ON TABLE organization_members IS 'User memberships in organizations with roles';
COMMENT ON COLUMN organization_members.role IS 'owner=full control, admin=manage members, member=standard access, viewer=read-only';
COMMENT ON COLUMN organization_members.invited_by IS 'Tracks who invited this user (audit trail)';

-- -----------------------------------------------------------------------------

-- Table: organization_invitations
-- Purpose: Track pending invitations to organizations
CREATE TABLE organization_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'canceled')),
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  invited_at timestamptz DEFAULT now(),
  accepted_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX organization_invitations_email_idx ON organization_invitations(email);
CREATE INDEX organization_invitations_status_idx ON organization_invitations(status);
CREATE INDEX organization_invitations_org_id_idx ON organization_invitations(organization_id);
CREATE INDEX organization_invitations_expires_idx ON organization_invitations(expires_at)
  WHERE status = 'pending';

-- Trigger
CREATE TRIGGER update_organization_invitations_updated_at
  BEFORE UPDATE ON organization_invitations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE organization_invitations IS 'Pending invitations for invite-only B2B flow';
COMMENT ON COLUMN organization_invitations.status IS 'pending=awaiting acceptance, accepted=joined, expired=past expiry date, canceled=admin canceled';
COMMENT ON COLUMN organization_invitations.expires_at IS 'Invitations expire after 7 days by default';

-- -----------------------------------------------------------------------------
-- 3. APPS & SUBSCRIPTIONS TABLES
-- -----------------------------------------------------------------------------

-- Table: apps
-- Purpose: Catalog of all available applications
CREATE TABLE apps (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text,
  icon_url text,
  app_url text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX apps_active_idx ON apps(is_active);

-- Trigger
CREATE TRIGGER update_apps_updated_at
  BEFORE UPDATE ON apps
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE apps IS 'Catalog of all Playze applications (roadcloud, projectx, etc.)';
COMMENT ON COLUMN apps.id IS 'Text identifier used as table prefix (e.g., "roadcloud" → roadcloud_roads)';

-- -----------------------------------------------------------------------------

-- Table: app_tiers
-- Purpose: Subscription tiers (Free, Pro, Enterprise) per app
CREATE TABLE app_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id text NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  tier_name text NOT NULL CHECK (tier_name IN ('free', 'pro', 'enterprise')),
  display_name text NOT NULL,
  description text,
  features jsonb NOT NULL DEFAULT '{}'::jsonb,
  limits jsonb NOT NULL DEFAULT '{}'::jsonb,
  price_monthly numeric,
  price_yearly numeric,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(app_id, tier_name)
);

-- Indexes
CREATE INDEX app_tiers_app_id_idx ON app_tiers(app_id);
CREATE INDEX app_tiers_active_idx ON app_tiers(is_active);

-- Trigger
CREATE TRIGGER update_app_tiers_updated_at
  BEFORE UPDATE ON app_tiers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE app_tiers IS 'Subscription tiers with features and limits per app';
COMMENT ON COLUMN app_tiers.features IS 'JSONB: enabled features as boolean flags (e.g., {"export_reports": true})';
COMMENT ON COLUMN app_tiers.limits IS 'JSONB: usage limits as numbers (e.g., {"roads": 500}), -1 = unlimited';

-- -----------------------------------------------------------------------------

-- Table: organization_app_subscriptions
-- Purpose: Track org subscriptions to apps with tiers
CREATE TABLE organization_app_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  app_id text NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  tier_id uuid NOT NULL REFERENCES app_tiers(id),
  tier_name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'past_due', 'canceled', 'suspended')),
  billing_period_start timestamptz,
  billing_period_end timestamptz,
  last_invoice_date timestamptz,
  last_payment_date timestamptz,
  assigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_at timestamptz DEFAULT now(),
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(organization_id, app_id)
);

-- Indexes
CREATE INDEX org_app_subs_org_id_idx ON organization_app_subscriptions(organization_id);
CREATE INDEX org_app_subs_app_id_idx ON organization_app_subscriptions(app_id);
CREATE INDEX org_app_subs_status_idx ON organization_app_subscriptions(status);
CREATE INDEX org_app_subs_tier_id_idx ON organization_app_subscriptions(tier_id);

-- Trigger
CREATE TRIGGER update_organization_app_subscriptions_updated_at
  BEFORE UPDATE ON organization_app_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE organization_app_subscriptions IS 'Organization subscriptions to apps (one per app per org)';
COMMENT ON COLUMN organization_app_subscriptions.tier_name IS 'Denormalized for RLS policy performance';
COMMENT ON COLUMN organization_app_subscriptions.status IS 'Only "active" status grants app access';

-- -----------------------------------------------------------------------------

-- Table: organization_app_usage
-- Purpose: Track usage metrics per org per app for billing
CREATE TABLE organization_app_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES organization_app_subscriptions(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  app_id text NOT NULL REFERENCES apps(id),
  usage_type text NOT NULL,
  quantity numeric NOT NULL DEFAULT 0,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(subscription_id, usage_type, period_start, period_end)
);

-- Indexes
CREATE INDEX org_app_usage_sub_id_idx ON organization_app_usage(subscription_id);
CREATE INDEX org_app_usage_org_id_idx ON organization_app_usage(organization_id);
CREATE INDEX org_app_usage_app_id_idx ON organization_app_usage(app_id);
CREATE INDEX org_app_usage_period_idx ON organization_app_usage(period_start, period_end);
CREATE INDEX org_app_usage_type_idx ON organization_app_usage(usage_type);

-- Trigger
CREATE TRIGGER update_organization_app_usage_updated_at
  BEFORE UPDATE ON organization_app_usage
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE organization_app_usage IS 'Usage metrics per billing period for invoice generation';
COMMENT ON COLUMN organization_app_usage.usage_type IS 'e.g., "roads_created", "reports_exported", "api_calls"';
COMMENT ON COLUMN organization_app_usage.quantity IS 'Usage quantity, incremented atomically via database function';

-- -----------------------------------------------------------------------------
-- 4. USER MANAGEMENT TABLES
-- -----------------------------------------------------------------------------

-- Table: profiles
-- Purpose: Extended user profile information
CREATE TABLE profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  avatar_url text,
  bio text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX profiles_full_name_idx ON profiles(full_name);

-- Trigger
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE profiles IS 'Extended user profile data (complements auth.users)';
COMMENT ON COLUMN profiles.id IS 'Matches auth.users.id (one-to-one relationship)';

-- -----------------------------------------------------------------------------

-- Table: user_preferences
-- Purpose: User preferences shared across all apps
CREATE TABLE user_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  theme text DEFAULT 'system' CHECK (theme IN ('light', 'dark', 'system')),
  language text DEFAULT 'en',
  timezone text DEFAULT 'UTC',
  email_notifications boolean DEFAULT true,
  push_notifications boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Trigger
CREATE TRIGGER update_user_preferences_updated_at
  BEFORE UPDATE ON user_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE user_preferences IS 'Shared user preferences across all Playze apps';
COMMENT ON COLUMN user_preferences.theme IS 'UI theme preference (light/dark/system)';

-- -----------------------------------------------------------------------------
-- 5. BILLING TABLES
-- -----------------------------------------------------------------------------

-- Table: invoices
-- Purpose: Manual invoice generation and payment tracking (MVP)
CREATE TABLE invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  invoice_number text UNIQUE NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'overdue', 'canceled')),
  billing_period_start timestamptz NOT NULL,
  billing_period_end timestamptz NOT NULL,
  subtotal numeric NOT NULL,
  tax numeric DEFAULT 0,
  total numeric NOT NULL,
  currency text DEFAULT 'USD',
  line_items jsonb NOT NULL,
  issue_date timestamptz NOT NULL,
  due_date timestamptz NOT NULL,
  paid_date timestamptz,
  payment_method text,
  payment_reference text,
  notes text,
  pdf_url text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX invoices_org_id_idx ON invoices(organization_id);
CREATE INDEX invoices_status_idx ON invoices(status);
CREATE INDEX invoices_issue_date_idx ON invoices(issue_date);
CREATE INDEX invoices_due_date_idx ON invoices(due_date);
CREATE INDEX invoices_invoice_number_idx ON invoices(invoice_number);

-- Trigger
CREATE TRIGGER update_invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE invoices IS 'Manual invoice generation and payment tracking (no PSP in MVP)';
COMMENT ON COLUMN invoices.line_items IS 'JSONB: array of subscription line items with prices';
COMMENT ON COLUMN invoices.status IS 'draft→sent→paid workflow, manual tracking';

-- -----------------------------------------------------------------------------
-- 6. INITIAL SEED DATA
-- -----------------------------------------------------------------------------

-- Seed: Apps
INSERT INTO apps (id, name, description, is_active) VALUES
  ('roadcloud', 'RoadCloud', 'Road infrastructure management and inspection', true),
  ('projectx', 'ProjectX', 'Project management and collaboration', true);

-- Seed: App Tiers (RoadCloud)
INSERT INTO app_tiers (app_id, tier_name, display_name, description, features, limits, price_monthly) VALUES
  (
    'roadcloud',
    'free',
    'Free',
    'Basic road management for small teams',
    '{"basic_mapping": true, "advanced_mapping": false, "export_reports": false, "api_access": false}'::jsonb,
    '{"roads": 10, "users": 2, "storage_gb": 1}'::jsonb,
    0
  ),
  (
    'roadcloud',
    'pro',
    'Professional',
    'Advanced features for growing organizations',
    '{"basic_mapping": true, "advanced_mapping": true, "export_reports": true, "api_access": false}'::jsonb,
    '{"roads": 500, "users": 50, "storage_gb": 100}'::jsonb,
    99
  ),
  (
    'roadcloud',
    'enterprise',
    'Enterprise',
    'Unlimited access with premium support',
    '{"basic_mapping": true, "advanced_mapping": true, "export_reports": true, "api_access": true}'::jsonb,
    '{"roads": -1, "users": -1, "storage_gb": -1}'::jsonb,
    NULL
  );

-- Seed: App Tiers (ProjectX)
INSERT INTO app_tiers (app_id, tier_name, display_name, description, features, limits, price_monthly) VALUES
  (
    'projectx',
    'free',
    'Free',
    'Basic project management for small teams',
    '{"basic_projects": true, "tasks": true, "time_tracking": false, "gantt": false}'::jsonb,
    '{"projects": 5, "tasks": 50, "users": 2}'::jsonb,
    0
  ),
  (
    'projectx',
    'pro',
    'Professional',
    'Advanced project management with time tracking',
    '{"basic_projects": true, "tasks": true, "time_tracking": true, "gantt": true}'::jsonb,
    '{"projects": 100, "tasks": -1, "users": 50}'::jsonb,
    79
  ),
  (
    'projectx',
    'enterprise',
    'Enterprise',
    'Unlimited projects with custom workflows',
    '{"basic_projects": true, "tasks": true, "time_tracking": true, "gantt": true, "custom_workflows": true}'::jsonb,
    '{"projects": -1, "tasks": -1, "users": -1}'::jsonb,
    NULL
  );

-- =============================================================================
-- END OF MIGRATION
-- =============================================================================
