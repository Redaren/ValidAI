/**
 * Compare View Component
 *
 * @module components/runs/compare-view
 * @description
 * Main component for run comparison feature. Fetches multiple runs and their
 * operation results, then displays them side-by-side in a comparison table.
 *
 * **Features:**
 * - Fetch multiple runs in parallel
 * - Fetch operation results for all runs
 * - Validate all runs belong to same processor
 * - Display comparison table with area grouping
 * - Export functionality (PDF, Excel)
 * - Loading and error states
 *
 * **Data Structure:**
 * - Groups operations by area from processor snapshot
 * - Matches operation results across runs by operation_id
 * - Handles missing results gracefully
 *
 * @since Phase 1.11 - Run Comparison Feature
 */

'use client'

import * as React from 'react'
import { useRouter } from '@/lib/i18n/navigation'
import { useMultipleRuns, useMultipleRunResults } from '@/app/queries/runs'
import { useProcessorDetail } from '@/app/queries/processors/use-processor-detail'
import { Button } from '@playze/shared-ui'
import { ArrowLeft, Download, Copy, GitCompareArrows } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { CompareTable } from './compare-table'
import type { Database } from '@playze/shared-types'
import { exportToClipboard, exportToPDF } from '@/lib/export/compare-export'
import { useToastStore } from '@/stores'

type Run = Database['public']['Tables']['validai_runs']['Row']
type OperationResult = Database['public']['Tables']['validai_operation_results']['Row']

interface CompareViewProps {
  processorId: string
  runIds: string[]
}

interface OperationSnapshot {
  id: string
  name: string
  area: string
  operation_type: string
  prompt: string
  [key: string]: unknown
}

interface ProcessorSnapshot {
  processor: {
    id: string
    name: string
  }
  document: {
    id: string
    name: string
    size_bytes: number
  }
  operations: OperationSnapshot[]
}

/**
 * Compare View
 *
 * Displays side-by-side comparison of 2-5 runs with their operation results.
 * Groups operations by area and shows compact results with modal expansion.
 *
 * @param processorId - Processor ID for validation and breadcrumbs
 * @param runIds - Array of run IDs to compare (2-5)
 * @returns Comparison view with table and export options
 */
export function CompareView({ processorId, runIds }: CompareViewProps) {
  const router = useRouter()
  const t = useTranslations('runs.compare')
  const tCommon = useTranslations('common')
  const addToast = useToastStore((state) => state.addToast)

  // Fetch processor details for context
  const { data: processor, isLoading: processorLoading } = useProcessorDetail(processorId)

  // Fetch all runs
  const { runs, isLoading: runsLoading, isError: runsError } = useMultipleRuns(runIds)

  // Fetch operation results for all runs
  const {
    resultsMap,
    isLoading: resultsLoading,
    isError: resultsError,
  } = useMultipleRunResults(runIds)

  // Validate all runs belong to same processor
  React.useEffect(() => {
    if (runs.length > 0) {
      const allSameProcessor = runs.every((run) => run.processor_id === processorId)
      if (!allSameProcessor) {
        // Redirect back to runs page
        router.push(`/proc/${processorId}/runs`)
      }
    }
  }, [runs, processorId, router])

  const handleExportPDF = () => {
    if (runs.length === 0 || !processor) return

    exportToPDF(runs, resultsMap, String(processor.name))

    addToast({
      title: 'PDF Downloaded',
      description: 'The comparison has been exported to PDF',
      variant: 'success',
    })
  }

  const handleCopyToExcel = async () => {
    if (runs.length === 0) return

    try {
      await exportToClipboard(runs, resultsMap)

      addToast({
        title: 'Copied to Clipboard',
        description: t('copiedToClipboard'),
        variant: 'success',
      })
    } catch (error) {
      addToast({
        title: 'Error',
        description: 'Failed to copy to clipboard',
        variant: 'destructive',
      })
    }
  }

  // Loading state
  if (runsLoading || resultsLoading || processorLoading) {
    return (
      <div className="container max-w-screen-2xl py-8">
        <div className="flex min-h-[400px] items-center justify-center">
          <div className="text-center">
            <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent" />
            <p className="text-sm text-muted-foreground">{t('loadingComparison')}</p>
          </div>
        </div>
      </div>
    )
  }

  // Error state
  if (runsError || resultsError) {
    return (
      <div className="container max-w-screen-2xl py-8">
        <div className="flex min-h-[400px] flex-col items-center justify-center gap-4">
          <p className="text-sm text-destructive">
            {tCommon('error.loadingData')}
          </p>
          <Button
            variant="outline"
            onClick={() => router.push(`/proc/${processorId}/runs`)}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t('backToHistory')}
          </Button>
        </div>
      </div>
    )
  }

  // Validate we have all the data
  if (runs.length === 0 || Object.keys(resultsMap).length === 0) {
    return (
      <div className="container max-w-screen-2xl py-8">
        <div className="flex min-h-[400px] flex-col items-center justify-center gap-4">
          <p className="text-sm text-muted-foreground">{t('invalidRunIds')}</p>
          <Button
            variant="outline"
            onClick={() => router.push(`/proc/${processorId}/runs`)}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t('backToHistory')}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="container max-w-screen-2xl pb-8">
      <div className="mb-8 space-y-4">
        {/* Header with Actions */}
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <GitCompareArrows className="h-6 w-6" />
              <h1 className="text-2xl font-bold">{t('title')}</h1>
            </div>
            <p className="text-sm text-muted-foreground">
              {t('description', { count: runs.length })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleCopyToExcel} className="gap-2">
              <Copy className="h-4 w-4" />
              {t('copyToExcel')}
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportPDF} className="gap-2">
              <Download className="h-4 w-4" />
              {t('exportToPDF')}
            </Button>
          </div>
        </div>
      </div>

      {/* Comparison Table */}
      <CompareTable runs={runs} resultsMap={resultsMap} />
    </div>
  )
}
