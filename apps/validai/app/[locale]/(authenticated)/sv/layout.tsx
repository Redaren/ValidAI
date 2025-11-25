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
import { useQueryClient } from '@tanstack/react-query'
import type { GalleryDetail } from '@/app/queries/galleries'

export default function SharedViewLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const t = useTranslations('breadcrumb')
  const pathname = usePathname()

  // Extract gallery ID from pathname for shared view pages
  const sharedViewMatch = pathname.match(/^\/sv\/([^\/]+)$/)
  const galleryId = sharedViewMatch?.[1] || null
  const isSharedViewPage = !!sharedViewMatch

  // Read cached gallery data (non-reactive, no fetch - prevents race condition)
  const queryClient = useQueryClient()
  const gallery = queryClient.getQueryData<GalleryDetail>(['gallery', galleryId])

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
                  <BreadcrumbLink href="/gallery">{t('galleries')}</BreadcrumbLink>
                </BreadcrumbItem>
                {isSharedViewPage && (
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
