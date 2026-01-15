import { UnauthorizedPage } from '@playze/shared-ui'

/**
 * Unauthorized Page
 *
 * Uses the shared UnauthorizedPage component which is displayed when
 * a user tries to access TestApp but:
 * - Their organization doesn't have a TestApp subscription
 * - They haven't been properly invited to an organization with access
 */
export default function Page() {
  return <UnauthorizedPage appName="TestApp" />
}
