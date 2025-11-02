import { Link } from '@/lib/i18n/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Button } from '@playze/shared-ui'
import { AlertCircle } from 'lucide-react'
import { getTranslations } from 'next-intl/server'

export default async function NoAccessPage() {
  const t = await getTranslations('noAccess')

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertCircle className="h-6 w-6 text-destructive" />
            <CardTitle>{t('title')}</CardTitle>
          </div>
          <CardDescription>
            {t('description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t('explanation')}
          </p>
          <div className="flex gap-2">
            <Button variant="default" asChild>
              <a href="mailto:support@example.com?subject=ValidAI Access Request">
                {t('contactSupport')}
              </a>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/">{t('backHome')}</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
