/**
 * Technical View Component
 *
 * @module components/runs/views/technical-view
 * @description
 * Default view for processor runs showing technical execution details.
 * Displays run metadata, progress, operation results with expandable rows,
 * execution times, token usage, and structured outputs.
 *
 * **Features:**
 * - Run status and progress tracking
 * - Operation results table with expandable rows
 * - Token usage and execution time metrics
 * - Structured output visualization
 * - Cache hit indicators
 * - Error tracking and retry counts
 *
 * **Use Case:**
 * Technical users and developers who need detailed execution information
 * for debugging, optimization, and performance analysis.
 *
 * @since Phase 1.8
 */

import { RunDetailHeader } from '@/components/runs/run-detail-header'
import { OperationResultsTable } from '@/components/runs/operation-results-table'
import type { Database } from '@/lib/database.types'

type Run = Database['public']['Tables']['runs']['Row']
type OperationResult = Database['public']['Tables']['operation_results']['Row']

/**
 * Props for TechnicalView component
 */
interface TechnicalViewProps {
  /** The run to display */
  run: Run
  /** Operation results for the run */
  operationResults: OperationResult[]
  /** Whether operation results are still loading */
  isLoadingResults?: boolean
}

/**
 * Technical View
 *
 * Displays comprehensive technical information about a processor run.
 * This is the default view that shows all execution details, metrics,
 * and structured outputs.
 *
 * **Information Displayed:**
 * - Run metadata (status, progress, timing, document)
 * - Operation results with expandable details
 * - Token usage and cost metrics
 * - Execution times and cache performance
 * - Structured outputs and thinking blocks
 * - Error messages and retry information
 *
 * @param run - The run object from database
 * @param operationResults - Array of operation results
 * @param isLoadingResults - Loading state for operation results
 * @returns Technical view of the run
 *
 * @example
 * ```tsx
 * <TechnicalView
 *   run={run}
 *   operationResults={operationResults}
 *   isLoadingResults={isLoadingResults}
 * />
 * ```
 */
export function TechnicalView({
  run,
  operationResults,
  isLoadingResults = false,
}: TechnicalViewProps) {
  return (
    <div className="space-y-6">
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
