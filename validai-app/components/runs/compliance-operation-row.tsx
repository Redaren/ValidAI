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
import { ChevronRight, ChevronDown, Loader2, CheckCircle2, XCircle, Circle } from 'lucide-react'
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
  if (operationType === 'true_false') {
    const structured = result.structured_output as { answer?: boolean } | null
    if (structured?.answer === true) {
      return <CheckCircle2 className="h-4 w-4 text-green-600" />
    } else if (structured?.answer === false) {
      return <XCircle className="h-4 w-4 text-red-600" />
    }
  }

  // Traffic Light
  if (operationType === 'traffic_light') {
    const structured = result.structured_output as { status?: string } | null
    if (structured?.status === 'green') {
      return <div className="h-4 w-4 rounded-full bg-green-500" aria-label="Green" />
    } else if (structured?.status === 'yellow') {
      return <div className="h-4 w-4 rounded-full bg-yellow-500" aria-label="Yellow" />
    } else if (structured?.status === 'red') {
      return <div className="h-4 w-4 rounded-full bg-red-500" aria-label="Red" />
    }
  }

  // Rating
  if (operationType === 'rating') {
    const structured = result.structured_output as { rating?: number } | null
    if (structured?.rating !== undefined) {
      const rating = structured.rating
      const color =
        rating >= 4 ? 'text-green-600' : rating >= 3 ? 'text-yellow-600' : 'text-red-600'
      return <span className={cn('text-sm font-semibold', color)}>{rating}/5</span>
    }
  }

  // Default: Checkmark for completed
  return <CheckCircle2 className="h-4 w-4 text-green-600" />
}

/**
 * Get truncated comment from response text or structured output
 */
function getTruncatedComment(result: OperationResult, maxLength: number = 80): string {
  if (result.status === 'pending') {
    return 'Waiting to process...'
  }

  if (result.status === 'failed') {
    return result.error_message || 'Operation failed'
  }

  // Try to get comment from structured output first
  const structured = result.structured_output as { comment?: string } | null
  if (structured?.comment) {
    return structured.comment.length > maxLength
      ? structured.comment.substring(0, maxLength) + '...'
      : structured.comment
  }

  // Fall back to response text
  if (result.response_text) {
    return result.response_text.length > maxLength
      ? result.response_text.substring(0, maxLength) + '...'
      : result.response_text
  }

  return 'No response available'
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
  const truncatedComment = getTruncatedComment(result)

  return (
    <div
      className={cn(
        'border-b last:border-b-0 transition-colors',
        isPending && 'bg-muted/30',
        isProcessing && 'bg-blue-50 dark:bg-blue-950/20'
      )}
    >
      {/* Collapsed Row */}
      <div
        className={cn(
          'flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/50',
          isPending && 'opacity-60'
        )}
        onClick={() => !isPending && setIsExpanded(!isExpanded)}
      >
        {/* Expand/Collapse Icon */}
        <button
          className="shrink-0"
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

        {/* Indicator */}
        <div className="shrink-0">{getOperationIndicator(result, isProcessing)}</div>

        {/* Operation Name */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <span className={cn('font-medium', isPending && 'text-muted-foreground')}>
              {snapshot.name}
            </span>
            <span className="text-muted-foreground">|</span>
            <span
              className={cn(
                'text-sm flex-1 truncate',
                isPending && 'text-muted-foreground',
                isFailed && 'text-destructive'
              )}
            >
              {truncatedComment}
            </span>
          </div>
        </div>
      </div>

      {/* Expanded Details */}
      {isExpanded && (
        <div className="border-t bg-muted/20 p-4 space-y-3">
          {/* Operation Name & Description */}
          <div>
            <h4 className="font-semibold text-base mb-1">{snapshot.name}</h4>
            {snapshot.description && (
              <p className="text-sm text-muted-foreground">{snapshot.description}</p>
            )}
          </div>

          {/* Full Response/Answer */}
          <div>
            <p className="text-sm font-medium mb-1">Result:</p>
            <div className="rounded-lg border bg-card p-3">
              {result.error_message ? (
                <p className="text-sm text-destructive">{result.error_message}</p>
              ) : result.response_text ? (
                <pre className="whitespace-pre-wrap text-sm">{result.response_text}</pre>
              ) : (
                <p className="text-sm text-muted-foreground">No response available</p>
              )}
            </div>
          </div>

          {/* Structured Output (if available and interesting) */}
          {result.structured_output && (
            <div>
              <p className="text-sm font-medium mb-1">Details:</p>
              <div className="rounded-lg border bg-card p-3">
                <pre className="whitespace-pre-wrap text-sm">
                  {JSON.stringify(result.structured_output, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
