/**
 * Run Detail Page
 *
 * @module app/proc/[id]/runs/[run_id]/page
 * @description
 * Displays detailed information about a specific processor run with support
 * for multiple visualization views (Technical, Compliance, Contract Comments).
 * Shows real-time progress updates, operation results, and execution metadata.
 *
 * **Features:**
 * - Real-time progress updates via Supabase Realtime
 * - Multiple view types (URL-based, shareable)
 * - View switcher UI with tabs
 * - Processor-specific default views
 * - Run metadata and status
 * - Automatic refetching during processing
 *
 * **Route:** `/proc/[id]/runs/[run_id]?view=technical`
 *
 * **View Selection Hierarchy:**
 * 1. URL query param (`?view=X`) - highest priority
 * 2. Processor's default view (`configuration.default_view`)
 * 3. System default (`"technical"`)
 *
 * @since Phase 1.8
 */

'use client'

import { use } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useRun, useOperationResults } from '@/app/queries/runs'
import { getViewComponent, ViewSwitcher, type ViewType } from '@/components/runs/views'
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
 * Client component that fetches and displays run details with real-time updates
 * and support for multiple visualization views. Subscribes to database changes
 * for live progress tracking.
 *
 * **Data Flow:**
 * 1. Parse route params and URL query params
 * 2. Fetch run details via useRun hook
 * 3. Subscribe to real-time updates
 * 4. Fetch operation results via useOperationResults hook
 * 5. Determine view type (URL > processor default > system default)
 * 6. Render view switcher and selected view component
 * 7. Auto-refetch on database changes
 *
 * **View Selection Logic:**
 * - URL query param `?view=X` has highest priority (shareable links)
 * - Falls back to processor's configured `default_view`
 * - Finally defaults to "technical" view
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
 * @returns Run detail page with live updates and view switcher
 */
export default function RunDetailPage({ params }: RunDetailPageProps) {
  const { id: processorId, run_id: runId } = use(params)
  const searchParams = useSearchParams()
  const router = useRouter()

  // Fetch run with real-time updates
  const { data: run, isLoading: isLoadingRun, error: runError } = useRun(runId, {
    realtime: true,
  })

  // Fetch operation results with real-time updates
  const { data: operationResults, isLoading: isLoadingResults } = useOperationResults(runId, {
    realtime: true,
  })

  // Determine current view type
  const viewFromUrl = searchParams.get('view') as ViewType | null

  // Extract processor default view from snapshot with type safety
  const snapshot = run?.snapshot as
    | {
        processor?: {
          configuration?: {
            default_view?: ViewType
          }
        }
      }
    | undefined
  const processorDefaultView = snapshot?.processor?.configuration?.default_view

  const currentView: ViewType = viewFromUrl || processorDefaultView || 'technical'

  // Get the appropriate view component
  const ViewComponent = getViewComponent(currentView)

  // Handle view switching (updates URL)
  const handleViewChange = (newView: ViewType) => {
    const url = `/proc/${processorId}/runs/${runId}?view=${newView}`
    router.push(url)
  }

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
    <div className="space-y-6">
      {/* View Switcher */}
      <ViewSwitcher currentView={currentView} onViewChange={handleViewChange} />

      {/* Selected View Component */}
      <ViewComponent
        run={run}
        operationResults={operationResults || []}
        isLoadingResults={isLoadingResults}
      />
    </div>
  )
}
