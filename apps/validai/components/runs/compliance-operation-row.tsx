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
import { ChevronRight, ChevronDown, Loader2, CheckCircle2, XCircle, Circle, Tag, FileText, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Database } from '@playze/shared-types'

type OperationResult = Database['public']['Tables']['validai_operation_results']['Row']

interface ComplianceOperationRowProps {
  /** The operation result to display */
  result: OperationResult
  /** Whether this operation is currently being processed */
  isProcessing?: boolean
  /** The sequential operation number to display (1, 2, 3...) */
  operationNumber: number
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
      return <div className="h-4 w-4 rounded-full" style={{ backgroundColor: 'hsl(142, 76%, 36%)' }} aria-label="True" />
    } else if (structured?.result === false) {
      return <div className="h-4 w-4 rounded-full" style={{ backgroundColor: 'hsl(0, 84%, 60%)' }} aria-label="False" />
    }
  }

  // Traffic Light
  if (operationType === 'traffic_light') {
    const structured = result.structured_output as { traffic_light?: string } | null
    if (structured?.traffic_light === 'green') {
      return <div className="h-4 w-4 rounded-full" style={{ backgroundColor: 'hsl(142, 76%, 36%)' }} aria-label="Green" />
    } else if (structured?.traffic_light === 'yellow') {
      return <div className="h-4 w-4 rounded-full" style={{ backgroundColor: 'hsl(48, 96%, 53%)' }} aria-label="Yellow" />
    } else if (structured?.traffic_light === 'red') {
      return <div className="h-4 w-4 rounded-full" style={{ backgroundColor: 'hsl(0, 84%, 60%)' }} aria-label="Red" />
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

  // Extraction - Show magnifying glass icon
  if (operationType === 'extraction') {
    return <Search className="h-4 w-4 text-purple-600" />
  }

  // Classification - Show tag icon
  if (operationType === 'classification') {
    return <Tag className="h-4 w-4 text-indigo-600" />
  }

  // Analysis - Show magnifying glass icon
  if (operationType === 'analysis') {
    return <Search className="h-4 w-4 text-blue-600" />
  }

  // Generic - Show magnifying glass icon
  if (operationType === 'generic') {
    return <Search className="h-4 w-4 text-gray-600" />
  }

  // Default: Checkmark for completed (other types)
  return <CheckCircle2 className="h-4 w-4 text-green-600" />
}

/**
 * Get full comment from response text or structured output
 */
function getFullComment(result: OperationResult): string {
  if (result.status === 'pending') {
    return ''  // No text for pending operations
  }

  if (result.status === 'failed') {
    return result.error_message || 'Operation failed'
  }

  // Try to get comment from structured output first
  const structured = result.structured_output as {
    comment?: string
    response?: string  // Generic operations
    conclusion?: string  // Analysis operations
  } | null

  if (structured?.comment) {
    return structured.comment
  }

  // Handle generic operations (structured_output.response)
  if (structured?.response) {
    return structured.response
  }

  // Handle analysis operations (structured_output.conclusion)
  if (structured?.conclusion) {
    return structured.conclusion
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
function getTruncatedComment(result: OperationResult, maxLength: number = 215): string {
  const fullComment = getFullComment(result)
  return fullComment.length > maxLength
    ? fullComment.substring(0, maxLength) + '...'
    : fullComment
}

/**
 * Truncate text helper
 */
function getTruncatedText(text: string, maxLength: number = 215): string {
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
export function ComplianceOperationRow({ result, isProcessing = false, operationNumber }: ComplianceOperationRowProps) {
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
        'transition-colors',
        isPending && 'bg-muted/30',
        isProcessing && 'bg-blue-50 dark:bg-blue-950/20'
      )}
    >
      {/* Row */}
      <div
        className={cn(
          'flex items-center px-6 py-3 cursor-pointer hover:bg-muted/50',
          isPending && 'opacity-60',
          isPending && 'cursor-default'
        )}
        onClick={() => !isPending && setIsExpanded(!isExpanded)}
      >
        {/* Operation Number */}
        <div className="w-4 shrink-0 text-sm text-muted-foreground text-center mr-5">
          {operationNumber}
        </div>

        {/* Indicator Icon */}
        <div className="w-4 h-4 shrink-0 flex items-center justify-center mr-6">
          {getOperationIndicator(result, isProcessing)}
        </div>

        {/* Operation Name and Comment */}
        <div className="flex-1 min-w-0">
          {!isExpanded ? (
            // COLLAPSED VIEW - Vertical layout
            <div className="flex flex-col gap-1">
              {/* Name on top (bold) */}
              <div
                className={cn(
                  'font-medium',
                  isPending && 'text-muted-foreground'
                )}
              >
                {snapshot.name}
              </div>

              {/* Result below name - always shown to maintain consistent row height */}
              <div
                className={cn(
                  'text-xs text-muted-foreground line-clamp-2',
                  isFailed && 'text-destructive'
                )}
              >
                {isPending ? '\u00A0' : (getFormattedComment(result, true) || '\u00A0')}
              </div>
            </div>
          ) : (
            // EXPANDED VIEW - Vertical layout
            <div className="flex flex-col gap-2">
              {/* Name on top (bold) */}
              <div
                className={cn(
                  'font-medium',
                  isPending && 'text-muted-foreground'
                )}
              >
                {snapshot.name}
              </div>

              {/* Description (if available) */}
              {snapshot.description && (
                <div className="text-xs text-muted-foreground">
                  {snapshot.description}
                </div>
              )}

              {/* Full result with better text formatting */}
              {!isPending && (
                <div className="rounded-lg border bg-card p-4 mt-4">
                  <pre
                    className={cn(
                      'whitespace-pre-wrap text-sm leading-relaxed font-sans',
                      isFailed && 'text-destructive'
                    )}
                  >
                    {getFormattedComment(result, false)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
