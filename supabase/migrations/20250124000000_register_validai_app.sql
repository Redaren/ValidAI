-- =============================================================================
-- REGISTER VALIDAI AS PLATFORM APPLICATION
-- =============================================================================
-- Description: Register ValidAI in apps catalog with tiers and permissions
-- Created: 2025-01-24
-- Risk: Low (data insertion only)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- REGISTER VALIDAI APPLICATION
-- -----------------------------------------------------------------------------

INSERT INTO apps (id, name, description, is_active)
VALUES (
  'validai',
  'ValidAI',
  'Document processing and validation platform powered by AI',
  true
)
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE apps IS 'Platform application catalog';

-- -----------------------------------------------------------------------------
-- CREATE VALIDAI TIERS
-- -----------------------------------------------------------------------------

-- Free Tier
INSERT INTO app_tiers (
  app_id,
  tier_name,
  display_name,
  features,
  limits,
  price_monthly,
  price_yearly
)
VALUES (
  'validai',
  'free',
  'Free',
  jsonb_build_object(
    'basic_processing', true,
    'export_reports', false,
    'custom_models', false,
    'advanced_operations', false
  ),
  jsonb_build_object(
    'processors', 5,
    'runs_per_month', 100,
    'documents', 10,
    'operations_per_processor', 10
  ),
  0,
  0
)
ON CONFLICT (app_id, tier_name) DO NOTHING;

-- Professional Tier
INSERT INTO app_tiers (
  app_id,
  tier_name,
  display_name,
  features,
  limits,
  price_monthly,
  price_yearly
)
VALUES (
  'validai',
  'pro',
  'Professional',
  jsonb_build_object(
    'basic_processing', true,
    'export_reports', true,
    'custom_models', false,
    'advanced_operations', true
  ),
  jsonb_build_object(
    'processors', 50,
    'runs_per_month', 10000,
    'documents', 1000,
    'operations_per_processor', 50
  ),
  49,
  490
)
ON CONFLICT (app_id, tier_name) DO NOTHING;

-- Enterprise Tier
INSERT INTO app_tiers (
  app_id,
  tier_name,
  display_name,
  features,
  limits,
  price_monthly,
  price_yearly
)
VALUES (
  'validai',
  'enterprise',
  'Enterprise',
  jsonb_build_object(
    'basic_processing', true,
    'export_reports', true,
    'custom_models', true,
    'advanced_operations', true,
    'priority_support', true,
    'custom_integrations', true
  ),
  jsonb_build_object(
    'processors', 999,
    'runs_per_month', 999999,
    'documents', 999999,
    'operations_per_processor', 999
  ),
  499,
  4990
)
ON CONFLICT (app_id, tier_name) DO NOTHING;

-- -----------------------------------------------------------------------------
-- CREATE PLATFORM ORGANIZATIONS FOR VALIDAI ORGS
-- -----------------------------------------------------------------------------
-- Strategy: Mirror validai_organizations in platform organizations table
-- This allows ValidAI orgs to participate in the platform ecosystem

INSERT INTO organizations (id, name, description, is_active, created_at, updated_at)
SELECT
  vo.id,
  vo.name,
  'ValidAI organization (migrated from Phase 1)' as description,
  true as is_active,
  vo.created_at,
  vo.updated_at
FROM validai_organizations vo
WHERE NOT EXISTS (
  SELECT 1 FROM organizations o WHERE o.id = vo.id
)
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- CREATE PLATFORM ORGANIZATION MEMBERS FOR VALIDAI MEMBERS
-- -----------------------------------------------------------------------------
-- Mirror validai_organization_members to platform organization_members

INSERT INTO organization_members (organization_id, user_id, role, joined_at)
SELECT
  vom.organization_id,
  vom.user_id,
  vom.role,
  vom.joined_at
FROM validai_organization_members vom
WHERE NOT EXISTS (
  SELECT 1 FROM organization_members om
  WHERE om.organization_id = vom.organization_id
    AND om.user_id = vom.user_id
)
ON CONFLICT (organization_id, user_id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- CREATE PLATFORM PROFILES FOR VALIDAI PROFILES
-- -----------------------------------------------------------------------------
-- Mirror validai_profiles to platform profiles

INSERT INTO profiles (id, full_name, avatar_url, created_at, updated_at)
SELECT
  vp.id,
  vp.full_name,
  vp.avatar_url,
  vp.created_at,
  vp.updated_at
FROM validai_profiles vp
WHERE NOT EXISTS (
  SELECT 1 FROM profiles p WHERE p.id = vp.id
)
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- ASSIGN VALIDAI TO EXISTING ORGANIZATIONS
-- -----------------------------------------------------------------------------
-- Give all ValidAI organizations a Free tier subscription

INSERT INTO organization_app_subscriptions (
  organization_id,
  app_id,
  tier_id,
  tier_name,
  status,
  billing_period_start,
  billing_period_end,
  notes
)
SELECT
  vo.id as organization_id,
  'validai' as app_id,
  (SELECT id FROM app_tiers WHERE app_id = 'validai' AND tier_name = 'free' LIMIT 1) as tier_id,
  'free' as tier_name,
  'active' as status,
  now() as billing_period_start,
  (now() + interval '1 year') as billing_period_end,
  'Automatically assigned during Phase 2 migration' as notes
FROM validai_organizations vo
WHERE NOT EXISTS (
  SELECT 1 FROM organization_app_subscriptions oas
  WHERE oas.organization_id = vo.id AND oas.app_id = 'validai'
)
ON CONFLICT (organization_id, app_id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- VERIFICATION
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  app_count int;
  tier_count int;
  subscription_count int;
BEGIN
  -- Verify ValidAI app registered
  SELECT COUNT(*) INTO app_count
  FROM apps
  WHERE id = 'validai';

  IF app_count = 0 THEN
    RAISE EXCEPTION 'ValidAI app not registered';
  END IF;

  -- Verify 3 tiers created
  SELECT COUNT(*) INTO tier_count
  FROM app_tiers
  WHERE app_id = 'validai';

  IF tier_count != 3 THEN
    RAISE EXCEPTION 'Expected 3 ValidAI tiers, found %', tier_count;
  END IF;

  -- Verify subscriptions created
  SELECT COUNT(*) INTO subscription_count
  FROM organization_app_subscriptions
  WHERE app_id = 'validai';

  RAISE NOTICE 'ValidAI registered successfully!';
  RAISE NOTICE 'Tiers: %', tier_count;
  RAISE NOTICE 'Subscriptions: %', subscription_count;
END $$;

-- -----------------------------------------------------------------------------
-- END REGISTRATION
-- -----------------------------------------------------------------------------
