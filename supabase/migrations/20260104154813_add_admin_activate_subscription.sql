-- -----------------------------------------------------
-- ADMIN: ACTIVATE SUBSCRIPTION
-- -----------------------------------------------------
-- Reactivates a canceled subscription by setting status back to 'active'.
-- Used by Admin Portal to allow admins to reactivate subscriptions.
-- -----------------------------------------------------

CREATE OR REPLACE FUNCTION admin_activate_subscription(
  subscription_id uuid,
  activation_reason text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  organization_id uuid,
  app_id text,
  status text,
  notes text,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  activate_note text;
BEGIN
  -- Verify admin authorization
  IF NOT is_playze_admin() THEN
    RAISE EXCEPTION 'Not authorized: Only Playze admins can activate subscriptions';
  END IF;

  -- Build activation note
  activate_note := CASE
    WHEN activation_reason IS NOT NULL THEN 'Activated by admin: ' || activation_reason
    ELSE 'Activated by admin'
  END;

  -- Activate subscription
  RETURN QUERY
  UPDATE organization_app_subscriptions
  SET
    status = 'active',
    notes = activate_note,
    updated_at = now()
  WHERE organization_app_subscriptions.id = subscription_id
  RETURNING
    organization_app_subscriptions.id,
    organization_app_subscriptions.organization_id,
    organization_app_subscriptions.app_id,
    organization_app_subscriptions.status,
    organization_app_subscriptions.notes,
    organization_app_subscriptions.updated_at;
END;
$$;

COMMENT ON FUNCTION admin_activate_subscription IS
'Admin-only function to reactivate a canceled subscription. Bypasses RLS. Used by Admin Portal.';

-- Grant execute permission to authenticated users (admin check is inside function)
GRANT EXECUTE ON FUNCTION admin_activate_subscription(uuid, text) TO authenticated;
