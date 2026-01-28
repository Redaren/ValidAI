-- =============================================================================
-- STAGING SEED DATA (AUDITED)
-- =============================================================================
-- Purpose: Seed data for the persistent staging environment
-- Note: Apps and tiers already exist from migrations - DO NOT recreate
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. ADMIN USERS (Required for Admin Portal access)
-- -----------------------------------------------------------------------------

INSERT INTO admin_users (email, notes)
VALUES ('johan.mardfelt@olivab.se', 'Core platform administrator')
ON CONFLICT (email) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 2. TEST ORGANIZATIONS
-- -----------------------------------------------------------------------------

INSERT INTO organizations (id, name, description, is_active)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'Staging Test Org', 'Primary test organization for staging environment', true),
  ('00000000-0000-0000-0000-000000000002', 'QA Team Org', 'Organization for QA team testing', true),
  ('00000000-0000-0000-0000-000000000003', 'Demo Organization', 'Demo organization for showcasing features', true)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  is_active = EXCLUDED.is_active;

-- -----------------------------------------------------------------------------
-- 3. ORGANIZATION MEMBERS (link users to organizations)
-- -----------------------------------------------------------------------------
-- Note: User ID is from staging auth.users table (johan.mardfelt@olivab.se)

-- Add admin user as owner of Staging Test Org
INSERT INTO organization_members (user_id, organization_id, role, is_active)
VALUES (
  'ea050d4c-6204-4b37-94a1-f335112c71ba'::uuid,  -- johan.mardfelt@olivab.se in staging
  '00000000-0000-0000-0000-000000000001'::uuid,   -- Staging Test Org
  'owner',
  true
)
ON CONFLICT (user_id, organization_id) DO UPDATE SET
  role = EXCLUDED.role,
  is_active = EXCLUDED.is_active;

-- Also add to Demo Organization for testing multiple orgs
INSERT INTO organization_members (user_id, organization_id, role, is_active)
VALUES (
  'ea050d4c-6204-4b37-94a1-f335112c71ba'::uuid,
  '00000000-0000-0000-0000-000000000003'::uuid,   -- Demo Organization
  'admin',
  true
)
ON CONFLICT (user_id, organization_id) DO UPDATE SET
  role = EXCLUDED.role,
  is_active = EXCLUDED.is_active;

-- -----------------------------------------------------------------------------
-- 4. SUBSCRIPTIONS (link orgs to existing tiers)
-- -----------------------------------------------------------------------------
-- Note: apps and app_tiers already exist from migrations
-- IMPORTANT: tier_name is a required NOT NULL column

-- Staging Test Org gets Pro tier
INSERT INTO organization_app_subscriptions (
  organization_id, app_id, tier_id, tier_name, status, billing_period_start, billing_period_end
)
SELECT
  '00000000-0000-0000-0000-000000000001'::uuid, 'validai', id, tier_name, 'active', now(), now() + interval '1 year'
FROM app_tiers WHERE app_id = 'validai' AND tier_name = 'pro'
ON CONFLICT (organization_id, app_id) DO UPDATE SET
  tier_id = EXCLUDED.tier_id, tier_name = EXCLUDED.tier_name, status = EXCLUDED.status, billing_period_end = EXCLUDED.billing_period_end;

-- QA Team gets Enterprise tier
INSERT INTO organization_app_subscriptions (
  organization_id, app_id, tier_id, tier_name, status, billing_period_start, billing_period_end
)
SELECT
  '00000000-0000-0000-0000-000000000002'::uuid, 'validai', id, tier_name, 'active', now(), now() + interval '1 year'
FROM app_tiers WHERE app_id = 'validai' AND tier_name = 'enterprise'
ON CONFLICT (organization_id, app_id) DO UPDATE SET
  tier_id = EXCLUDED.tier_id, tier_name = EXCLUDED.tier_name, status = EXCLUDED.status, billing_period_end = EXCLUDED.billing_period_end;

-- Demo Organization gets Free tier
INSERT INTO organization_app_subscriptions (
  organization_id, app_id, tier_id, tier_name, status, billing_period_start, billing_period_end
)
SELECT
  '00000000-0000-0000-0000-000000000003'::uuid, 'validai', id, tier_name, 'active', now(), now() + interval '1 year'
FROM app_tiers WHERE app_id = 'validai' AND tier_name = 'free'
ON CONFLICT (organization_id, app_id) DO UPDATE SET
  tier_id = EXCLUDED.tier_id, tier_name = EXCLUDED.tier_name, status = EXCLUDED.status, billing_period_end = EXCLUDED.billing_period_end;
