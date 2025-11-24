/**
 * Compare Result Cell Component
 *
 * @module components/runs/compare-result-cell
 * @description
 * Renders a compact, scannable result for a single operation in the comparison table.
 * Display rules vary by operation type to minimize space usage.
 *
 * **Display Rules:**
 * - Traffic Light: Colored dot only (🟢 🟡 🔴)
 * - Validation: Colored dot only (✓ green / ✗ red)
 * - Extraction: Single value or count (e.g., "3 values")
 * - Rating: Numeric value only (e.g., "8/10")
 * - Classification: Text (truncated to ~30 chars)
 * - Analysis/Generic: Truncated to ~40 chars with "..."
 *
 * **Interaction:**
 * - Cell is clickable (handled by parent CompareTable)
 * - Clicking opens modal with full details
 *
 * @since Phase 1.11 - Run Comparison Feature
 */

'use client'

import * as React from 'react'
import type { Database } from '@playze/shared-types'
import { useTranslations } from 'next-intl'

type OperationResult = Database['public']['Tables']['validai_operation_results']['Row']

interface CompareResultCellProps {
  result: OperationResult | undefined
  operationType: string
}

/**
 * Renders colored dot for traffic light and validation
 */
function StatusDot({ color, label }: { color: 'green' | 'yellow' | 'red'; label: string }) {
  const colorMap = {
    green: 'hsl(142, 76%, 36%)', // Green
    yellow: 'hsl(48, 96%, 53%)', // Yellow
    red: 'hsl(0, 84%, 60%)', // Red
  }

  return (
    <div
      className="h-3 w-3 rounded-full"
      style={{ backgroundColor: colorMap[color] }}
      aria-label={label}
      title={label}
    />
  )
}

/**
 * Compare Result Cell
 *
 * Displays compact result based on operation type.
 * Returns "-" if no result exists (e.g., operation was added after run).
 *
 * @param result - Operation result to display (undefined if no result)
 * @param operationType - Type of operation for conditional rendering
 * @returns Compact result display
 */
export function CompareResultCell({ result, operationType }: CompareResultCellProps) {
  const t = useTranslations('runs.compare')

  // No result (operation didn't exist in this run)
  if (!result) {
    return <span className="text-muted-foreground">-</span>
  }

  const structured = result.structured_output as any

  // Failed operations
  if (result.status === 'failed') {
    return (
      <span className="text-destructive text-xs" title={result.error_message || 'Failed'}>
        Error
      </span>
    )
  }

  // Pending/Processing operations
  if (result.status === 'pending' || result.status === 'processing') {
    return <span className="text-muted-foreground text-xs">...</span>
  }

  // Type-specific rendering (COMPACT - minimize space usage)
  switch (operationType) {
    case 'validation': {
      if (structured?.result === true) {
        return (
          <div className="flex items-center justify-center">
            <StatusDot color="green" label="True" />
          </div>
        )
      } else if (structured?.result === false) {
        return (
          <div className="flex items-center justify-center">
            <StatusDot color="red" label="False" />
          </div>
        )
      }
      break
    }

    case 'traffic_light': {
      const trafficLight = structured?.traffic_light

      if (trafficLight === 'green') {
        return (
          <div className="flex items-center justify-center">
            <StatusDot color="green" label="Green" />
          </div>
        )
      } else if (trafficLight === 'yellow') {
        return (
          <div className="flex items-center justify-center">
            <StatusDot color="yellow" label="Yellow" />
          </div>
        )
      } else if (trafficLight === 'red') {
        return (
          <div className="flex items-center justify-center">
            <StatusDot color="red" label="Red" />
          </div>
        )
      }
      break
    }

    case 'rating': {
      const value = structured?.value

      if (value !== undefined && value !== null) {
        return <span className="text-sm font-medium">{value}</span>
      }
      break
    }

    case 'extraction': {
      const items = structured?.items

      if (Array.isArray(items)) {
        if (items.length === 1) {
          // Show single item, truncated to 30 chars
          const item = String(items[0])
          const truncated = item.length > 30 ? `${item.substring(0, 30)}...` : item
          return (
            <span className="text-sm" title={item}>
              {truncated}
            </span>
          )
        } else if (items.length > 1) {
          // Show count
          return (
            <span className="text-sm text-muted-foreground" title={`${items.length} values extracted`}>
              {items.length} values
            </span>
          )
        }
      }
      break
    }

    case 'classification': {
      const classification = structured?.classification

      if (classification) {
        // Truncate to 30 chars
        const truncated =
          classification.length > 30 ? `${classification.substring(0, 30)}...` : classification
        return (
          <span className="text-sm" title={classification}>
            {truncated}
          </span>
        )
      }
      break
    }

    case 'analysis': {
      const conclusion = structured?.conclusion || structured?.comment

      if (conclusion) {
        // Truncate to 40 chars
        const truncated = conclusion.length > 40 ? `${conclusion.substring(0, 40)}...` : conclusion
        return (
          <span className="text-sm text-muted-foreground" title={conclusion}>
            {truncated}
          </span>
        )
      }
      break
    }

    case 'generic': {
      const response = structured?.response || result.response_text

      if (response) {
        // Truncate to 40 chars
        const truncated = response.length > 40 ? `${response.substring(0, 40)}...` : response
        return (
          <span className="text-sm text-muted-foreground" title={response}>
            {truncated}
          </span>
        )
      }
      break
    }
  }

  // Fallback: show raw response text (truncated)
  if (result.response_text) {
    const truncated =
      result.response_text.length > 40
        ? `${result.response_text.substring(0, 40)}...`
        : result.response_text
    return (
      <span className="text-sm text-muted-foreground" title={result.response_text}>
        {truncated}
      </span>
    )
  }

  // No data to show
  return <span className="text-muted-foreground">-</span>
}
