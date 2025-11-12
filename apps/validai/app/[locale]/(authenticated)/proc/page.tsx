"use client"

import { useState } from "react"
import { Plus } from "lucide-react"
import { Button } from "@playze/shared-ui"
import { ProcessorsTable } from "@/components/processors/processors-table"
import { CreateProcessorSheet } from "@/components/processors/create-processor-sheet"
import { useUserProcessors } from "@/app/queries/processors/use-processors"
import { useDebounce } from "@/hooks/use-debounce"
import { useTranslations } from 'next-intl'

// Threshold for switching between client-side and server-side filtering
const CLIENT_MODE_THRESHOLD = 50

export default function ProcessorsPage() {
  const t = useTranslations('processors')
  const tCommon = useTranslations('common')
  const [isCreateSheetOpen, setIsCreateSheetOpen] = useState(false)
  const [pageIndex, setPageIndex] = useState(0)
  const [search, setSearch] = useState('')

  // Debounce search to reduce API calls (only used in server mode)
  const debouncedSearch = useDebounce(search, 300)

  // First query: Determine mode by checking total count
  const { data, isLoading, error } = useUserProcessors(false, {
    pageSize: 10,
    pageIndex: 0,
    search: '',
  })

  const totalCount = data?.totalCount ?? 0
  const shouldUseClientMode = totalCount > 0 && totalCount <= CLIENT_MODE_THRESHOLD

  // Second query: Fetch data based on mode
  const finalQuery = useUserProcessors(false, {
    pageSize: 10,
    pageIndex: shouldUseClientMode ? 0 : pageIndex,
    search: shouldUseClientMode ? undefined : debouncedSearch,
    loadAll: shouldUseClientMode,
  })

  const mode = shouldUseClientMode ? 'client' : 'server' as const

  // Handle errors from either query
  if (error || finalQuery.error) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="text-red-600">{t('failedList')}</p>
        <p className="text-sm text-muted-foreground mt-2">
          {error instanceof Error
            ? error.message
            : finalQuery.error instanceof Error
            ? finalQuery.error.message
            : t('unknownError')}
        </p>
      </div>
    )
  }

  // Use finalQuery for rendering (contains the actual data for current mode)
  const displayData = shouldUseClientMode ? finalQuery.data : finalQuery.data
  const displayLoading = isLoading || finalQuery.isLoading

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground">
            {t('description')}
          </p>
        </div>
        <Button onClick={() => setIsCreateSheetOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          {t('new')}
        </Button>
      </div>

      <ProcessorsTable
        data={displayData?.processors ?? []}
        totalCount={displayData?.totalCount ?? 0}
        pageCount={displayData?.pageCount ?? 0}
        pageIndex={pageIndex}
        onPageChange={setPageIndex}
        searchValue={search}
        onSearchChange={setSearch}
        isLoading={displayLoading}
        isEmpty={!displayLoading && (!displayData?.processors || displayData.processors.length === 0)}
        onCreateClick={() => setIsCreateSheetOpen(true)}
        mode={mode}
      />

      <CreateProcessorSheet
        open={isCreateSheetOpen}
        onOpenChange={setIsCreateSheetOpen}
      />
    </div>
  )
}