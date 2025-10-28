-- =============================================================================
-- VALIDAI ROLE-BASED PERMISSIONS
-- =============================================================================
-- Description: Define role-based permissions for ValidAI app
-- Created: 2025-10-28
-- Part of: Phase 4 Task 6 - Authorization Framework
-- =============================================================================

-- -----------------------------------------------------------------------------
-- CREATE APP_ROLE_PERMISSIONS TABLE (if it doesn't exist)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app_role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id text NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(app_id, role)
);

-- Indexes
CREATE INDEX IF NOT EXISTS app_role_permissions_app_id_idx ON app_role_permissions(app_id);
CREATE INDEX IF NOT EXISTS app_role_permissions_role_idx ON app_role_permissions(role);

-- Trigger for updated_at
CREATE TRIGGER IF NOT EXISTS update_app_role_permissions_updated_at
  BEFORE UPDATE ON app_role_permissions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE app_role_permissions IS 'Role-based permissions per app - controls what users can do based on their organization role';
COMMENT ON COLUMN app_role_permissions.permissions IS 'JSONB: permission flags as boolean (e.g., {"can_edit": true, "can_delete": false})';

-- Enable RLS
ALTER TABLE app_role_permissions ENABLE ROW LEVEL SECURITY;

-- RLS policy: Public read access (used in authorization checks)
CREATE POLICY IF NOT EXISTS "Public read access for app_role_permissions"
  ON app_role_permissions FOR SELECT
  USING (true);

-- -----------------------------------------------------------------------------
-- DEFINE VALIDAI ROLE-BASED PERMISSIONS
-- -----------------------------------------------------------------------------
-- These permissions control what users can do based on their role in the organization

-- Owner: Full control
INSERT INTO app_role_permissions (app_id, role, permissions)
VALUES (
  'validai',
  'owner',
  jsonb_build_object(
    'can_view', true,
    'can_edit', true,
    'can_delete', true,
    'can_execute', true,
    'can_export', true,
    'can_manage_settings', true,
    'can_manage_members', true
  )
)
ON CONFLICT (app_id, role) DO UPDATE
SET
  permissions = EXCLUDED.permissions,
  updated_at = now();

-- Admin: Management without member control
INSERT INTO app_role_permissions (app_id, role, permissions)
VALUES (
  'validai',
  'admin',
  jsonb_build_object(
    'can_view', true,
    'can_edit', true,
    'can_delete', true,
    'can_execute', true,
    'can_export', true,
    'can_manage_settings', true,
    'can_manage_members', false
  )
)
ON CONFLICT (app_id, role) DO UPDATE
SET
  permissions = EXCLUDED.permissions,
  updated_at = now();

-- Member: Standard operations
INSERT INTO app_role_permissions (app_id, role, permissions)
VALUES (
  'validai',
  'member',
  jsonb_build_object(
    'can_view', true,
    'can_edit', true,
    'can_delete', false,
    'can_execute', true,
    'can_export', false,
    'can_manage_settings', false,
    'can_manage_members', false
  )
)
ON CONFLICT (app_id, role) DO UPDATE
SET
  permissions = EXCLUDED.permissions,
  updated_at = now();

-- Viewer: Read-only
INSERT INTO app_role_permissions (app_id, role, permissions)
VALUES (
  'validai',
  'viewer',
  jsonb_build_object(
    'can_view', true,
    'can_edit', false,
    'can_delete', false,
    'can_execute', false,
    'can_export', false,
    'can_manage_settings', false,
    'can_manage_members', false
  )
)
ON CONFLICT (app_id, role) DO UPDATE
SET
  permissions = EXCLUDED.permissions,
  updated_at = now();

-- -----------------------------------------------------------------------------
-- VERIFICATION
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  permission_count int;
BEGIN
  -- Verify 4 role permissions created
  SELECT COUNT(*) INTO permission_count
  FROM app_role_permissions
  WHERE app_id = 'validai';

  IF permission_count != 4 THEN
    RAISE EXCEPTION 'Expected 4 ValidAI role permissions, found %', permission_count;
  END IF;

  RAISE NOTICE 'ValidAI role permissions configured successfully!';
  RAISE NOTICE 'Roles: owner, admin, member, viewer';
END $$;

-- -----------------------------------------------------------------------------
-- COMMENTS
-- -----------------------------------------------------------------------------

COMMENT ON TABLE app_role_permissions IS 'Role-based permissions per app - controls what users can do based on their organization role';
