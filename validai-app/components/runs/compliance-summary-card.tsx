/**
 * Compliance Summary Card Component
 *
 * @module components/runs/compliance-summary-card
 * @description
 * Displays a summary card with run details after a processor run has completed.
 * Shows processor name, document, completion date/time, and number of tests.
 *
 * **Features:**
 * - Processor name
 * - Document filename
 * - Completion date and time (no seconds)
 * - Total number of tests/operations
 *
 * **Use Case:**
 * Replaces the progress chart in compliance view when run status is "completed"
 *
 * @since Phase 4 - Compliance View Enhancement
 */

'use client'

import { format } from 'date-fns'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { Database } from '@/lib/database.types'

type Run = Database['public']['Tables']['runs']['Row']

/**
 * Props for ComplianceSummaryCard component
 */
interface ComplianceSummaryCardProps {
  /** The completed run to display */
  run: Run
}

/**
 * Formats ISO date string to readable date and time without seconds
 * Example: "Oct 16, 2025 14:30"
 */
function formatCompletionDateTime(isoString: string): string {
  return format(new Date(isoString), 'MMM dd, yyyy HH:mm')
}

/**
 * Compliance Summary Card
 *
 * Displays a summary of the completed run with key information.
 * Shown instead of progress charts when run status is "completed".
 *
 * **Card Contents:**
 * - Processor name (from snapshot)
 * - Document name (from snapshot)
 * - Completion date/time
 * - Number of tests
 *
 * @param run - The completed run object from database
 * @returns Summary card component
 *
 * @example
 * ```tsx
 * {run.status === 'completed' && (
 *   <ComplianceSummaryCard run={run} />
 * )}
 * ```
 */
export function ComplianceSummaryCard({ run }: ComplianceSummaryCardProps) {
  // Extract data from run snapshot with type safety
  const snapshot = run.snapshot as {
    processor?: { name?: string }
    document?: { name?: string }
  }

  const processorName = snapshot.processor?.name || 'Unknown Processor'
  const documentName = snapshot.document?.name || 'Unknown Document'
  const completedAt = run.completed_at ? formatCompletionDateTime(run.completed_at) : 'N/A'
  const totalTests = run.total_operations

  return (
    <Card>
      <CardHeader>
        <CardTitle>{processorName}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Document</span>
            <span className="font-medium">{documentName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Date</span>
            <span className="font-medium">{completedAt}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground"># Tests etc</span>
            <span className="font-medium">{totalTests}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
