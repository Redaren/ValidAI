import { Button } from '@playze/shared-ui'
import Link from 'next/link'

/**
 * Unauthorized Page
 *
 * Displayed when a user tries to access TestApp but:
 * - Their organization doesn't have a TestApp subscription
 * - They haven't been properly invited to an organization with access
 */
export default function UnauthorizedPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center space-y-6 px-4">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold text-foreground">Access Denied</h1>
          <p className="text-xl text-muted-foreground">
            You do not have access to TestApp.
          </p>
        </div>

        <div className="space-y-4 max-w-md mx-auto">
          <p className="text-sm text-muted-foreground">
            Your organization may not have a TestApp subscription, or you may need to be invited to an organization with access.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button asChild variant="default">
              <Link href="/login">Try Again</Link>
            </Button>
          </div>
        </div>

        <div className="pt-6 border-t">
          <p className="text-xs text-muted-foreground">
            Contact your organization administrator if you believe you should have access.
          </p>
        </div>
      </div>
    </div>
  )
}
