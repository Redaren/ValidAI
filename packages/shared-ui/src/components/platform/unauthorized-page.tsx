import Link from 'next/link'
import { Button } from '../ui/button'

export interface UnauthorizedPageProps {
  /** Application name to display in the error message */
  appName: string
  /** Path to login page (default: '/login') */
  loginPath?: string
  /** Custom message to display instead of the default */
  message?: string
  /** Whether to show "Contact your administrator" message (default: true) */
  showContactAdmin?: boolean
  /** Additional CSS classes */
  className?: string
}

/**
 * Unauthorized Page Component
 *
 * Displayed when a user tries to access an app but:
 * - Their organization doesn't have a subscription to the app
 * - They haven't been properly invited to an organization with access
 */
export function UnauthorizedPage({
  appName,
  loginPath = '/login',
  message,
  showContactAdmin = true,
  className,
}: UnauthorizedPageProps) {
  const defaultMessage = `Your organization may not have a ${appName} subscription, or you may need to be invited to an organization with access.`

  return (
    <div className={`flex min-h-screen items-center justify-center bg-background ${className || ''}`}>
      <div className="text-center space-y-6 px-4">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold text-foreground">Access Denied</h1>
          <p className="text-xl text-muted-foreground">
            You do not have access to {appName}.
          </p>
        </div>

        <div className="space-y-4 max-w-md mx-auto">
          <p className="text-sm text-muted-foreground">
            {message || defaultMessage}
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button asChild variant="default">
              <Link href={loginPath}>Try Again</Link>
            </Button>
          </div>
        </div>

        {showContactAdmin && (
          <div className="pt-6 border-t">
            <p className="text-xs text-muted-foreground">
              Contact your organization administrator if you believe you should have access.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
