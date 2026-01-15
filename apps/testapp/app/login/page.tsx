import { LoginPage } from '@playze/shared-ui'

/**
 * Login Page
 *
 * Uses the shared LoginPage component which handles:
 * 1. Normal login - shows MagicLinkLoginForm for email/magic link entry
 * 2. Org selection - shows OrgPickerLogin when ?select-org=true
 *
 * The OrgPickerLogin is shown when a user with multiple organizations
 * completes authentication and needs to select which org to use.
 */
export default function Page() {
  return <LoginPage appName="TestApp" dashboardPath="/dashboard" />
}
