-- Fix: Filter inactive organizations from get_user_organizations()
-- Bug: OrgSwitcher was showing inactive orgs that couldn't be switched to

CREATE OR REPLACE FUNCTION get_user_organizations()
RETURNS TABLE (
  organization_id uuid,
  organization_name text,
  organization_description text,
  user_role text,
  joined_at timestamptz,
  is_active boolean
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    o.id,
    o.name,
    o.description,
    om.role,
    om.joined_at,
    o.is_active
  FROM organizations o
  JOIN organization_members om ON om.organization_id = o.id
  WHERE om.user_id = auth.uid()
    AND o.is_active = true  -- Only return active organizations
  ORDER BY o.name;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
