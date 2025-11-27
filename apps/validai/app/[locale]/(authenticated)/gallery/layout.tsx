"use client"

import { usePathname } from "@/lib/i18n/navigation"
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
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { useGalleryDetail } from '@/app/queries/galleries'

export default function GalleriesLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const t = useTranslations('breadcrumb')
  const pathname = usePathname()

  // Extract gallery ID from pathname for detail pages
  const detailMatch = pathname.match(/^\/gallery\/([^\/]+)$/)
  const galleryId = detailMatch?.[1] || null
  const isDetailPage = !!detailMatch

  // Fetch gallery data reactively (auto-updates when data loads)
  const { data: gallery } = useGalleryDetail(galleryId || '', {
    enabled: !!galleryId,
  })

  return (
    <div className="flex flex-col h-full">
        <header className="flex h-16 shrink-0 items-center gap-2">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator
              orientation="vertical"
              className="mr-2 data-[orientation=vertical]:h-4"
            />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  {isDetailPage ? (
                    <BreadcrumbLink href="/gallery">{t('galleries')}</BreadcrumbLink>
                  ) : (
                    <BreadcrumbPage>{t('galleries')}</BreadcrumbPage>
                  )}
                </BreadcrumbItem>
                {isDetailPage && (
                  <>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                      <BreadcrumbPage>
                        {gallery?.gallery_name || t('loading')}
                      </BreadcrumbPage>
                    </BreadcrumbItem>
                  </>
                )}
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </header>
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0 min-h-0">
          {children}
        </div>
    </div>
  )
}
