"use client"

import { usePathname } from "@/lib/i18n/navigation"
import { AppSidebar } from "@/components/app-sidebar"
import { useTranslations } from 'next-intl'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Separator } from "@/components/ui/separator"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { APP_NAME } from "@/lib/constants/app"
import { useProcessorDetail } from "@/app/queries/processors/use-processor-detail"

export default function ProcessorsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const t = useTranslations('breadcrumb')
  const pathname = usePathname()

  // Extract processor ID from pathname for detail, workbench, or runs pages
  const detailMatch = pathname.match(/^\/proc\/([^\/]+)$/)
  const workbenchMatch = pathname.match(/^\/proc\/([^\/]+)\/workbench$/)
  const runsMatch = pathname.match(/^\/proc\/([^\/]+)\/runs(?:\/([^\/]+))?$/)

  const processorId = detailMatch?.[1] || workbenchMatch?.[1] || runsMatch?.[1] || null
  const isWorkbenchPage = !!workbenchMatch
  const isRunsPage = !!runsMatch && !runsMatch[2] // runs list page
  const isRunDetailPage = !!runsMatch?.[2] // specific run detail page

  // Fetch processor data for all processor-related pages
  const { data: processor } = useProcessorDetail(processorId || "", {
    enabled: !!processorId,
  })

  const isDetailPage = !!detailMatch
  const hasProcessor = !!processorId

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator
              orientation="vertical"
              className="mr-2 data-[orientation=vertical]:h-4"
            />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href="/dashboard">
                    {APP_NAME}
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  {hasProcessor ? (
                    <BreadcrumbLink href="/proc">{t('processors')}</BreadcrumbLink>
                  ) : (
                    <BreadcrumbPage>{t('processors')}</BreadcrumbPage>
                  )}
                </BreadcrumbItem>
                {hasProcessor && (
                  <>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                      {isWorkbenchPage || isRunsPage || isRunDetailPage ? (
                        <BreadcrumbLink href={`/proc/${processorId}`}>
                          {processor?.processor_name || t('loading')}
                        </BreadcrumbLink>
                      ) : (
                        <BreadcrumbPage>
                          {processor?.processor_name || t('loading')}
                        </BreadcrumbPage>
                      )}
                    </BreadcrumbItem>
                  </>
                )}
                {isWorkbenchPage && (
                  <>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                      <BreadcrumbPage>{t('workbench')}</BreadcrumbPage>
                    </BreadcrumbItem>
                  </>
                )}
                {(isRunsPage || isRunDetailPage) && (
                  <>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                      {isRunDetailPage ? (
                        <BreadcrumbLink href={`/proc/${processorId}/runs`}>
                          {t('history')}
                        </BreadcrumbLink>
                      ) : (
                        <BreadcrumbPage>{t('history')}</BreadcrumbPage>
                      )}
                    </BreadcrumbItem>
                  </>
                )}
                {isRunDetailPage && (
                  <>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                      <BreadcrumbPage>{t('runDetail')}</BreadcrumbPage>
                    </BreadcrumbItem>
                  </>
                )}
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </header>
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}