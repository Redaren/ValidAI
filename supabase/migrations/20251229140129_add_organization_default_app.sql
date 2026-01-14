-- Migration: Add default_app_id to organizations
-- Purpose: Allow organizations to specify which app invited users should be redirected to
-- Created: 2025-12-29

-- =====================================================
-- ADD DEFAULT_APP_ID COLUMN
-- =====================================================

-- Add column with foreign key to apps table (idempotent)
ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS default_app_id text REFERENCES apps(id) ON DELETE SET NULL;

-- Add index for efficient lookups (idempotent)
CREATE INDEX IF NOT EXISTS organizations_default_app_idx ON organizations(default_app_id);

-- Add comment explaining the column
COMMENT ON COLUMN organizations.default_app_id IS
'The default app to redirect invited users to. If NULL, falls back to SITE_URL.';
