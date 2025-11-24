-- ==============================================================================
-- Migration: Create Galleries Feature
-- Created: 2025-11-24
-- Description: Creates galleries feature allowing users to organize processors
--              into themed collections with areas for business user access
-- ==============================================================================

-- ==============================================================================
-- ENUMS
-- ==============================================================================

-- Gallery status enum (same as processors)
CREATE TYPE gallery_status AS ENUM ('draft', 'published', 'archived');

-- Gallery visibility enum (same as processors)
CREATE TYPE gallery_visibility AS ENUM ('personal', 'organization');

-- ==============================================================================
-- TABLES
-- ==============================================================================

-- Main galleries table
CREATE TABLE validai_galleries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) >= 1 AND char_length(name) <= 255),
  description text CHECK (description IS NULL OR char_length(description) <= 500),
  icon text CHECK (icon IS NULL OR char_length(icon) <= 50),
  status gallery_status NOT NULL DEFAULT 'draft',
  visibility gallery_visibility NOT NULL DEFAULT 'personal',
  tags text[] CHECK (tags IS NULL OR array_length(tags, 1) <= 10),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,

  CONSTRAINT validai_galleries_icon_lucide CHECK (
    icon IS NULL OR icon ~ '^[a-z0-9-]+$'
  )
);

COMMENT ON TABLE validai_galleries IS 'Galleries organize processors into themed collections with areas for business users';
COMMENT ON COLUMN validai_galleries.name IS 'Gallery display name (1-255 characters)';
COMMENT ON COLUMN validai_galleries.description IS 'Gallery description (max 500 characters)';
COMMENT ON COLUMN validai_galleries.icon IS 'Lucide icon name (lowercase with hyphens)';
COMMENT ON COLUMN validai_galleries.status IS 'Gallery status: draft, published, or archived';
COMMENT ON COLUMN validai_galleries.visibility IS 'Who can see gallery: personal (creator only) or organization (all members)';
COMMENT ON COLUMN validai_galleries.tags IS 'Search/filter tags (max 10 tags)';
COMMENT ON COLUMN validai_galleries.deleted_at IS 'Soft delete timestamp';

-- Gallery areas table
CREATE TABLE validai_gallery_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gallery_id uuid NOT NULL REFERENCES validai_galleries(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) >= 1 AND char_length(name) <= 100),
  description text CHECK (description IS NULL OR char_length(description) <= 500),
  icon text CHECK (icon IS NULL OR char_length(icon) <= 50),
  display_order numeric NOT NULL CHECK (display_order > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT validai_gallery_areas_icon_lucide CHECK (
    icon IS NULL OR icon ~ '^[a-z0-9-]+$'
  ),
  CONSTRAINT validai_gallery_areas_unique_name_per_gallery UNIQUE (gallery_id, name)
);

COMMENT ON TABLE validai_gallery_areas IS 'Areas within galleries for organizing processors (e.g., Sales, HR, Compliance)';
COMMENT ON COLUMN validai_gallery_areas.name IS 'Area name (1-100 characters, unique per gallery)';
COMMENT ON COLUMN validai_gallery_areas.description IS 'Area description (max 500 characters)';
COMMENT ON COLUMN validai_gallery_areas.icon IS 'Lucide icon name (lowercase with hyphens)';
COMMENT ON COLUMN validai_gallery_areas.display_order IS 'Fractional position for drag-and-drop ordering';

-- Gallery area processors junction table
CREATE TABLE validai_gallery_area_processors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gallery_area_id uuid NOT NULL REFERENCES validai_gallery_areas(id) ON DELETE CASCADE,
  processor_id uuid NOT NULL REFERENCES validai_processors(id) ON DELETE CASCADE,
  position numeric NOT NULL CHECK (position > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT validai_gallery_area_processors_unique_processor_per_area UNIQUE (gallery_area_id, processor_id)
);

COMMENT ON TABLE validai_gallery_area_processors IS 'Junction table linking processors to gallery areas (many-to-many)';
COMMENT ON COLUMN validai_gallery_area_processors.position IS 'Fractional position for drag-and-drop ordering within area';

-- ==============================================================================
-- INDEXES
-- ==============================================================================

-- Performance indexes for galleries
CREATE INDEX idx_validai_galleries_org_id ON validai_galleries(organization_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_validai_galleries_status ON validai_galleries(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_validai_galleries_visibility ON validai_galleries(visibility) WHERE deleted_at IS NULL;
CREATE INDEX idx_validai_galleries_created_by ON validai_galleries(created_by) WHERE deleted_at IS NULL;
CREATE INDEX idx_validai_galleries_updated_at ON validai_galleries(updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_validai_galleries_tags ON validai_galleries USING gin(tags) WHERE deleted_at IS NULL AND tags IS NOT NULL;

-- Performance indexes for gallery areas
CREATE INDEX idx_validai_gallery_areas_gallery_id ON validai_gallery_areas(gallery_id);
CREATE INDEX idx_validai_gallery_areas_display_order ON validai_gallery_areas(gallery_id, display_order);

-- Performance indexes for gallery area processors
CREATE INDEX idx_validai_gallery_area_processors_area_id ON validai_gallery_area_processors(gallery_area_id);
CREATE INDEX idx_validai_gallery_area_processors_processor_id ON validai_gallery_area_processors(processor_id);
CREATE INDEX idx_validai_gallery_area_processors_position ON validai_gallery_area_processors(gallery_area_id, position);

-- ==============================================================================
-- RLS POLICIES
-- ==============================================================================

-- Enable RLS on all tables
ALTER TABLE validai_galleries ENABLE ROW LEVEL SECURITY;
ALTER TABLE validai_gallery_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE validai_gallery_area_processors ENABLE ROW LEVEL SECURITY;

-- Galleries RLS policies
CREATE POLICY "Users access galleries in their org with app access"
  ON validai_galleries FOR ALL
  USING (
    organization_id = (auth.jwt() -> 'app_metadata' ->> 'organization_id')::uuid
    AND deleted_at IS NULL
    AND (
      visibility = 'organization'
      OR (visibility = 'personal' AND created_by = auth.uid())
    )
  );

COMMENT ON POLICY "Users access galleries in their org with app access" ON validai_galleries IS
'Users can access galleries in their organization. Organization-wide galleries are visible to all members. Personal galleries only visible to creator.';

-- Gallery areas RLS policies
CREATE POLICY "Users access gallery areas through parent gallery"
  ON validai_gallery_areas FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM validai_galleries g
      WHERE g.id = validai_gallery_areas.gallery_id
        AND g.organization_id = (auth.jwt() -> 'app_metadata' ->> 'organization_id')::uuid
        AND g.deleted_at IS NULL
        AND (
          g.visibility = 'organization'
          OR (g.visibility = 'personal' AND g.created_by = auth.uid())
        )
    )
  );

COMMENT ON POLICY "Users access gallery areas through parent gallery" ON validai_gallery_areas IS
'Users can access gallery areas if they have access to the parent gallery';

-- Gallery area processors RLS policies
CREATE POLICY "Users access gallery area processors through parent area"
  ON validai_gallery_area_processors FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM validai_gallery_areas ga
      JOIN validai_galleries g ON g.id = ga.gallery_id
      WHERE ga.id = validai_gallery_area_processors.gallery_area_id
        AND g.organization_id = (auth.jwt() -> 'app_metadata' ->> 'organization_id')::uuid
        AND g.deleted_at IS NULL
        AND (
          g.visibility = 'organization'
          OR (g.visibility = 'personal' AND g.created_by = auth.uid())
        )
    )
  );

COMMENT ON POLICY "Users access gallery area processors through parent area" ON validai_gallery_area_processors IS
'Users can access processors in gallery areas if they have access to the parent gallery';

-- ==============================================================================
-- TRIGGERS
-- ==============================================================================

-- Auto-update updated_at timestamp for galleries
CREATE OR REPLACE FUNCTION update_validai_galleries_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_validai_galleries_updated_at
  BEFORE UPDATE ON validai_galleries
  FOR EACH ROW
  EXECUTE FUNCTION update_validai_galleries_updated_at();

-- Auto-update updated_at timestamp for gallery areas
CREATE OR REPLACE FUNCTION update_validai_gallery_areas_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_validai_gallery_areas_updated_at
  BEFORE UPDATE ON validai_gallery_areas
  FOR EACH ROW
  EXECUTE FUNCTION update_validai_gallery_areas_updated_at();

-- Auto-update updated_at timestamp for gallery area processors
CREATE OR REPLACE FUNCTION update_validai_gallery_area_processors_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_validai_gallery_area_processors_updated_at
  BEFORE UPDATE ON validai_gallery_area_processors
  FOR EACH ROW
  EXECUTE FUNCTION update_validai_gallery_area_processors_updated_at();

-- ==============================================================================
-- RPC FUNCTIONS
-- ==============================================================================

-- Get user galleries with metadata
CREATE OR REPLACE FUNCTION get_user_galleries(
  p_include_archived BOOLEAN DEFAULT false,
  p_limit INT DEFAULT 10,
  p_offset INT DEFAULT 0,
  p_search TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  description TEXT,
  icon TEXT,
  status gallery_status,
  visibility gallery_visibility,
  tags TEXT[],
  created_by UUID,
  creator_name TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  area_count BIGINT,
  processor_count BIGINT,
  is_owner BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH gallery_areas_count AS (
    SELECT
      ga.gallery_id,
      COUNT(DISTINCT ga.id) AS areas,
      COUNT(DISTINCT gap.processor_id) AS processors
    FROM validai_gallery_areas ga
    LEFT JOIN validai_gallery_area_processors gap ON ga.id = gap.gallery_area_id
    GROUP BY ga.gallery_id
  )
  SELECT
    g.id,
    g.name,
    g.description,
    g.icon,
    g.status,
    g.visibility,
    g.tags,
    g.created_by,
    prof.full_name,
    g.created_at,
    g.updated_at,
    COALESCE(gac.areas, 0),
    COALESCE(gac.processors, 0),
    g.created_by = auth.uid() AS is_owner
  FROM validai_galleries g
  LEFT JOIN profiles prof ON g.created_by = prof.id
  LEFT JOIN gallery_areas_count gac ON g.id = gac.gallery_id
  WHERE
    g.organization_id = (auth.jwt() -> 'app_metadata' ->> 'organization_id')::uuid
    AND g.deleted_at IS NULL
    AND (p_include_archived OR g.status != 'archived')
    AND (
      g.visibility = 'organization'
      OR (g.visibility = 'personal' AND g.created_by = auth.uid())
    )
    AND (
      p_search IS NULL
      OR g.name ILIKE '%' || p_search || '%'
      OR g.description ILIKE '%' || p_search || '%'
    )
  ORDER BY g.updated_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

COMMENT ON FUNCTION get_user_galleries(BOOLEAN, INT, INT, TEXT) IS
'Returns paginated list of galleries visible to current user with metadata and counts.
Supports pagination, search, and archived filtering.';

-- Get total count of user galleries (for pagination)
CREATE OR REPLACE FUNCTION get_user_galleries_count(
  p_include_archived BOOLEAN DEFAULT false,
  p_search TEXT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  total_count BIGINT;
BEGIN
  SELECT COUNT(*)
  INTO total_count
  FROM validai_galleries g
  WHERE
    g.organization_id = (auth.jwt() -> 'app_metadata' ->> 'organization_id')::uuid
    AND g.deleted_at IS NULL
    AND (p_include_archived OR g.status != 'archived')
    AND (
      g.visibility = 'organization'
      OR (g.visibility = 'personal' AND g.created_by = auth.uid())
    )
    AND (
      p_search IS NULL
      OR g.name ILIKE '%' || p_search || '%'
      OR g.description ILIKE '%' || p_search || '%'
    );

  RETURN total_count;
END;
$$;

COMMENT ON FUNCTION get_user_galleries_count(BOOLEAN, TEXT) IS
'Returns total count of galleries matching filter criteria for pagination UI.';

-- Get gallery detail with all areas and processors
CREATE OR REPLACE FUNCTION get_gallery_detail(
  p_gallery_id UUID
)
RETURNS TABLE (
  -- Gallery fields
  gallery_id UUID,
  gallery_name TEXT,
  gallery_description TEXT,
  gallery_icon TEXT,
  gallery_status gallery_status,
  gallery_visibility gallery_visibility,
  gallery_tags TEXT[],
  gallery_created_by UUID,
  gallery_creator_name TEXT,
  gallery_created_at TIMESTAMPTZ,
  gallery_updated_at TIMESTAMPTZ,
  gallery_is_owner BOOLEAN,
  -- Area fields
  area_id UUID,
  area_name TEXT,
  area_description TEXT,
  area_icon TEXT,
  area_display_order NUMERIC,
  -- Processor fields
  processor_id UUID,
  processor_name TEXT,
  processor_description TEXT,
  processor_usage_description TEXT,
  processor_status processor_status,
  processor_position NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    g.id,
    g.name,
    g.description,
    g.icon,
    g.status,
    g.visibility,
    g.tags,
    g.created_by,
    prof.full_name,
    g.created_at,
    g.updated_at,
    g.created_by = auth.uid() AS is_owner,
    -- Area fields
    ga.id,
    ga.name,
    ga.description,
    ga.icon,
    ga.display_order,
    -- Processor fields
    gap.processor_id,
    p.name,
    p.description,
    p.usage_description,
    p.status,
    gap.position
  FROM validai_galleries g
  LEFT JOIN profiles prof ON g.created_by = prof.id
  LEFT JOIN validai_gallery_areas ga ON g.id = ga.gallery_id
  LEFT JOIN validai_gallery_area_processors gap ON ga.id = gap.gallery_area_id
  LEFT JOIN validai_processors p ON gap.processor_id = p.id AND p.deleted_at IS NULL
  WHERE
    g.id = p_gallery_id
    AND g.organization_id = (auth.jwt() -> 'app_metadata' ->> 'organization_id')::uuid
    AND g.deleted_at IS NULL
    AND (
      g.visibility = 'organization'
      OR (g.visibility = 'personal' AND g.created_by = auth.uid())
    )
  ORDER BY ga.display_order, gap.position;
END;
$$;

COMMENT ON FUNCTION get_gallery_detail(UUID) IS
'Returns complete gallery details with all areas and processors.
Returns flat rows that should be transformed into nested structure client-side.';

-- ==============================================================================
-- GRANTS
-- ==============================================================================

-- Grant access to authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON validai_galleries TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON validai_gallery_areas TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON validai_gallery_area_processors TO authenticated;

-- Grant execute on functions
GRANT EXECUTE ON FUNCTION get_user_galleries(BOOLEAN, INT, INT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_galleries_count(BOOLEAN, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_gallery_detail(UUID) TO authenticated;

-- ==============================================================================
-- END OF MIGRATION
-- ==============================================================================
