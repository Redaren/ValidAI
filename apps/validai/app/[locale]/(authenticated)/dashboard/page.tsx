import { SessionInfoCard } from "@/components/session-info-card"
import { APP_NAME } from "@/lib/constants/app"
import { getTranslations } from 'next-intl/server'

export default async function DashboardPage() {
  const t = await getTranslations('dashboard')

  return (
    <>
      <div className="grid auto-rows-min gap-4 md:grid-cols-3">
        <div className="bg-muted/50 aspect-video rounded-xl flex items-center justify-center">
          <span className="text-muted-foreground">{t('card1')}</span>
        </div>
        <div className="bg-muted/50 aspect-video rounded-xl flex items-center justify-center">
          <span className="text-muted-foreground">{t('card2')}</span>
        </div>
        <div className="bg-muted/50 aspect-video rounded-xl flex items-center justify-center">
          <span className="text-muted-foreground">{t('card3')}</span>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="bg-muted/50 min-h-[50vh] rounded-xl flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-muted-foreground mb-2">
              {t('welcome')}
            </h1>
            <p className="text-muted-foreground">
              {t('ready')}
            </p>
          </div>
        </div>
        <SessionInfoCard />
      </div>
    </>
  )
}