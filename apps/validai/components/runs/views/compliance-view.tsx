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

import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import {
  ComplianceMetricsCharts,
  ValidationChart,
  TrafficLightChart,
} from '@/components/runs/compliance-metrics-charts'
import { ComplianceSummaryCard } from '@/components/runs/compliance-summary-card'
import { ComplianceOperationRow } from '@/components/runs/compliance-operation-row'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
 * Group operation results by their area field from snapshot
 */
function groupOperationsByArea(results: OperationResult[]): Map<string, OperationResult[]> {
  const grouped = new Map<string, OperationResult[]>()

  // Sort by execution order first
  const sortedResults = [...results].sort((a, b) => a.execution_order - b.execution_order)

  sortedResults.forEach((result) => {
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
 * Determine which operation is currently being processed
 */
function getCurrentProcessingOperation(
  results: OperationResult[],
  run: Run
): string | null {
  if (run.status !== 'processing') return null

  // Find the first pending operation
  const pendingOp = results.find((r) => r.status === 'pending')
  if (pendingOp) {
    // If there are completed/failed operations, the first pending is currently processing
    const hasProcessed = results.some((r) => r.status !== 'pending')
    return hasProcessed ? pendingOp.id : null
  }

  return null
}

/**
 * Area Section Component
 * Displays a collapsible section for operations in a specific area
 */
function AreaSection({
  areaName,
  operations,
  processingOperationId,
}: {
  areaName: string
  operations: OperationResult[]
  processingOperationId: string | null
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
                isProcessing={operation.id === processingOperationId}
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
  const groupedOperations = groupOperationsByArea(operationResults)
  const processingOperationId = getCurrentProcessingOperation(operationResults, run)

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
          <ValidationChart operationResults={operationResults} />
          <TrafficLightChart operationResults={operationResults} />
        </div>
      ) : (
        // Processing: Show Progress, Validations, Traffic Lights
        <ComplianceMetricsCharts
          operationResults={operationResults}
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
                processingOperationId={processingOperationId}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
