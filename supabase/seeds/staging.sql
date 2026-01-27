-- =============================================================================
-- STAGING SEED DATA
-- =============================================================================
-- Purpose: Seed data for the persistent staging environment
-- Note: This data is applied when seeding the staging branch
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. TEST ORGANIZATIONS
-- -----------------------------------------------------------------------------
-- Create test organizations for staging environment testing
-- Using deterministic UUIDs for predictable references

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
-- 2. ENSURE VALIDAI APP IS REGISTERED
-- -----------------------------------------------------------------------------
-- The app registration should already exist from migrations, but ensure it's present

INSERT INTO apps (id, name, description, is_active)
VALUES
  ('validai', 'ValidAI', 'AI-powered document validation and processing', true)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  is_active = EXCLUDED.is_active;

-- -----------------------------------------------------------------------------
-- 3. ENSURE VALIDAI TIERS EXIST
-- -----------------------------------------------------------------------------

INSERT INTO app_tiers (app_id, tier_name, display_name, description, features, limits)
VALUES
  ('validai', 'free', 'Free', 'Basic validation features',
   '{"basic_validation": true}'::jsonb,
   '{"documents_per_month": 10, "processors": 2}'::jsonb),
  ('validai', 'pro', 'Professional', 'Advanced validation with AI features',
   '{"basic_validation": true, "ai_validation": true, "export": true}'::jsonb,
   '{"documents_per_month": 1000, "processors": 50}'::jsonb),
  ('validai', 'enterprise', 'Enterprise', 'Full feature access with priority support',
   '{"basic_validation": true, "ai_validation": true, "export": true, "api_access": true, "priority_support": true}'::jsonb,
   '{"documents_per_month": -1, "processors": -1}'::jsonb)
ON CONFLICT (app_id, tier_name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  features = EXCLUDED.features,
  limits = EXCLUDED.limits;

-- -----------------------------------------------------------------------------
-- 4. ASSIGN SUBSCRIPTIONS TO TEST ORGANIZATIONS
-- -----------------------------------------------------------------------------

-- Staging Test Org gets Pro tier
INSERT INTO organization_app_subscriptions (
  organization_id,
  app_id,
  tier_id,
  status,
  current_period_start,
  current_period_end
)
SELECT
  '00000000-0000-0000-0000-000000000001'::uuid,
  'validai',
  id,
  'active',
  now(),
  now() + interval '1 year'
FROM app_tiers
WHERE app_id = 'validai' AND tier_name = 'pro'
ON CONFLICT (organization_id, app_id) DO UPDATE SET
  tier_id = EXCLUDED.tier_id,
  status = EXCLUDED.status,
  current_period_end = EXCLUDED.current_period_end;

-- QA Team gets Enterprise tier
INSERT INTO organization_app_subscriptions (
  organization_id,
  app_id,
  tier_id,
  status,
  current_period_start,
  current_period_end
)
SELECT
  '00000000-0000-0000-0000-000000000002'::uuid,
  'validai',
  id,
  'active',
  now(),
  now() + interval '1 year'
FROM app_tiers
WHERE app_id = 'validai' AND tier_name = 'enterprise'
ON CONFLICT (organization_id, app_id) DO UPDATE SET
  tier_id = EXCLUDED.tier_id,
  status = EXCLUDED.status,
  current_period_end = EXCLUDED.current_period_end;

-- Demo Organization gets Free tier
INSERT INTO organization_app_subscriptions (
  organization_id,
  app_id,
  tier_id,
  status,
  current_period_start,
  current_period_end
)
SELECT
  '00000000-0000-0000-0000-000000000003'::uuid,
  'validai',
  id,
  'active',
  now(),
  now() + interval '1 year'
FROM app_tiers
WHERE app_id = 'validai' AND tier_name = 'free'
ON CONFLICT (organization_id, app_id) DO UPDATE SET
  tier_id = EXCLUDED.tier_id,
  status = EXCLUDED.status,
  current_period_end = EXCLUDED.current_period_end;

-- -----------------------------------------------------------------------------
-- NOTE: User data and memberships
-- -----------------------------------------------------------------------------
-- User records are created through Supabase Auth, not directly in the database.
-- When you sign up or are invited in the staging environment:
--   1. Create user through Supabase Auth (email/password or OAuth)
--   2. Use the admin portal to invite users to test organizations
--   3. Or use the switch-organization Edge Function to assign org context
--
-- For automated testing, you can create test users via Supabase Auth API:
--   supabase.auth.admin.createUser({ email: 'test@example.com', ... })
-- Then add them to organizations via the admin functions.
