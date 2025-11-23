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

import { Card, CardContent, CardHeader, CardTitle } from '@playze/shared-ui'
import type { Database } from '@playze/shared-types'
import { useTranslations } from 'next-intl'
import { formatCompletionDateTime } from '@/lib/date-utils'

type Run = Database['public']['Tables']['validai_runs']['Row']

/**
 * Props for ComplianceSummaryCard component
 */
interface ComplianceSummaryCardProps {
  /** The completed run to display */
  run: Run
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
  const t = useTranslations('runs.compliance')

  // Extract data from run snapshot with type safety
  const snapshot = run.snapshot as {
    processor?: { name?: string }
    document?: { name?: string }
  }

  const processorName = snapshot.processor?.name || t('unknownProcessor')
  const documentName = snapshot.document?.name || t('unknownDocument')
  const completedAt = run.completed_at ? formatCompletionDateTime(run.completed_at) : t('notAvailable')
  const totalTests = run.total_operations

  return (
    <Card>
      <CardHeader>
        <CardTitle>{processorName}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t('document')}</span>
            <span className="font-medium">{documentName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t('date')}</span>
            <span className="text-muted-foreground">{completedAt}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t('tests')}</span>
            <span className="text-muted-foreground">{totalTests}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
