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
      return <div className="h-3 w-3 rounded-full bg-green-500" aria-label="True" />
    } else if (structured?.result === false) {
      return <div className="h-3 w-3 rounded-full bg-red-500" aria-label="False" />
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

  // Extraction
  if (operationType === 'extraction') {
    const structured = result.structured_output as { items?: string[] } | null
    const count = structured?.items?.length || 0
    if (count > 0) {
      return <span className="text-sm font-semibold text-blue-600">{count} items</span>
    }
  }

  // Classification
  if (operationType === 'classification') {
    return <Tag className="h-4 w-4 text-purple-600" />
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
function getTruncatedComment(result: OperationResult, maxLength: number = 80): string {
  const fullComment = getFullComment(result)
  return fullComment.length > maxLength
    ? fullComment.substring(0, maxLength) + '...'
    : fullComment
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
          'flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/50',
          isPending && 'opacity-60'
        )}
        onClick={() => !isPending && setIsExpanded(!isExpanded)}
      >
        {/* Indicator - FIRST (far left) */}
        <div className="shrink-0">{getOperationIndicator(result, isProcessing)}</div>

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

        {/* Operation Name and Comment */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-3">
            <span className={cn('font-medium shrink-0', isPending && 'text-muted-foreground')}>
              {snapshot.name}
            </span>

            <span className="text-muted-foreground shrink-0">|</span>

            <span
              className={cn(
                'text-sm flex-1',
                !isExpanded && 'truncate',
                isPending && 'text-muted-foreground',
                isFailed && 'text-destructive'
              )}
            >
              {isExpanded ? fullComment : truncatedComment}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
