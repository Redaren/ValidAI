/**
 * Compare Table Component
 *
 * @module components/runs/compare-table
 * @description
 * Displays side-by-side comparison of operation results across multiple runs.
 * Groups operations by area and shows compact results with modal expansion.
 *
 * **Features:**
 * - Groups operations by area (from processor snapshot)
 * - Horizontal scroll for 4-5 runs
 * - Compact result display by operation type
 * - Click cell to view expanded details in modal
 * - Metadata row showing document name and date
 *
 * **Layout:**
 * - Left column: Operation names (grouped by area)
 * - Right columns: One column per run with results
 * - Metadata row at top of each run column
 *
 * @since Phase 1.11 - Run Comparison Feature
 */

'use client'

import * as React from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@playze/shared-ui'
import { formatDistanceToNow } from 'date-fns'
import type { Database } from '@playze/shared-types'
import { CompareResultCell } from './compare-result-cell'
import { CompareResultModal } from './compare-result-modal'

type Run = Database['public']['Tables']['validai_runs']['Row']
type OperationResult = Database['public']['Tables']['validai_operation_results']['Row']

interface CompareTableProps {
  runs: Run[]
  resultsMap: Record<string, OperationResult[]>
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

interface GroupedOperations {
  area: string
  operations: OperationSnapshot[]
}

/**
 * Formats ISO date string to relative time with full date on hover
 */
function formatDate(isoString: string): { relative: string; full: string } {
  const date = new Date(isoString)
  return {
    relative: formatDistanceToNow(date, { addSuffix: true }),
    full: date.toLocaleString(),
  }
}

/**
 * Groups operations by area
 */
function groupOperationsByArea(operations: OperationSnapshot[] | undefined): GroupedOperations[] {
  if (!operations || operations.length === 0) {
    return []
  }

  const groups = new Map<string, OperationSnapshot[]>()

  operations.forEach((op) => {
    const area = op.area || 'Uncategorized'
    if (!groups.has(area)) {
      groups.set(area, [])
    }
    groups.get(area)!.push(op)
  })

  return Array.from(groups.entries()).map(([area, ops]) => ({
    area,
    operations: ops,
  }))
}

/**
 * Compare Table
 *
 * Displays operations in rows and runs in columns, grouped by area.
 * Clicking a result cell opens a modal with full details.
 *
 * @param runs - Array of runs to compare
 * @param resultsMap - Map of run_id to operation results
 * @returns Comparison table with grouped operations
 */
export function CompareTable({ runs, resultsMap }: CompareTableProps) {
  const [selectedResult, setSelectedResult] = React.useState<OperationResult | null>(null)
  const [modalOpen, setModalOpen] = React.useState(false)

  // Early return if no runs available
  if (!runs || runs.length === 0) {
    return null
  }

  // Get operations from first run's snapshot (all runs have same processor)
  const firstRun = runs[0]
  const snapshot = firstRun?.snapshot as unknown as ProcessorSnapshot
  const allOperations = snapshot?.operations

  // Group operations by area
  const groupedOperations = React.useMemo(
    () => groupOperationsByArea(allOperations),
    [allOperations]
  )

  const handleCellClick = (result: OperationResult | null) => {
    if (result) {
      setSelectedResult(result)
      setModalOpen(true)
    }
  }

  return (
    <>
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="sticky left-0 z-10 min-w-[200px] bg-background">
                Operation
              </TableHead>
              {runs.map((run) => {
                const runSnapshot = run.snapshot as unknown as ProcessorSnapshot
                const date = formatDate(run.started_at)

                return (
                  <TableHead key={run.id} className="min-w-[180px] text-center">
                    <div className="space-y-1">
                      <div className="truncate font-semibold" title={runSnapshot.document.name}>
                        {runSnapshot.document.name}
                      </div>
                      <div className="text-xs text-muted-foreground" title={date.full}>
                        {date.relative}
                      </div>
                    </div>
                  </TableHead>
                )
              })}
            </TableRow>
          </TableHeader>

          <TableBody>
            {groupedOperations.map((group) => (
              <React.Fragment key={group.area}>
                {/* Area Header Row */}
                <TableRow className="bg-muted/50">
                  <TableCell
                    colSpan={runs.length + 1}
                    className="sticky left-0 z-10 bg-muted/50 font-semibold"
                  >
                    {group.area}
                  </TableCell>
                </TableRow>

                {/* Operation Rows */}
                {group.operations.map((operation) => {
                  return (
                    <TableRow key={operation.id} className="hover:bg-muted/30">
                      <TableCell className="sticky left-0 z-10 bg-background font-medium">
                        {operation.name}
                      </TableCell>

                      {runs.map((run) => {
                        // Find matching result for this operation in this run
                        const runResults = resultsMap[run.id] || []
                        const result = runResults.find((r) => {
                          const opSnapshot = r.operation_snapshot as OperationSnapshot
                          return opSnapshot.id === operation.id
                        })

                        return (
                          <TableCell
                            key={`${run.id}-${operation.id}`}
                            className="cursor-pointer text-center hover:bg-muted/50"
                            onClick={() => handleCellClick(result || null)}
                          >
                            <CompareResultCell
                              result={result}
                              operationType={operation.operation_type}
                            />
                          </TableCell>
                        )
                      })}
                    </TableRow>
                  )
                })}
              </React.Fragment>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Result Detail Modal */}
      <CompareResultModal
        result={selectedResult}
        open={modalOpen}
        onOpenChange={setModalOpen}
      />
    </>
  )
}
