/**
 * Compliance View Component
 *
 * @module components/runs/views/compliance-view
 * @description
 * Business-focused view for processor runs emphasizing compliance insights.
 * Features interactive metrics charts and grouped operation results by user-defined areas.
 *
 * **Features:**
 * - Three radial charts showing progress, validations, and traffic lights
 * - Operations grouped by user-defined area names
 * - Compact single-row display per operation (expandable)
 * - Real-time updates via parent subscription
 * - Focus on business results, not technical metrics
 *
 * **Use Case:**
 * Business users, compliance officers, and non-technical stakeholders who need
 * quick insights into document compliance and validation results.
 *
 * @since Phase 4 - Compliance View
 */

'use client'

import { useState, useMemo } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import {
  ComplianceMetricsCharts,
  ValidationChart,
  TrafficLightChart,
} from '@/components/runs/compliance-metrics-charts'
import { ComplianceSummaryCard } from '@/components/runs/compliance-summary-card'
import { ComplianceOperationRow } from '@/components/runs/compliance-operation-row'
import { Card, CardContent, CardHeader, CardTitle } from '@playze/shared-ui'
import type { Database } from '@playze/shared-types'

type Run = Database['public']['Tables']['validai_runs']['Row']
type OperationResult = Database['public']['Tables']['validai_operation_results']['Row']

/**
 * Props for ComplianceView component
 */
interface ComplianceViewProps {
  /** The run to display */
  run: Run
  /** Operation results for the run */
  operationResults: OperationResult[]
  /** Whether operation results are still loading */
  isLoadingResults?: boolean
}

/**
 * Merge snapshot operations with actual results
 * This allows showing all operations at start (with spinners) and updating as results arrive
 */
function mergeOperationsWithResults(
  snapshotOperations: Array<{ id: string; name: string; area?: string | null; [key: string]: any }>,
  operationResults: OperationResult[]
): OperationResult[] {
  return snapshotOperations.map((snapOp, index) => {
    // Find matching result (if exists)
    // Match by operation_id OR by operation_snapshot.id (fallback for legacy data where operation_id is null)
    const result = operationResults.find(
      (r) => r.operation_id === snapOp.id || (r.operation_snapshot as any)?.id === snapOp.id
    )

    if (result) {
      // Use actual result
      return result
    } else {
      // Create synthetic "pending" result
      // Use placeholder timestamp for pending operations (they haven't actually started yet)
      const placeholderTimestamp = new Date().toISOString()

      return {
        id: `pending-${snapOp.id}`,
        run_id: '',
        operation_id: snapOp.id,
        execution_order: index,
        status: 'pending',
        operation_snapshot: snapOp,
        response_text: null,
        structured_output: null,
        model_used: null,
        execution_time_ms: null,
        tokens_used: null,
        thinking_blocks: null,
        cache_hit: null,
        retry_count: null,
        started_at: placeholderTimestamp,
        completed_at: null,
        error_message: null,
        error_type: null,
      } as OperationResult
    }
  })
}

/**
 * Create sequential operation numbering map based on display order
 * Numbers operations as they will appear on screen (1, 2, 3...)
 */
function createOperationNumbering(groupedOperations: Map<string, OperationResult[]>): Map<string, number> {
  const numbering = new Map<string, number>()
  let counter = 1

  // Iterate through grouped operations in display order
  for (const operations of groupedOperations.values()) {
    for (const operation of operations) {
      numbering.set(operation.id, counter++)
    }
  }

  return numbering
}

/**
 * Group operation results by their area field from snapshot
 * Operations are grouped in the order they appear (snapshot order)
 */
function groupOperationsByArea(results: OperationResult[]): Map<string, OperationResult[]> {
  const grouped = new Map<string, OperationResult[]>()

  // Group operations in the order they appear
  results.forEach((result) => {
    const snapshot = result.operation_snapshot as { area?: string | null }
    const area = snapshot.area || 'Default'

    if (!grouped.has(area)) {
      grouped.set(area, [])
    }
    grouped.get(area)!.push(result)
  })

  return grouped
}

/**
 * Get the number of parallel operations from run snapshot
 * Falls back to 25 if not available
 */
function getParallelOperationsCount(run: Run): number {
  const snapshot = run.snapshot as {
    execution_config?: { max_concurrency?: number }
  } | null

  return snapshot?.execution_config?.max_concurrency || 25
}

/**
 * Determine which operations are currently being processed in parallel
 * Returns a Set of operation IDs that should show spinners
 */
function getCurrentProcessingOperations(
  results: OperationResult[],
  run: Run
): Set<string> {
  if (run.status !== 'processing') return new Set()

  // Get parallel operations count (defaults to 25)
  const parallelCount = getParallelOperationsCount(run)

  // Find all pending operations
  const pendingOps = results.filter((r) => r.status === 'pending')

  // Return the first N pending operations (where N = parallelCount)
  const processingOps = pendingOps.slice(0, parallelCount)

  return new Set(processingOps.map(op => op.id))
}

/**
 * Area Section Component
 * Displays a collapsible section for operations in a specific area
 */
function AreaSection({
  areaName,
  operations,
  processingOperationIds,
  operationNumbering,
}: {
  areaName: string
  operations: OperationResult[]
  processingOperationIds: Set<string>
  operationNumbering: Map<string, number>
}) {
  const [isExpanded, setIsExpanded] = useState(true)

  const completedCount = operations.filter((op) => op.status === 'completed').length
  const failedCount = operations.filter((op) => op.status === 'failed').length
  const totalCount = operations.length

  return (
    <Card>
      <CardHeader
        className="cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
            <CardTitle className="text-base">{areaName}</CardTitle>
            <span className="text-sm text-muted-foreground">
              ({completedCount + failedCount} of {totalCount})
            </span>
          </div>
          {failedCount > 0 && (
            <span className="text-sm text-destructive">{failedCount} failed</span>
          )}
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="p-0">
          <div className="divide-y">
            {operations.map((operation) => (
              <ComplianceOperationRow
                key={operation.id}
                result={operation}
                isProcessing={processingOperationIds.has(operation.id)}
                operationNumber={operationNumbering.get(operation.id) ?? 0}
              />
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  )
}

/**
 * Compliance View
 *
 * Displays a business-focused view of processor run results with emphasis on
 * compliance metrics and user-friendly presentation.
 *
 * **Top Section:**
 * Three radial charts showing:
 * - Overall progress
 * - Validation pass rate (True/False operations)
 * - Traffic light distribution (Red/Yellow/Green)
 *
 * **Bottom Section:**
 * Operations grouped by user-defined areas:
 * - Each area is collapsible
 * - Operations shown in compact single-row format
 * - Click to expand for full details
 * - Real-time processing indicators
 *
 * @param run - The run object from database
 * @param operationResults - Array of operation results
 * @param isLoadingResults - Loading state for operation results
 * @returns Compliance view of the run
 *
 * @example
 * ```tsx
 * <ComplianceView
 *   run={run}
 *   operationResults={operationResults}
 *   isLoadingResults={isLoadingResults}
 * />
 * ```
 */
export function ComplianceView({
  run,
  operationResults,
  isLoadingResults = false,
}: ComplianceViewProps) {
  // Merge snapshot operations with actual results
  // This shows all operations from the start (with spinners) and updates as results arrive
  const mergedOperations = useMemo(() => {
    // If snapshot has operations, merge them with results
    const snapshot = run.snapshot as { operations?: Array<{ id: string; name: string; area?: string | null; [key: string]: any }> } | null
    if (snapshot?.operations && snapshot.operations.length > 0) {
      return mergeOperationsWithResults(snapshot.operations, operationResults)
    }
    // Otherwise, fall back to just the results
    return operationResults
  }, [run.snapshot, operationResults])

  const groupedOperations = groupOperationsByArea(mergedOperations)
  const operationNumbering = useMemo(() => createOperationNumbering(groupedOperations), [groupedOperations])
  const processingOperationIds = getCurrentProcessingOperations(mergedOperations, run)

  if (isLoadingResults) {
    return (
      <div className="space-y-6">
        <div className="flex min-h-[200px] items-center justify-center rounded-lg border">
          <p className="text-sm text-muted-foreground">Loading compliance data...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Metrics Dashboard: Summary Card + Charts OR Progress + Charts */}
      {run.status === 'completed' ? (
        // Completed: Show Summary Card, Validations, Traffic Lights
        <div className="grid gap-4 md:grid-cols-3">
          <ComplianceSummaryCard run={run} />
          <ValidationChart operationResults={mergedOperations} />
          <TrafficLightChart operationResults={mergedOperations} />
        </div>
      ) : (
        // Processing: Show Progress, Validations, Traffic Lights
        <ComplianceMetricsCharts
          operationResults={mergedOperations}
          totalOperations={run.total_operations}
          completedOperations={run.completed_operations}
          failedOperations={run.failed_operations}
        />
      )}

      {/* Grouped Operations */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Tests & comments</h2>

        {groupedOperations.size === 0 ? (
          <div className="flex min-h-[200px] items-center justify-center rounded-lg border">
            <p className="text-sm text-muted-foreground">No operation results yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {Array.from(groupedOperations.entries()).map(([areaName, operations]) => (
              <AreaSection
                key={areaName}
                areaName={areaName}
                operations={operations}
                processingOperationIds={processingOperationIds}
                operationNumbering={operationNumbering}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
