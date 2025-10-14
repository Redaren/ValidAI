/**
 * Run Detail Page
 *
 * @module app/proc/[id]/runs/[run_id]/page
 * @description
 * Displays detailed information about a specific processor run.
 * Shows real-time progress updates, operation results, and execution metadata.
 *
 * **Features:**
 * - Real-time progress updates via Supabase Realtime
 * - Run metadata and status
 * - Operation results table with expandable rows
 * - Automatic refetching during processing
 *
 * **Route:** `/proc/[id]/runs/[run_id]`
 *
 * @since Phase 1.8
 */

'use client'

import { use } from 'react'
import { useRun, useOperationResults } from '@/app/queries/runs'
import { RunDetailHeader } from '@/components/runs/run-detail-header'
import { OperationResultsTable } from '@/components/runs/operation-results-table'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'

/**
 * Props for the RunDetailPage component
 */
interface RunDetailPageProps {
  /** Route parameters */
  params: Promise<{
    /** Processor ID from URL */
    id: string
    /** Run ID from URL */
    run_id: string
  }>
}

/**
 * Run Detail Page Component
 *
 * Client component that fetches and displays run details with real-time updates.
 * Subscribes to database changes for live progress tracking.
 *
 * **Data Flow:**
 * 1. Fetch run details via useRun hook
 * 2. Subscribe to real-time updates
 * 3. Fetch operation results via useOperationResults hook
 * 4. Render header and results table
 * 5. Auto-refetch on database changes
 *
 * **Loading States:**
 * - Shows loading spinner while fetching initial data
 * - Real-time updates happen silently in background
 *
 * **Error Handling:**
 * - Shows error state if run not found
 * - Back to processor button for navigation
 *
 * @param params - Route parameters
 * @returns Run detail page with live updates
 */
export default function RunDetailPage({ params }: RunDetailPageProps) {
  const { id: processorId, run_id: runId } = use(params)

  // Fetch run with real-time updates
  const { data: run, isLoading: isLoadingRun, error: runError } = useRun(runId, {
    realtime: true,
  })

  // Fetch operation results with real-time updates
  const { data: operationResults, isLoading: isLoadingResults } = useOperationResults(runId, {
    realtime: true,
  })

  if (isLoadingRun) {
    return (
      <div className="container mx-auto py-6">
        <div className="flex min-h-[400px] items-center justify-center">
          <div className="text-center">
            <div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            <p className="text-sm text-muted-foreground">Loading run details...</p>
          </div>
        </div>
      </div>
    )
  }

  if (runError || !run) {
    return (
      <div className="container mx-auto py-6">
        <div className="flex min-h-[400px] flex-col items-center justify-center gap-4">
          <div className="text-destructive">Failed to load run details</div>
          <Button asChild variant="outline">
            <Link href={`/proc/${processorId}`}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Processor
            </Link>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto space-y-6 py-6">
      {/* Back Button */}
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link href={`/proc/${processorId}`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Processor
          </Link>
        </Button>
      </div>

      {/* Run Header */}
      <RunDetailHeader run={run} />

      {/* Operation Results */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Operation Results</h2>

        {isLoadingResults ? (
          <div className="flex min-h-[200px] items-center justify-center rounded-lg border">
            <p className="text-sm text-muted-foreground">Loading operation results...</p>
          </div>
        ) : (
          <OperationResultsTable results={operationResults || []} />
        )}
      </div>
    </div>
  )
}
