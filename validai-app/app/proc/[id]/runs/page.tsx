/**
 * Processor Runs List Page
 *
 * @module app/proc/[id]/runs/page
 * @description
 * Displays a list of all runs for a specific processor.
 * Shows run history with status, progress, and metadata.
 *
 * **Features:**
 * - Sortable table of all runs
 * - Click to navigate to run details
 * - Empty state when no runs exist
 * - Back to processor navigation
 * - Breadcrumb navigation
 *
 * **Route:** `/proc/[id]/runs`
 *
 * @since Phase 1.8
 */

'use client'

import { use } from 'react'
import { useProcessorRuns } from '@/app/queries/runs'
import { useProcessorDetail } from '@/app/queries/processors/use-processor-detail'
import { RunsTable } from '@/components/runs/runs-table'
import { Button } from '@/components/ui/button'
import { ArrowLeft, History } from 'lucide-react'
import Link from 'next/link'

/**
 * Props for the ProcessorRunsPage component
 */
interface ProcessorRunsPageProps {
  /** Route parameters */
  params: Promise<{
    /** Processor ID from URL */
    id: string
  }>
}

/**
 * Processor Runs List Page
 *
 * Displays all runs for a processor in a table format.
 * Each run can be clicked to view detailed results.
 *
 * **Data Flow:**
 * 1. Fetch all runs for processor via useProcessorRuns hook
 * 2. Render runs table
 * 3. Navigate to run detail on row click
 *
 * **Loading States:**
 * - Shows loading spinner while fetching runs
 *
 * **Error Handling:**
 * - Shows error state if fetch fails
 * - Back to processor button for navigation
 *
 * @param params - Route parameters
 * @returns Runs list page
 */
export default function ProcessorRunsPage({ params }: ProcessorRunsPageProps) {
  const { id: processorId } = use(params)

  const { data: runs, isLoading, error } = useProcessorRuns(processorId)
  const { data: processor, isLoading: processorLoading } = useProcessorDetail(processorId)

  if (isLoading) {
    return (
      <div className="container mx-auto py-6">
        <div className="flex min-h-[400px] items-center justify-center">
          <div className="text-center">
            <div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            <p className="text-sm text-muted-foreground">Loading runs...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="container mx-auto py-6">
        <div className="flex min-h-[400px] flex-col items-center justify-center gap-4">
          <div className="text-destructive">Failed to load runs</div>
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
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <History className="h-6 w-6" />
          <h1 className="text-2xl font-bold">
            History - {processorLoading ? 'Loading...' : processor?.processor_name || 'Processor'}
          </h1>
        </div>
        <p className="text-sm text-muted-foreground">
          View executions and their results
        </p>
      </div>

      {/* Runs Table */}
      <RunsTable runs={runs || []} processorId={processorId} />
    </div>
  )
}
