/**
 * Selection Action Bar Component
 *
 * @module components/runs/selection-action-bar
 * @description
 * Sticky bottom action bar that appears when runs are selected for comparison.
 * Shows selection count and provides "Compare" and "Clear" actions.
 *
 * **Features:**
 * - Sticky positioning at bottom of viewport
 * - "Compare" button enabled only when 2-5 runs selected
 * - "Clear Selection" button to reset selection
 * - Smooth slide-up animation when shown
 *
 * **Design Pattern:**
 * - Follows ValidAI UI patterns with shadcn/ui components
 * - Uses primary color for compare action
 * - Accessible with ARIA labels
 *
 * @since Phase 1.11 - Run Comparison Feature
 */

'use client'

import * as React from 'react'
import { useRouter } from '@/lib/i18n/navigation'
import { Button } from '@playze/shared-ui'
import { GitCompare, X } from 'lucide-react'
import { useTranslations } from 'next-intl'

/**
 * Props for SelectionActionBar component
 */
interface SelectionActionBarProps {
  /** Array of selected run IDs */
  selectedRunIds: string[]
  /** Callback to clear selection */
  onClearSelection: () => void
  /** Processor ID for navigation */
  processorId: string
}

/**
 * Selection Action Bar
 *
 * Displays at the bottom of the screen when runs are selected.
 * Provides "Compare" action (enabled for 2-5 runs) and "Clear Selection".
 *
 * @param selectedRunIds - Array of selected run IDs
 * @param onClearSelection - Callback to clear all selections
 * @param processorId - Processor ID for comparison navigation
 * @returns Sticky action bar or null if no selection
 *
 * @example
 * ```tsx
 * <SelectionActionBar
 *   selectedRunIds={selectedRunIds}
 *   onClearSelection={() => table.resetRowSelection()}
 *   processorId={processorId}
 * />
 * ```
 */
export function SelectionActionBar({
  selectedRunIds,
  onClearSelection,
  processorId,
}: SelectionActionBarProps) {
  const router = useRouter()
  const t = useTranslations('runs.compare')

  const count = selectedRunIds.length

  // Don't show if no selection
  if (count === 0) {
    return null
  }

  const canCompare = count >= 2 && count <= 5

  const handleCompare = () => {
    if (!canCompare) return
    const runsParam = selectedRunIds.join(',')
    router.push(`/proc/${processorId}/runs/compare?runs=${runsParam}`)
  }

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 animate-in slide-in-from-bottom-5 duration-300"
      role="toolbar"
      aria-label="Run selection actions"
    >
      <div className="border-t bg-background/95 p-4 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="container flex max-w-screen-xl items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <p className="text-sm font-medium">
              {t('compareSelected', { count })}
            </p>
            {!canCompare && (
              <p className="text-xs text-muted-foreground">
                {count < 2 ? t('selectRuns') : 'Maximum 5 runs can be selected'}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onClearSelection}
              className="gap-2"
            >
              <X className="h-4 w-4" />
              {t('clearSelection')}
            </Button>

            <Button
              size="sm"
              onClick={handleCompare}
              disabled={!canCompare}
              className="gap-2"
            >
              <GitCompare className="h-4 w-4" />
              Compare {count > 0 && `(${count})`}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
