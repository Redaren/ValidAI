"use client"

import { usePathname } from "next/navigation"
import { AppSidebar } from "@/components/app-sidebar"
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
  const pathname = usePathname()

  // Extract processor ID from pathname if on detail page
  const processorIdMatch = pathname.match(/^\/proc\/([^\/]+)$/)
  const processorId = processorIdMatch ? processorIdMatch[1] : null

  // Fetch processor data only if on detail page
  const { data: processor } = useProcessorDetail(processorId || "", {
    enabled: !!processorId,
  })

  const isDetailPage = !!processorId

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
                  {isDetailPage ? (
                    <BreadcrumbLink href="/proc">Processors</BreadcrumbLink>
                  ) : (
                    <BreadcrumbPage>Processors</BreadcrumbPage>
                  )}
                </BreadcrumbItem>
                {isDetailPage && (
                  <>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                      <BreadcrumbPage>
                        {processor?.processor_name || "Loading..."}
                      </BreadcrumbPage>
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