"use client"

import { useState } from "react"
import { Plus } from "lucide-react"
import { Button } from "@playze/shared-ui"
import { ProcessorsTable } from "@/components/processors/processors-table"
import { CreateProcessorSheet } from "@/components/processors/create-processor-sheet"
import { useUserProcessors } from "@/app/queries/processors/use-processors"
import { useDebounce } from "@/hooks/use-debounce"
import { useTranslations } from 'next-intl'

export default function ProcessorsPage() {
  const t = useTranslations('processors')
  const tCommon = useTranslations('common')
  const [isCreateSheetOpen, setIsCreateSheetOpen] = useState(false)
  const [pageIndex, setPageIndex] = useState(0)
  const [search, setSearch] = useState('')

  // Debounce search to reduce API calls (300ms delay)
  const debouncedSearch = useDebounce(search, 300)

  const { data, isLoading, error } = useUserProcessors(false, {
    pageSize: 10,
    pageIndex,
    search: debouncedSearch,
  })

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
        totalCount={data?.totalCount ?? 0}
        pageCount={data?.pageCount ?? 0}
        pageIndex={pageIndex}
        onPageChange={setPageIndex}
        searchValue={search}
        onSearchChange={setSearch}
        isLoading={isLoading}
        isEmpty={!isLoading && (!data?.processors || data.processors.length === 0)}
        onCreateClick={() => setIsCreateSheetOpen(true)}
      />

      <CreateProcessorSheet
        open={isCreateSheetOpen}
        onOpenChange={setIsCreateSheetOpen}
      />
    </div>
  )
}