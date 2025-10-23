-- TestApp Database Registration
--
-- This script registers TestApp in the Playze Core platform database.
-- Execute this in the Supabase SQL Editor or via database migrations.
--
-- Prerequisites:
-- - Core Playze schema must be deployed (apps, app_tiers tables exist)
-- - Run this before attempting to use TestApp

BEGIN;

-- 1. Register the TestApp application
INSERT INTO apps (id, name, description, is_active)
VALUES (
  'testapp',
  'TestApp',
  'Minimal reference application for Playze Core platform - demonstrates standard user access patterns',
  true
)
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  is_active = EXCLUDED.is_active,
  updated_at = now();

-- 2. Create Free tier
INSERT INTO app_tiers (app_id, tier_name, display_name, description, features, limits)
VALUES (
  'testapp',
  'free',
  'Free',
  'Free tier with basic dashboard access',
  '{"dashboard_access": true, "basic_features": true}'::jsonb,
  '{"users": 5, "api_calls_per_month": 1000}'::jsonb
)
ON CONFLICT (app_id, tier_name) DO UPDATE
SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  features = EXCLUDED.features,
  limits = EXCLUDED.limits,
  updated_at = now();

-- 3. Create Pro tier (for future Phase 2 testing)
INSERT INTO app_tiers (app_id, tier_name, display_name, description, features, limits)
VALUES (
  'testapp',
  'pro',
  'Professional',
  'Professional tier with advanced features',
  '{"dashboard_access": true, "basic_features": true, "advanced_features": true, "priority_support": true, "professional_demo": true}'::jsonb,
  '{"users": 50, "api_calls_per_month": 50000}'::jsonb
)
ON CONFLICT (app_id, tier_name) DO UPDATE
SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  features = EXCLUDED.features,
  limits = EXCLUDED.limits,
  updated_at = now();

COMMIT;

-- Verification queries
SELECT
  id,
  name,
  description,
  is_active,
  created_at
FROM apps
WHERE id = 'testapp';

SELECT
  id,
  app_id,
  tier_name,
  display_name,
  description,
  features,
  limits,
  created_at
FROM app_tiers
WHERE app_id = 'testapp'
ORDER BY tier_name;

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ TestApp registered successfully!';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '1. Use Admin Portal to create a test organization';
  RAISE NOTICE '2. Assign testapp subscription (free tier) to the organization';
  RAISE NOTICE '3. Invite a test user to the organization';
  RAISE NOTICE '4. Configure apps/testapp/.env.local with Supabase credentials';
  RAISE NOTICE '5. Run: pnpm --filter @playze/testapp dev';
  RAISE NOTICE '6. Navigate to http://localhost:3003 and test login';
END $$;
