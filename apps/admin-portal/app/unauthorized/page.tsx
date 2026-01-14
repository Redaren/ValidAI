import { Button } from '@playze/shared-ui'
import Link from 'next/link'

export default function UnauthorizedPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center space-y-6 px-4">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold text-foreground">Access Denied</h1>
          <p className="text-xl text-muted-foreground">
            You do not have permission to access the Admin Portal.
          </p>
        </div>

        <div className="space-y-4 max-w-md mx-auto">
          <p className="text-sm text-muted-foreground">
            The ValidAI Admin Portal is restricted to authorized administrators only.
            If you believe you should have access, please contact your system administrator.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button asChild variant="default">
              <Link href="/">Try Again</Link>
            </Button>
            <Button asChild variant="outline">
              <a href="mailto:support@playze.com">Contact Support</a>
            </Button>
          </div>
        </div>

        <div className="pt-6 border-t">
          <p className="text-xs text-muted-foreground">
            If you are an admin and seeing this page, you may need to be added to the admin_users table.
          </p>
        </div>
      </div>
    </div>
  )
}
