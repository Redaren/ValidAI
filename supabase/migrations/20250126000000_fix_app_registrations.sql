-- Migration: Fix App Registrations
-- Created: 2025-01-26
-- Purpose: Remove legacy Playze Core apps (RoadCloud, ProjectX) and register TestApp
--
-- Background:
-- The initial framework import from Playze Core (20250117000000_core_schema.sql) included
-- RoadCloud and ProjectX apps as seed data. These are not part of ValidAI Core Framework.
-- TestApp is the reference implementation that should be available for testing.
--
-- Changes:
-- 1. Deactivate RoadCloud and ProjectX (set is_active = false)
-- 2. Register TestApp with 3 tiers (free, pro, enterprise)
-- 3. ValidAI remains active and unchanged

-- -----------------------------------------------------------------------------
-- Step 1: Deactivate legacy Playze apps
-- -----------------------------------------------------------------------------

UPDATE apps
SET is_active = false,
    updated_at = now()
WHERE id IN ('roadcloud', 'projectx');

COMMENT ON COLUMN apps.is_active IS 'Controls app visibility in Admin Portal and subscription assignment';

-- -----------------------------------------------------------------------------
-- Step 2: Register TestApp
-- -----------------------------------------------------------------------------

INSERT INTO apps (id, name, description, is_active)
VALUES (
  'testapp',
  'TestApp',
  'Reference implementation and authorization demo for ValidAI Core Framework',
  true
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  is_active = EXCLUDED.is_active,
  updated_at = now();

-- -----------------------------------------------------------------------------
-- Step 3: Create TestApp Tiers
-- -----------------------------------------------------------------------------

-- Free Tier
INSERT INTO app_tiers (
  app_id,
  tier_name,
  display_name,
  description,
  features,
  limits,
  price_monthly,
  price_yearly,
  is_active
)
VALUES (
  'testapp',
  'free',
  'Free',
  'Basic features for testing authorization patterns',
  jsonb_build_object(
    'basic_access', true,
    'advanced_features', false,
    'export_data', false,
    'custom_config', false
  ),
  jsonb_build_object(
    'items', 10,
    'users', 2,
    'storage_mb', 100
  ),
  0,
  0,
  true
);

-- Pro Tier
INSERT INTO app_tiers (
  app_id,
  tier_name,
  display_name,
  description,
  features,
  limits,
  price_monthly,
  price_yearly,
  is_active
)
VALUES (
  'testapp',
  'pro',
  'Professional',
  'Advanced features for comprehensive testing',
  jsonb_build_object(
    'basic_access', true,
    'advanced_features', true,
    'export_data', true,
    'custom_config', false
  ),
  jsonb_build_object(
    'items', 1000,
    'users', 50,
    'storage_mb', 10000
  ),
  29,
  290,
  true
);

-- Enterprise Tier
INSERT INTO app_tiers (
  app_id,
  tier_name,
  display_name,
  description,
  features,
  limits,
  price_monthly,
  price_yearly,
  is_active
)
VALUES (
  'testapp',
  'enterprise',
  'Enterprise',
  'Full access with unlimited resources',
  jsonb_build_object(
    'basic_access', true,
    'advanced_features', true,
    'export_data', true,
    'custom_config', true,
    'priority_support', true
  ),
  jsonb_build_object(
    'items', -1,
    'users', -1,
    'storage_mb', -1
  ),
  99,
  990,
  true
);

-- -----------------------------------------------------------------------------
-- Verification Comments
-- -----------------------------------------------------------------------------

COMMENT ON TABLE apps IS 'Platform application catalog - ValidAI Core Framework apps only (ValidAI, TestApp)';
COMMENT ON TABLE app_tiers IS 'Subscription tiers with features and limits per app';

-- -----------------------------------------------------------------------------
-- Expected State After Migration:
-- Active apps: testapp, validai
-- Inactive apps: roadcloud, projectx (preserved for data integrity)
-- -----------------------------------------------------------------------------
