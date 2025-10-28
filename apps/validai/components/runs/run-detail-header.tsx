/**
 * Run Detail Header Component
 *
 * @module components/runs/run-detail-header
 * @description
 * Displays run metadata, progress, and status in a card format.
 * Updates in real-time as the run progresses.
 *
 * **Features:**
 * - Run status badge with color coding
 * - Progress bar with completion percentage
 * - Run metadata (document, started, duration, triggered by)
 * - Real-time updates via parent query subscription
 *
 * @since Phase 1.8
 */

import { Badge, Card, CardContent, CardHeader, CardTitle } from '@playze/shared-ui'
import { Progress } from '@/components/ui/progress'
import { formatDistanceToNow } from 'date-fns'
import type { Database } from '@playze/shared-types'

type Run = Database['public']['Tables']['validai_runs']['Row']

/**
 * Props for RunDetailHeader component
 */
interface RunDetailHeaderProps {
  /** The run to display */
  run: Run
}

/**
 * Formats duration in milliseconds to human-readable format
 *
 * @param ms - Duration in milliseconds
 * @returns Formatted string (e.g., "1m 30s", "45s")
 */
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60

  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`
  }
  return `${seconds}s`
}

/**
 * Formats ISO date string to human-readable relative time
 *
 * @param isoString - ISO 8601 date string
 * @returns Formatted string (e.g., "2 minutes ago")
 */
function formatDateTime(isoString: string): string {
  return formatDistanceToNow(new Date(isoString), { addSuffix: true })
}

/**
 * Renders status badge with appropriate variant
 *
 * @param status - Run status
 * @param failedCount - Number of failed operations
 * @returns Badge component
 */
function RunStatusBadge({ status, failedCount }: { status: string; failedCount: number }) {
  if (status === 'completed') {
    if (failedCount > 0) {
      return <Badge variant="outline" className="border-yellow-500 text-yellow-700">Completed with Errors</Badge>
    }
    return <Badge variant="outline" className="border-green-500 text-green-700">Completed</Badge>
  }

  if (status === 'failed') {
    return <Badge variant="destructive">Failed</Badge>
  }

  if (status === 'processing') {
    return (
      <Badge variant="outline" className="border-blue-500 text-blue-700">
        <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-blue-500" />
        Processing
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
 * Run Detail Header
 *
 * Displays comprehensive run metadata and progress in a card format.
 * Automatically updates when parent query refetches (via real-time subscription).
 *
 * **Information Displayed:**
 * - Processor name (from frozen snapshot)
 * - Run status badge
 * - Document name
 * - Start time (relative)
 * - Duration (calculated)
 * - Triggered by (user or system)
 * - Progress bar with completion count
 *
 * @param run - The run object from database
 * @returns Card component with run metadata
 *
 * @example
 * ```tsx
 * const { data: run } = useRun(runId)
 * return <RunDetailHeader run={run} />
 * ```
 */
export function RunDetailHeader({ run }: RunDetailHeaderProps) {
  const snapshot = run.snapshot as {
    processor: { name: string }
    document: { name: string }
  }

  const progress =
    ((run.completed_operations + run.failed_operations) / run.total_operations) * 100

  const duration = run.completed_at
    ? new Date(run.completed_at).getTime() - new Date(run.started_at).getTime()
    : Date.now() - new Date(run.started_at).getTime()

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{snapshot.processor.name}</CardTitle>
          <RunStatusBadge status={run.status} failedCount={run.failed_operations} />
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
          <div>
            <p className="text-muted-foreground">Document</p>
            <p className="font-medium">{snapshot.document.name}</p>
          </div>

          <div>
            <p className="text-muted-foreground">Started</p>
            <p className="font-medium">{formatDateTime(run.started_at)}</p>
          </div>

          <div>
            <p className="text-muted-foreground">Duration</p>
            <p className="font-medium">{formatDuration(duration)}</p>
          </div>

          <div>
            <p className="text-muted-foreground">Trigger Type</p>
            <p className="font-medium capitalize">{run.trigger_type || 'Manual'}</p>
          </div>
        </div>

        <div>
          <div className="mb-2 flex justify-between text-sm">
            <span>Progress</span>
            <span>
              {run.completed_operations + run.failed_operations} / {run.total_operations}
              {run.failed_operations > 0 && (
                <span className="ml-2 text-destructive">({run.failed_operations} failed)</span>
              )}
            </span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {run.error_message && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3">
            <p className="text-sm font-medium text-destructive">Error</p>
            <p className="text-sm text-destructive/90">{run.error_message}</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
