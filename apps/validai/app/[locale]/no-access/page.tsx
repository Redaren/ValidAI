import { Link } from '@/lib/i18n/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Button } from '@playze/shared-ui'
import { AlertCircle } from 'lucide-react'

export default function NoAccessPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertCircle className="h-6 w-6 text-destructive" />
            <CardTitle>No Access to ValidAI</CardTitle>
          </div>
          <CardDescription>
            Your organization doesn't have an active ValidAI subscription.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            ValidAI is available on Pro and Enterprise plans. Contact your organization
            administrator or platform support to upgrade your subscription.
          </p>
          <div className="flex gap-2">
            <Button variant="default" asChild>
              <a href="mailto:support@example.com?subject=ValidAI Access Request">
                Contact Support
              </a>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/">Back to Home</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
