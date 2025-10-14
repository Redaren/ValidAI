/**
 * Runs Table Component
 *
 * @module components/runs/runs-table
 * @description
 * Displays a list of processor runs in a table format.
 * Each row is clickable and navigates to the run detail page.
 *
 * **Features:**
 * - Sortable table with run metadata
 * - Status badges with color coding
 * - Progress indicators
 * - Click to navigate to run details
 * - Empty state when no runs exist
 *
 * @since Phase 1.8
 */

'use client'

import { useRouter } from 'next/navigation'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { formatDistanceToNow } from 'date-fns'
import type { Database } from '@/lib/database.types'
import { FileText } from 'lucide-react'

type Run = Database['public']['Tables']['runs']['Row']

/**
 * Props for RunsTable component
 */
interface RunsTableProps {
  /** Array of runs to display */
  runs: Run[]
  /** Processor ID for navigation */
  processorId: string
}

/**
 * Formats duration in milliseconds to human-readable format
 */
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)

  if (hours > 0) {
    const remainingMinutes = minutes % 60
    return `${hours}h ${remainingMinutes}m`
  }
  if (minutes > 0) {
    const remainingSeconds = seconds % 60
    return `${minutes}m ${remainingSeconds}s`
  }
  return `${seconds}s`
}

/**
 * Formats ISO date string to relative time
 */
function formatDateTime(isoString: string): string {
  return formatDistanceToNow(new Date(isoString), { addSuffix: true })
}

/**
 * Formats file size in bytes
 */
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

/**
 * Renders run status badge
 */
function RunStatusBadge({ status, failedCount }: { status: string; failedCount: number }) {
  if (status === 'completed') {
    if (failedCount > 0) {
      return (
        <Badge variant="outline" className="border-yellow-500 text-yellow-700">
          Partial
        </Badge>
      )
    }
    return (
      <Badge variant="outline" className="border-green-500 text-green-700">
        Success
      </Badge>
    )
  }

  if (status === 'failed') {
    return <Badge variant="destructive">Failed</Badge>
  }

  if (status === 'processing') {
    return (
      <Badge variant="outline" className="border-blue-500 text-blue-700">
        <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-blue-500" />
        Running
      </Badge>
    )
  }

  if (status === 'pending') {
    return <Badge variant="secondary">Pending</Badge>
  }

  if (status === 'cancelled') {
    return <Badge variant="outline">Cancelled</Badge>
  }

  return <Badge variant="outline">{status}</Badge>
}

/**
 * Runs Table
 *
 * Displays all runs for a processor in a table format.
 * Clicking a row navigates to the run detail page.
 *
 * **Table Columns:**
 * - Status - Run completion status
 * - Document - Document name and size
 * - Started - Relative start time
 * - Duration - Total execution time
 * - Progress - Operations completed/failed/total
 *
 * @param runs - Array of run objects
 * @param processorId - Processor ID for navigation
 * @returns Table component
 *
 * @example
 * ```tsx
 * const { data: runs } = useProcessorRuns(processorId)
 * return <RunsTable runs={runs || []} processorId={processorId} />
 * ```
 */
export function RunsTable({ runs, processorId }: RunsTableProps) {
  const router = useRouter()

  if (runs.length === 0) {
    return (
      <div className="flex min-h-[300px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-8 text-center">
        <FileText className="h-12 w-12 text-muted-foreground" />
        <div className="space-y-1">
          <p className="text-sm font-medium">No runs yet</p>
          <p className="text-xs text-muted-foreground">
            Click "Run Processor" to execute this processor on a document
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Status</TableHead>
            <TableHead>Document</TableHead>
            <TableHead>Started</TableHead>
            <TableHead>Duration</TableHead>
            <TableHead>Progress</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {runs.map((run) => {
            const snapshot = run.snapshot as {
              document: { name: string; size_bytes: number }
            }

            const duration = run.completed_at
              ? new Date(run.completed_at).getTime() - new Date(run.started_at).getTime()
              : Date.now() - new Date(run.started_at).getTime()

            const progressPercent =
              ((run.completed_operations + run.failed_operations) / run.total_operations) * 100

            return (
              <TableRow
                key={run.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => router.push(`/proc/${processorId}/runs/${run.id}`)}
              >
                <TableCell>
                  <RunStatusBadge status={run.status} failedCount={run.failed_operations} />
                </TableCell>

                <TableCell>
                  <div>
                    <p className="font-medium">{snapshot.document.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(snapshot.document.size_bytes)}
                    </p>
                  </div>
                </TableCell>

                <TableCell className="text-sm text-muted-foreground">
                  {formatDateTime(run.started_at)}
                </TableCell>

                <TableCell className="font-mono text-sm">{formatDuration(duration)}</TableCell>

                <TableCell>
                  <div className="space-y-1">
                    <div className="text-sm">
                      {run.completed_operations + run.failed_operations} / {run.total_operations}
                      {run.failed_operations > 0 && (
                        <span className="ml-2 text-xs text-destructive">
                          ({run.failed_operations} failed)
                        </span>
                      )}
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full bg-primary transition-all"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
