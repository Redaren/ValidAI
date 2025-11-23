/**
 * Operation Results Table Component
 *
 * @module components/runs/operation-results-table
 * @description
 * Displays operation results in an expandable table format.
 * Shows structured output, thinking blocks, and execution metrics.
 *
 * **Features:**
 * - Expandable rows with detailed view
 * - Status badges with color coding
 * - Token usage and execution time display
 * - Structured output visualizer integration
 * - Cache hit indicators
 *
 * @since Phase 1.8
 */

'use client'

import { useState } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Badge,
  Button,
} from '@playze/shared-ui'
import { ChevronDown, ChevronRight, Zap } from 'lucide-react'
import { StructuredOutputVisualizer } from '@/components/workbench/structured-output-visualizer'
import { SmartCommentRenderer } from './smart-comment-renderer'
import type { Database } from '@playze/shared-types'
import { useTranslations } from 'next-intl'

type OperationResult = Database['public']['Tables']['validai_operation_results']['Row']

/**
 * Props for OperationResultsTable component
 */
interface OperationResultsTableProps {
  /** Array of operation results to display */
  results: OperationResult[]
}

/**
 * Renders operation status badge
 */
function OperationStatusBadge({ status }: { status: string }) {
  const t = useTranslations('runs.status')

  if (status === 'completed') {
    return (
      <Badge variant="outline" className="border-green-500 text-green-700">
        {t('completed')}
      </Badge>
    )
  }

  if (status === 'failed') {
    return <Badge variant="destructive">{t('failed')}</Badge>
  }

  if (status === 'pending') {
    return <Badge variant="secondary">{t('pending')}</Badge>
  }

  return <Badge variant="outline">{status}</Badge>
}

/**
 * Formats execution time in milliseconds
 */
function formatExecutionTime(ms: number | null): string {
  if (!ms) return '-'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

/**
 * Formats token count
 */
function formatTokens(tokensUsed: any): string {
  if (!tokensUsed) return '-'
  const total = tokensUsed.input + tokensUsed.output
  return total.toLocaleString()
}

/**
 * Operation Results Table
 *
 * Displays all operation results for a run in a table with expandable rows.
 * Each row can be expanded to show detailed output, structured data, and metadata.
 *
 * **Table Columns:**
 * - # - Execution order
 * - Operation - Operation name and type
 * - Status - Completion status badge
 * - Time - Execution time
 * - Tokens - Total tokens used
 *
 * **Expanded View:**
 * - Response text
 * - Structured output (JSON visualizer)
 * - Thinking blocks (if available)
 * - Error message (if failed)
 * - Model used
 * - Cache hit indicator
 *
 * @param results - Array of operation results
 * @returns Table component
 *
 * @example
 * ```tsx
 * const { data: results } = useOperationResults(runId)
 * return <OperationResultsTable results={results || []} />
 * ```
 */
export function OperationResultsTable({ results }: OperationResultsTableProps) {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const t = useTranslations('runs.table')
  const tDetail = useTranslations('runs.detail')

  const toggleRow = (id: string) => {
    const newExpanded = new Set(expandedRows)
    if (newExpanded.has(id)) {
      newExpanded.delete(id)
    } else {
      newExpanded.add(id)
    }
    setExpandedRows(newExpanded)
  }

  if (results.length === 0) {
    return (
      <div className="flex min-h-[200px] items-center justify-center rounded-lg border">
        <p className="text-sm text-muted-foreground">No operation results yet</p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border flex flex-col min-h-0">
      <div className="overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40px]"></TableHead>
            <TableHead className="w-[60px]">#</TableHead>
            <TableHead>{t('operation')}</TableHead>
            <TableHead>{t('status')}</TableHead>
            <TableHead className="text-right">{t('time')}</TableHead>
            <TableHead className="text-right">{t('tokens')}</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {results.map((result) => {
            const isExpanded = expandedRows.has(result.id)
            const operationSnapshot = result.operation_snapshot as {
              name: string
              operation_type: string
            }

            return (
              <React.Fragment key={result.id}>
                {/* Main Row */}
                <TableRow
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => toggleRow(result.id)}
                >
                  <TableCell>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </Button>
                  </TableCell>

                  <TableCell className="font-mono text-sm">{result.execution_order + 1}</TableCell>

                  <TableCell>
                    <div>
                      <p className="font-medium">{operationSnapshot.name}</p>
                      <p className="text-xs text-muted-foreground capitalize">
                        {operationSnapshot.operation_type}
                      </p>
                    </div>
                  </TableCell>

                  <TableCell>
                    <OperationStatusBadge status={result.status} />
                  </TableCell>

                  <TableCell className="text-right font-mono text-sm">
                    {formatExecutionTime(result.execution_time_ms)}
                  </TableCell>

                  <TableCell className="text-right font-mono text-sm">
                    <div className="flex items-center justify-end gap-1">
                      {result.cache_hit && (
                        <Zap
                          className="h-3 w-3 text-yellow-500"
                          aria-label="Cache hit - reduced cost"
                        />
                      )}
                      {formatTokens(result.tokens_used)}
                    </div>
                  </TableCell>
                </TableRow>

                {/* Expanded Details */}
                {isExpanded && (
                  <TableRow>
                    <TableCell colSpan={6} className="bg-muted/30 p-6">
                      <div className="space-y-4">
                        {/* Metadata */}
                        <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
                          <div>
                            <p className="text-muted-foreground">{tDetail('model')}</p>
                            <p className="font-mono">{result.model_used || '-'}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">{t('time')}</p>
                            <p className="font-mono">
                              {formatExecutionTime(result.execution_time_ms)}
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">{t('tokens')}</p>
                            <p className="font-mono">{formatTokens(result.tokens_used)}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">{tDetail('cache')}</p>
                            <p className="font-mono">
                              {(() => {
                                const tokens = result.tokens_used as any
                                if (tokens?.cached_write > 0) {
                                  return <span className="text-blue-600">Created: {tokens.cached_write.toLocaleString()} tokens</span>
                                }
                                if (tokens?.cached_read > 0) {
                                  return <span className="text-green-600">Hit: {tokens.cached_read.toLocaleString()} tokens</span>
                                }
                                return <span className="text-muted-foreground">{tDetail('cacheMiss')}</span>
                              })()}
                            </p>
                          </div>
                        </div>

                        {/* Error Message */}
                        {result.error_message && (
                          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
                            <p className="mb-1 text-sm font-medium text-destructive">
                              {tDetail('error')} {result.error_type && `(${result.error_type})`}
                            </p>
                            <p className="text-sm text-destructive/90">{result.error_message}</p>
                            {result.retry_count !== null && result.retry_count > 0 && (
                              <p className="mt-2 text-xs text-muted-foreground">
                                Retried {result.retry_count} time(s)
                              </p>
                            )}
                          </div>
                        )}

                        {/* Response Text */}
                        {result.response_text && (
                          <div>
                            <p className="mb-2 text-sm font-medium">{tDetail('response')}</p>
                            <SmartCommentRenderer
                              content={result.response_text}
                              isFailed={result.status === 'failed'}
                            />
                          </div>
                        )}

                        {/* Structured Output */}
                        {result.structured_output && (
                          <div>
                            <p className="mb-2 text-sm font-medium">Structured Output</p>
                            <StructuredOutputVisualizer
                              data={result.structured_output}
                              originalType="json"
                            />
                          </div>
                        )}

                        {/* Thinking Blocks */}
                        {result.thinking_blocks && Array.isArray(result.thinking_blocks) && (
                          <div>
                            <p className="mb-2 text-sm font-medium">{tDetail('thinking')}</p>
                            <div className="space-y-2">
                              {(result.thinking_blocks as any[]).map((block, idx) => {
                                // Handle both string and object formats
                                // Support both 'thinking' (new) and 'text' (old) fields for backwards compatibility
                                const content = typeof block === 'string'
                                  ? block
                                  : (block.thinking || block.text || '')

                                return (
                                  <div key={idx} className="rounded-lg border bg-muted/50 p-4">
                                    <pre className="whitespace-pre-wrap text-sm">
                                      {content}
                                    </pre>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </React.Fragment>
            )
          })}
        </TableBody>
      </Table>
      </div>
    </div>
  )
}

// Add React import
import React from 'react'
