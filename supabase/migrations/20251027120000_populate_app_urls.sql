-- Migration: Populate app_url field and disable non-existent apps
-- Created: 2025-10-27
-- Updated for ValidAI: 2026-01-13
-- Purpose:
--   1. Add URLs for existing apps (admin-portal, validai, testapp)
--   2. Disable non-existent apps
--
-- Background:
-- The AppSwitcher component currently uses hardcoded URL mappings.
-- This migration populates the app_url field in the apps table so URLs
-- can be managed in the database instead of hardcoded in components.
--
-- Verified Ports (from package.json files):
--   - validai: port 3000
--   - admin-portal: port 3001
--   - testapp: port 3003

-- -----------------------------------------------------------------------------
-- Update app URLs for existing apps
-- -----------------------------------------------------------------------------

-- ValidAI (port 3000)
UPDATE apps
SET app_url = 'http://localhost:3000'
WHERE id = 'validai';

-- Admin Portal (port 3001)
UPDATE apps
SET app_url = 'http://localhost:3001'
WHERE id = 'admin';

-- TestApp (port 3003) - if it exists in database
UPDATE apps
SET app_url = 'http://localhost:3003'
WHERE id = 'testapp';

-- -----------------------------------------------------------------------------
-- Disable non-existent apps
-- -----------------------------------------------------------------------------

UPDATE apps
SET
  is_active = false,
  app_url = NULL
WHERE id IN ('projectx', 'roadcloud');

-- Also deactivate any subscriptions to non-existent apps
UPDATE organization_app_subscriptions
SET status = 'canceled'
WHERE app_id IN ('projectx', 'roadcloud')
  AND status = 'active';

-- -----------------------------------------------------------------------------
-- Add admin app if it doesn't exist
-- -----------------------------------------------------------------------------

-- The admin portal needs to be in the database for URL management
-- even though it's not a "subscribed" app (access is via admin_users table)
INSERT INTO apps (id, name, description, app_url, is_active)
VALUES ('admin', 'Admin Portal', 'Platform administration interface', 'http://localhost:3001', true)
ON CONFLICT (id) DO UPDATE
SET
  app_url = EXCLUDED.app_url,
  is_active = EXCLUDED.is_active;

-- -----------------------------------------------------------------------------
-- Comments
-- -----------------------------------------------------------------------------

COMMENT ON COLUMN apps.app_url IS
'Base URL for the application. Used by AppSwitcher for navigation.
Development: http://localhost:PORT
Staging: https://[app].staging.validai.com
Production: https://[app].validai.com';

-- -----------------------------------------------------------------------------
-- Expected State After Migration:
-- - validai: http://localhost:3000 (active)
-- - admin: http://localhost:3001 (active)
-- - testapp: http://localhost:3003 (active, if exists)
-- - projectx, roadcloud: NULL (inactive)
-- -----------------------------------------------------------------------------
