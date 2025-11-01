-- Add validation constraint for language field in user_preferences
-- This ensures only valid locale codes can be stored in the database
-- Part of Phase 1: Multi-Language Support Implementation

-- Drop constraint if it exists (for idempotency)
ALTER TABLE user_preferences
DROP CONSTRAINT IF EXISTS valid_language_code;

-- Add constraint to ensure data integrity
-- Only allow 'en' (English) and 'sv' (Swedish) language codes
ALTER TABLE user_preferences
ADD CONSTRAINT valid_language_code
CHECK (language IN ('en', 'sv'));

-- Note: This migration is required even though middleware uses cookie-only approach
-- The database field is updated when users explicitly switch languages via the UI
-- This constraint ensures data integrity for those updates
