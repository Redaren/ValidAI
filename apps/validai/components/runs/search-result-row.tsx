/**
 * Search Result Row Component
 *
 * @module components/runs/search-result-row
 * @description
 * Table row for search view with expandable details.
 * Business-focused with support for thinking blocks.
 *
 * **Features:**
 * - Collapsed: Shows #, Area, Name, Type icon, Result
 * - Expanded: Shows description, smart-rendered result, thinking blocks
 * - Type-specific result rendering (validation, traffic light, rating, etc.)
 * - Whole row clickable for expansion
 *
 * @since Phase 4 - Search View
 */

'use client'

import { useState } from 'react'
import {
  CheckCircle2,
  XCircle,
  Circle,
  Tag,
  FileText,
  Search,
  BarChart3,
  Lightbulb,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Database } from '@playze/shared-types'
import { SmartCommentRenderer } from './smart-comment-renderer'
import { useTranslations } from 'next-intl'

type OperationResult = Database['public']['Tables']['validai_operation_results']['Row']

interface SearchResultRowProps {
  /** The operation result to display */
  result: OperationResult
  /** The sequential operation number to display (1, 2, 3...) */
  operationNumber: number
}

/**
 * Get type icon based on operation type
 */
function getTypeIcon(operationType: string) {
  switch (operationType) {
    case 'validation':
      return <CheckCircle2 className="h-4 w-4" />
    case 'extraction':
      return <Search className="h-4 w-4" />
    case 'rating':
      return <BarChart3 className="h-4 w-4" />
    case 'classification':
      return <Tag className="h-4 w-4" />
    case 'analysis':
      return <FileText className="h-4 w-4" />
    case 'traffic_light':
      return <Lightbulb className="h-4 w-4" />
    case 'generic':
      return <FileText className="h-4 w-4" />
    default:
      return <Circle className="h-4 w-4" />
  }
}

/**
 * Get type tooltip text
 */
function getTypeTooltip(operationType: string, t: any): string {
  return t(`operationTypes.${operationType}`)
}

/**
 * Render result column based on operation type
 */
function renderResult(result: OperationResult, t: any): React.ReactNode {
  const snapshot = result.operation_snapshot as any
  const operationType = snapshot?.operation_type || 'generic'
  const structured = result.structured_output as any

  // Failed operations
  if (result.status === 'failed') {
    return <span className="text-destructive text-sm">Error</span>
  }

  // Pending operations
  if (result.status === 'pending') {
    return <span className="text-muted-foreground text-sm">Pending...</span>
  }

  // Type-specific rendering
  switch (operationType) {
    case 'validation': {
      if (structured?.result === true) {
        return (
          <div className="flex items-center gap-1.5">
            <div
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: 'hsl(142, 76%, 36%)' }}
              aria-label="True"
            />
            <span className="text-sm font-medium">{t('resultDisplay.true')}</span>
          </div>
        )
      } else if (structured?.result === false) {
        return (
          <div className="flex items-center gap-1.5">
            <div
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: 'hsl(0, 84%, 60%)' }}
              aria-label="False"
            />
            <span className="text-sm font-medium">{t('resultDisplay.false')}</span>
          </div>
        )
      }
      break
    }

    case 'traffic_light': {
      const trafficLight = structured?.traffic_light
      if (trafficLight === 'green') {
        return (
          <div className="flex items-center gap-1.5">
            <div
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: 'hsl(142, 76%, 36%)' }}
              aria-label="Green"
            />
            <span className="text-sm font-medium">{t('resultDisplay.green')}</span>
          </div>
        )
      } else if (trafficLight === 'yellow') {
        return (
          <div className="flex items-center gap-1.5">
            <div
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: 'hsl(48, 96%, 53%)' }}
              aria-label="Yellow"
            />
            <span className="text-sm font-medium">{t('resultDisplay.yellow')}</span>
          </div>
        )
      } else if (trafficLight === 'red') {
        return (
          <div className="flex items-center gap-1.5">
            <div
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: 'hsl(0, 84%, 60%)' }}
              aria-label="Red"
            />
            <span className="text-sm font-medium">{t('resultDisplay.red')}</span>
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
          // Show single item, truncated
          const item = items[0]
          const truncated = item.length > 50 ? `${item.substring(0, 50)}...` : item
          return <span className="text-sm">{truncated}</span>
        } else if (items.length > 1) {
          // Show count
          return (
            <span className="text-sm text-muted-foreground">
              {t('resultDisplay.itemsExtracted', { count: items.length })}
            </span>
          )
        }
      }
      break
    }

    case 'classification': {
      const classification = structured?.classification
      if (classification) {
        const truncated =
          classification.length > 40
            ? `${classification.substring(0, 40)}...`
            : classification
        return <span className="text-sm">{truncated}</span>
      }
      break
    }

    case 'analysis': {
      const conclusion = structured?.conclusion || structured?.comment
      if (conclusion) {
        const truncated =
          conclusion.length > 60 ? `${conclusion.substring(0, 60)}...` : conclusion
        return <span className="text-sm text-muted-foreground">{truncated}</span>
      }
      break
    }

    case 'generic': {
      const response = structured?.response || result.response_text
      if (response) {
        const truncated =
          response.length > 60 ? `${response.substring(0, 60)}...` : response
        return <span className="text-sm text-muted-foreground">{truncated}</span>
      }
      break
    }
  }

  // Fallback
  return <span className="text-sm text-muted-foreground">—</span>
}

/**
 * Render expanded content based on operation type
 */
function renderExpandedResult(result: OperationResult, t: any): React.ReactNode {
  const snapshot = result.operation_snapshot as any
  const operationType = snapshot?.operation_type || 'generic'
  const structured = result.structured_output as any

  // Failed operations
  if (result.status === 'failed') {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
        <p className="text-sm font-medium text-destructive">
          {result.error_message || 'Operation failed'}
        </p>
      </div>
    )
  }

  // Type-specific expanded rendering
  switch (operationType) {
    case 'validation': {
      const resultValue = structured?.result
      const comment = structured?.comment || result.response_text
      return (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            {resultValue === true ? (
              <>
                <div
                  className="h-5 w-5 rounded-full"
                  style={{ backgroundColor: 'hsl(142, 76%, 36%)' }}
                  aria-label="True"
                />
                <span className="text-lg font-semibold">{t('resultDisplay.true')}</span>
              </>
            ) : (
              <>
                <div
                  className="h-5 w-5 rounded-full"
                  style={{ backgroundColor: 'hsl(0, 84%, 60%)' }}
                  aria-label="False"
                />
                <span className="text-lg font-semibold">{t('resultDisplay.false')}</span>
              </>
            )}
          </div>
          {comment && <SmartCommentRenderer content={comment} />}
        </div>
      )
    }

    case 'traffic_light': {
      const trafficLight = structured?.traffic_light
      const comment = structured?.comment || result.response_text
      return (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            {trafficLight === 'green' && (
              <>
                <div
                  className="h-5 w-5 rounded-full"
                  style={{ backgroundColor: 'hsl(142, 76%, 36%)' }}
                  aria-label="Green"
                />
                <span className="text-lg font-semibold">{t('resultDisplay.green')}</span>
              </>
            )}
            {trafficLight === 'yellow' && (
              <>
                <div
                  className="h-5 w-5 rounded-full"
                  style={{ backgroundColor: 'hsl(48, 96%, 53%)' }}
                  aria-label="Yellow"
                />
                <span className="text-lg font-semibold">{t('resultDisplay.yellow')}</span>
              </>
            )}
            {trafficLight === 'red' && (
              <>
                <div
                  className="h-5 w-5 rounded-full"
                  style={{ backgroundColor: 'hsl(0, 84%, 60%)' }}
                  aria-label="Red"
                />
                <span className="text-lg font-semibold">{t('resultDisplay.red')}</span>
              </>
            )}
          </div>
          {comment && <SmartCommentRenderer content={comment} />}
        </div>
      )
    }

    case 'rating': {
      const value = structured?.value
      const comment = structured?.comment || result.response_text
      return (
        <div className="space-y-3">
          <div>
            <span className="text-2xl font-bold">{value}</span>
          </div>
          {comment && <SmartCommentRenderer content={comment} />}
        </div>
      )
    }

    case 'extraction': {
      const items = structured?.items
      const comment = structured?.comment
      return (
        <div className="space-y-3">
          {Array.isArray(items) && items.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-medium">
                {t('resultDisplay.itemsExtracted', { count: items.length })}:
              </p>
              <ul className="list-inside list-disc space-y-1 pl-2">
                {items.map((item, idx) => (
                  <li key={idx} className="text-sm">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {comment && <SmartCommentRenderer content={comment} />}
        </div>
      )
    }

    case 'classification': {
      const classification = structured?.classification
      const comment = structured?.comment || result.response_text
      return (
        <div className="space-y-3">
          <div>
            <p className="mb-1 text-sm font-medium">Classification:</p>
            <p className="text-lg font-semibold">{classification}</p>
          </div>
          {comment && <SmartCommentRenderer content={comment} />}
        </div>
      )
    }

    case 'analysis': {
      const conclusion = structured?.conclusion
      const comment = structured?.comment || result.response_text
      return (
        <div className="space-y-3">
          {conclusion && (
            <div>
              <p className="mb-1 text-sm font-medium">Conclusion:</p>
              <SmartCommentRenderer content={conclusion} />
            </div>
          )}
          {comment && comment !== conclusion && (
            <div>
              <p className="mb-1 text-sm font-medium">Detailed Analysis:</p>
              <SmartCommentRenderer content={comment} />
            </div>
          )}
        </div>
      )
    }

    case 'generic': {
      const response = structured?.response || result.response_text
      return response ? <SmartCommentRenderer content={response} /> : null
    }

    default:
      return result.response_text ? (
        <SmartCommentRenderer content={result.response_text} />
      ) : null
  }
}

/**
 * SearchResultRow Component
 */
export function SearchResultRow({ result, operationNumber }: SearchResultRowProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const t = useTranslations('runs.search')
  const tDetail = useTranslations('runs.detail')

  const snapshot = result.operation_snapshot as any
  const operationType = snapshot?.operation_type || 'generic'
  const operationName = snapshot?.name || 'Unnamed Operation'
  const operationDescription = snapshot?.description
  const operationArea = snapshot?.area || 'Default'

  // Truncate area if too long
  const truncatedArea =
    operationArea.length > 24 ? `${operationArea.substring(0, 24)}...` : operationArea

  return (
    <>
      {/* Collapsed Row */}
      <tr
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          'cursor-pointer transition-colors hover:bg-muted/50',
          isExpanded && 'bg-muted/30'
        )}
        title={t('expandRow')}
      >
        {/* # Column */}
        <td className="px-4 py-3 text-center text-sm text-muted-foreground">
          {operationNumber}
        </td>

        {/* Area Column */}
        <td className="px-4 py-3" title={operationArea}>
          <span className="text-sm">{truncatedArea}</span>
        </td>

        {/* Name Column */}
        <td className="px-4 py-3">
          <span className="text-sm font-medium">{operationName}</span>
        </td>

        {/* Type Column */}
        <td className="px-4 py-3 text-center" title={getTypeTooltip(operationType, t)}>
          <div className="flex justify-center text-muted-foreground">
            {getTypeIcon(operationType)}
          </div>
        </td>

        {/* Result Column */}
        <td className="px-4 py-3">{renderResult(result, t)}</td>
      </tr>

      {/* Expanded Row */}
      {isExpanded && (
        <tr>
          <td colSpan={5} className="bg-muted/20 px-4 py-6">
            <div className="space-y-4">
              {/* Operation Name and Description */}
              <div>
                <h3 className="text-lg font-semibold">{operationName}</h3>
                {operationDescription && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {operationDescription}
                  </p>
                )}
              </div>

              {/* Result Section */}
              <div>
                <p className="mb-2 text-sm font-medium">{t('result')}:</p>
                <div className="rounded-lg border bg-background p-4">
                  {renderExpandedResult(result, t)}
                </div>
              </div>

              {/* Thinking Blocks */}
              {result.thinking_blocks &&
                Array.isArray(result.thinking_blocks) &&
                result.thinking_blocks.length > 0 && (
                  <div>
                    <p className="mb-2 text-sm font-medium">{t('thinking')}:</p>
                    <div className="space-y-2">
                      {(result.thinking_blocks as any[]).map((block, idx) => {
                        const content =
                          typeof block === 'string'
                            ? block
                            : block.thinking || block.text || ''

                        return (
                          <div
                            key={idx}
                            className="rounded-lg border bg-muted/50 p-4"
                          >
                            <pre className="whitespace-pre-wrap text-sm font-sans">
                              {content}
                            </pre>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
