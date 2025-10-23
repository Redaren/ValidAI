/**
 * Compliance Operation Row Component
 *
 * @module components/runs/compliance-operation-row
 * @description
 * Compact single-row display for operations in compliance view.
 * Focuses on business results with minimal technical details.
 *
 * **Features:**
 * - Collapsed: Shows indicator, name, and truncated comment
 * - Expanded: Shows full name, description, and complete answer
 * - Visual states: Gray (pending), animated (processing), colored (completed)
 * - Space-efficient: Single row saves vertical space
 *
 * @since Phase 4 - Compliance View
 */

'use client'

import { useState } from 'react'
import { ChevronRight, ChevronDown, Loader2, CheckCircle2, XCircle, Circle, Tag, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Database } from '@/lib/database.types'

type OperationResult = Database['public']['Tables']['operation_results']['Row']

interface ComplianceOperationRowProps {
  /** The operation result to display */
  result: OperationResult
  /** Whether this operation is currently being processed */
  isProcessing?: boolean
}

/**
 * Get indicator icon based on operation type and result
 */
function getOperationIndicator(result: OperationResult, isProcessing: boolean) {
  if (isProcessing) {
    return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
  }

  if (result.status === 'pending') {
    return <Circle className="h-4 w-4 text-muted-foreground" />
  }

  if (result.status === 'failed') {
    return <XCircle className="h-4 w-4 text-destructive" />
  }

  const snapshot = result.operation_snapshot as { operation_type: string }
  const operationType = snapshot.operation_type

  // True/False validation
  if (operationType === 'validation') {
    const structured = result.structured_output as { result?: boolean } | null
    if (structured?.result === true) {
      return <div className="h-4 w-4 rounded-full bg-green-500" aria-label="True" />
    } else if (structured?.result === false) {
      return <div className="h-4 w-4 rounded-full bg-red-500" aria-label="False" />
    }
  }

  // Traffic Light
  if (operationType === 'traffic_light') {
    const structured = result.structured_output as { traffic_light?: string } | null
    if (structured?.traffic_light === 'green') {
      return <div className="h-4 w-4 rounded-full bg-green-500" aria-label="Green" />
    } else if (structured?.traffic_light === 'yellow') {
      return <div className="h-4 w-4 rounded-full bg-yellow-500" aria-label="Yellow" />
    } else if (structured?.traffic_light === 'red') {
      return <div className="h-4 w-4 rounded-full bg-red-500" aria-label="Red" />
    }
  }

  // Rating
  if (operationType === 'rating') {
    const structured = result.structured_output as { value?: number } | null
    if (structured?.value !== undefined) {
      const rating = structured.value
      const color =
        rating >= 4 ? 'text-green-600' : rating >= 3 ? 'text-yellow-600' : 'text-red-600'
      return <span className={cn('text-sm font-semibold', color)}>{rating}/5</span>
    }
  }

  // Extraction - NO INDICATOR (value shown in comment)
  if (operationType === 'extraction') {
    return null
  }

  // Classification - NO INDICATOR (value shown in comment)
  if (operationType === 'classification') {
    return null
  }

  // Analysis
  if (operationType === 'analysis') {
    return <FileText className="h-4 w-4 text-blue-600" />
  }

  // Default: Checkmark for completed (generic and other types)
  return <CheckCircle2 className="h-4 w-4 text-green-600" />
}

/**
 * Get full comment from response text or structured output
 */
function getFullComment(result: OperationResult): string {
  if (result.status === 'pending') {
    return 'Waiting to process...'
  }

  if (result.status === 'failed') {
    return result.error_message || 'Operation failed'
  }

  // Try to get comment from structured output first
  const structured = result.structured_output as { comment?: string } | null
  if (structured?.comment) {
    return structured.comment
  }

  // Fall back to response text
  if (result.response_text) {
    return result.response_text
  }

  return 'No response available'
}

/**
 * Get truncated comment from response text or structured output
 */
function getTruncatedComment(result: OperationResult, maxLength: number = 200): string {
  const fullComment = getFullComment(result)
  return fullComment.length > maxLength
    ? fullComment.substring(0, maxLength) + '...'
    : fullComment
}

/**
 * Truncate text helper
 */
function getTruncatedText(text: string, maxLength: number = 200): string {
  return text.length > maxLength ? text.substring(0, maxLength) + '...' : text
}

/**
 * Get extraction items array (only if multiple items)
 */
function getExtractionItems(result: OperationResult): string[] | null {
  const structured = result.structured_output as { items?: string[] } | null
  return structured?.items && structured.items.length > 1 ? structured.items : null
}

/**
 * Get formatted comment with structured value prepended
 * For extraction and classification, the value is shown first, then the comment
 */
function getFormattedComment(result: OperationResult, truncate: boolean = false): string {
  const snapshot = result.operation_snapshot as { operation_type: string }
  const operationType = snapshot.operation_type
  const structured = result.structured_output as any
  const baseComment = getFullComment(result)

  // Extraction - prepend items to comment
  if (operationType === 'extraction' && structured?.items) {
    const items = structured.items as string[]
    if (items.length === 1) {
      // Single item: "ItemValue. Comment text..."
      const combined = `${items[0]}. ${baseComment}`
      return truncate ? getTruncatedText(combined) : combined
    } else if (items.length > 1) {
      // Multiple items in collapsed view: "Item1, Item2, Item3..."
      if (truncate) {
        const itemsText = items.join(', ')
        return getTruncatedText(itemsText)
      }
      // In expanded view, items shown as list (handled separately in JSX)
      return baseComment
    }
  }

  // Classification - prepend classification to comment
  if (operationType === 'classification' && structured?.classification) {
    const combined = `${structured.classification}. ${baseComment}`
    return truncate ? getTruncatedText(combined) : combined
  }

  // Default: just return comment
  return truncate ? getTruncatedComment(result) : baseComment
}

/**
 * Compliance Operation Row
 *
 * Displays a single operation result in a compact, business-focused format.
 * Click to expand for full details.
 */
export function ComplianceOperationRow({ result, isProcessing = false }: ComplianceOperationRowProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  const snapshot = result.operation_snapshot as {
    name: string
    description?: string | null
    operation_type: string
  }

  const isPending = result.status === 'pending'
  const isFailed = result.status === 'failed'
  const fullComment = getFullComment(result)
  const truncatedComment = getTruncatedComment(result)

  return (
    <div
      className={cn(
        'border-b last:border-b-0 transition-colors',
        isPending && 'bg-muted/30',
        isProcessing && 'bg-blue-50 dark:bg-blue-950/20'
      )}
    >
      {/* Row */}
      <div
        className={cn(
          'flex items-start gap-3 p-3 cursor-pointer hover:bg-muted/50',
          isPending && 'opacity-60'
        )}
        onClick={() => !isPending && setIsExpanded(!isExpanded)}
      >
        {/* Indicator - FIRST (far left) with fixed width */}
        <div className="w-4 h-4 shrink-0 flex items-center justify-center">
          {getOperationIndicator(result, isProcessing)}
        </div>

        {/* Expand/Collapse Icon */}
        <button
          className="shrink-0 mt-0.5"
          onClick={(e) => {
            e.stopPropagation()
            if (!isPending) setIsExpanded(!isExpanded)
          }}
          disabled={isPending}
        >
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </button>

        {/* Operation Name and Comment */}
        <div className="flex-1 min-w-0">
          {!isExpanded ? (
            // COLLAPSED VIEW
            <div className="flex items-center gap-3">
              {/* Fixed-width name column */}
              <span
                className={cn(
                  'w-40 shrink-0 font-medium truncate',
                  isPending && 'text-muted-foreground'
                )}
              >
                {snapshot.name}
              </span>

              {/* Separator */}
              <span className="text-muted-foreground shrink-0">|</span>

              {/* Comment (with structured value prepended if applicable) */}
              <span
                className={cn(
                  'text-sm flex-1 min-w-0 line-clamp-1',
                  isPending && 'text-muted-foreground',
                  isFailed && 'text-destructive'
                )}
              >
                {getFormattedComment(result, true)}
              </span>
            </div>
          ) : (
            // EXPANDED VIEW
            <div className="flex flex-col gap-2">
              <div className="flex items-start gap-3">
                {/* Fixed-width name column */}
                <span
                  className={cn(
                    'w-40 shrink-0 font-medium',
                    isPending && 'text-muted-foreground'
                  )}
                >
                  {snapshot.name}
                </span>

                {/* Separator */}
                <span className="text-muted-foreground shrink-0">|</span>

                {/* Comment section */}
                <div className="flex-1 min-w-0">
                  {(() => {
                    const items = getExtractionItems(result)
                    if (items) {
                      // Multi-item extraction: show as list
                      return (
                        <>
                          <ul className="list-disc list-inside space-y-1 mb-2">
                            {items.map((item, idx) => (
                              <li key={idx} className="text-sm">
                                {item}
                              </li>
                            ))}
                          </ul>
                          <p className="text-sm">{fullComment}</p>
                        </>
                      )
                    }
                    // Single item or no items: just show formatted comment
                    return (
                      <span
                        className={cn(
                          'text-sm',
                          isPending && 'text-muted-foreground',
                          isFailed && 'text-destructive'
                        )}
                      >
                        {getFormattedComment(result, false)}
                      </span>
                    )
                  })()}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
