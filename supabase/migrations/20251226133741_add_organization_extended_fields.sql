-- Migration: Add extended fields to organizations table
-- Purpose: Support invoicing and CRM requirements for organizations
-- Created: 2025-12-26

-- =====================================================
-- ADD NEW COLUMNS TO ORGANIZATIONS TABLE
-- =====================================================

-- Legal/Invoicing fields
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS org_number text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS vat_number text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS street_address text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS postal_code text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS country text;

-- Contact details
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS contact_person text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS contact_role text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS contact_email text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS contact_phone text;

-- Internal/Misc fields
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS referral text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS lead_source text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS kam text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);

-- =====================================================
-- INDEXES
-- =====================================================

-- Index for created_by lookups (who created this org)
CREATE INDEX IF NOT EXISTS organizations_created_by_idx ON organizations(created_by);

-- Index for country filtering (common query pattern)
CREATE INDEX IF NOT EXISTS organizations_country_idx ON organizations(country);

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON COLUMN organizations.org_number IS 'Organization/company registration number (e.g., Swedish format 556123-4567)';
COMMENT ON COLUMN organizations.vat_number IS 'VAT registration number for invoicing (e.g., EU format SE556123456701)';
COMMENT ON COLUMN organizations.street_address IS 'Street address for invoicing';
COMMENT ON COLUMN organizations.postal_code IS 'Postal/ZIP code';
COMMENT ON COLUMN organizations.city IS 'City name';
COMMENT ON COLUMN organizations.country IS 'ISO 3166-1 alpha-2 country code (e.g., SE, NO, FI)';
COMMENT ON COLUMN organizations.contact_person IS 'Primary contact person name';
COMMENT ON COLUMN organizations.contact_role IS 'Role/title of the contact person';
COMMENT ON COLUMN organizations.contact_email IS 'Contact email address (required for communication)';
COMMENT ON COLUMN organizations.contact_phone IS 'Contact phone number';
COMMENT ON COLUMN organizations.referral IS 'How they found us / referral source';
COMMENT ON COLUMN organizations.lead_source IS 'Marketing attribution / lead source';
COMMENT ON COLUMN organizations.kam IS 'Key Account Manager responsible for this organization';
COMMENT ON COLUMN organizations.created_by IS 'User ID of the admin who created this organization';
