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

  // Load all data initially to determine if we should use client or server mode
  // For small datasets (≤50), we can do instant client-side filtering
  // For large datasets (>50), we need server-side pagination
  const { data, isLoading, error } = useUserProcessors(false, {
    loadAll: true, // Always load all data initially (up to reasonable limit)
    search: '', // No search on initial load
    pageIndex: 0,
    pageSize: 1000, // Generous limit for client mode
  })

  // Determine mode based on total count
  // If we have all the data (totalCount ≤ 50), use client mode for instant filtering
  // If dataset is large (totalCount > 50), switch to server mode with pagination
  const totalCount = data?.totalCount ?? 0
  const shouldUseClientMode = totalCount > 0 && totalCount <= CLIENT_MODE_THRESHOLD
  const mode: 'client' | 'server' = shouldUseClientMode ? 'client' : 'server'

  // Handle errors
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="text-red-600">{t('failedList')}</p>
        <p className="text-sm text-muted-foreground mt-2">
          {error instanceof Error ? error.message : t('unknownError')}
        </p>
      </div>
    )
  }

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
        data={data?.processors ?? []}
        totalCount={totalCount}
        pageCount={data?.pageCount ?? 0}
        pageIndex={pageIndex}
        onPageChange={setPageIndex}
        searchValue={search}
        onSearchChange={setSearch}
        isLoading={isLoading}
        isEmpty={!isLoading && (!data?.processors || data.processors.length === 0)}
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