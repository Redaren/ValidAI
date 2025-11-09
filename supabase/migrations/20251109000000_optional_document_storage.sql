-- Phase 1.9: Make Storage Optional
-- Make document_id nullable to support direct file uploads without Storage

-- Make document_id nullable (runs can exist without Storage)
ALTER TABLE validai_runs
  ALTER COLUMN document_id DROP NOT NULL;

-- Add storage_status tracking
ALTER TABLE validai_runs
  ADD COLUMN storage_status text NOT NULL DEFAULT 'not_stored';

-- Add comment
COMMENT ON COLUMN validai_runs.storage_status IS
  'Tracks whether document was stored in Supabase Storage. Values: not_stored (direct upload), completed (Storage upload)';

-- Update existing runs to have storage_status = 'completed' (they all have document_id)
UPDATE validai_runs
SET storage_status = 'completed'
WHERE document_id IS NOT NULL;
