/**
 * Compare Result Modal Component
 *
 * @module components/runs/compare-result-modal
 * @description
 * Modal dialog that displays expanded operation result details.
 * Reuses the same look and feel as the search view expanded rows.
 *
 * **Features:**
 * - Full operation details (name, type, prompt, response)
 * - Structured output display
 * - Thinking blocks (if available)
 * - Performance metrics (tokens, execution time, model)
 * - Error details (if failed)
 *
 * **Design:**
 * - Same styling as search view expanded content
 * - Smart rendering based on operation type
 * - Accessible with keyboard navigation
 *
 * @since Phase 1.11 - Run Comparison Feature
 */

'use client'

import * as React from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@playze/shared-ui'
import type { Database } from '@playze/shared-types'
import { SmartCommentRenderer } from './smart-comment-renderer'
import { useTranslations } from 'next-intl'

type OperationResult = Database['public']['Tables']['validai_operation_results']['Row']

interface CompareResultModalProps {
  result: OperationResult | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface OperationSnapshot {
  id: string
  name: string
  area: string
  operation_type: string
  prompt: string
  description?: string
  [key: string]: unknown
}

/**
 * Formats tokens for display
 */
function formatTokens(tokens: any): string {
  if (!tokens) return 'N/A'

  const { prompt_tokens, completion_tokens, total_tokens } = tokens
  return `${total_tokens || 0} total (${prompt_tokens || 0} prompt + ${completion_tokens || 0} completion)`
}

/**
 * Formats execution time in milliseconds
 */
function formatExecutionTime(ms: number | null): string {
  if (!ms) return 'N/A'

  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

/**
 * Compare Result Modal
 *
 * Shows full operation result details in a modal dialog.
 * Uses same rendering logic as search view expanded rows.
 *
 * @param result - Operation result to display
 * @param open - Modal open state
 * @param onOpenChange - Callback when modal state changes
 * @returns Modal dialog with expanded result details
 */
export function CompareResultModal({ result, open, onOpenChange }: CompareResultModalProps) {
  const t = useTranslations('runs.technical')

  if (!result) {
    return null
  }

  const snapshot = result.operation_snapshot as OperationSnapshot
  const structured = result.structured_output as any
  const thinkingBlocks = result.thinking_blocks as any

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{snapshot.name}</DialogTitle>
          <DialogDescription>
            {snapshot.area} • {snapshot.operation_type}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Description */}
          {snapshot.description && (
            <div>
              <h4 className="mb-1 text-sm font-semibold">Description</h4>
              <p className="text-sm text-muted-foreground">{snapshot.description}</p>
            </div>
          )}

          {/* Prompt */}
          <div>
            <h4 className="mb-1 text-sm font-semibold">{t('prompt')}</h4>
            <div className="rounded-lg bg-muted p-3 text-sm font-mono">
              <SmartCommentRenderer content={snapshot.prompt} />
            </div>
          </div>

          {/* Error (if failed) */}
          {result.status === 'failed' && result.error_message && (
            <div>
              <h4 className="mb-1 text-sm font-semibold text-destructive">Error</h4>
              <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                {result.error_message}
              </div>
            </div>
          )}

          {/* Structured Output */}
          {structured && result.status === 'completed' && (
            <div>
              <h4 className="mb-1 text-sm font-semibold">{t('structuredOutput')}</h4>
              <div className="rounded-lg bg-muted p-3">
                <pre className="text-xs overflow-x-auto">{JSON.stringify(structured, null, 2)}</pre>
              </div>
            </div>
          )}

          {/* Response Text */}
          {result.response_text && (
            <div>
              <h4 className="mb-1 text-sm font-semibold">{t('response')}</h4>
              <div className="rounded-lg bg-muted p-3 text-sm">
                <SmartCommentRenderer content={result.response_text} />
              </div>
            </div>
          )}

          {/* Thinking Blocks (Gemini feature) */}
          {thinkingBlocks && Array.isArray(thinkingBlocks) && thinkingBlocks.length > 0 && (
            <div>
              <h4 className="mb-1 text-sm font-semibold">{t('thinking')}</h4>
              <div className="space-y-2">
                {thinkingBlocks.map((block: any, idx: number) => {
                  // Extract text from block - handle both string and object formats
                  const blockText = typeof block === 'string'
                    ? block
                    : (block?.text || block?.thinking || block?.content || JSON.stringify(block))

                  return (
                    <div key={idx} className="rounded-lg bg-muted/50 p-3 text-sm italic">
                      <SmartCommentRenderer content={blockText} />
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Performance Metrics */}
          <div>
            <h4 className="mb-2 text-sm font-semibold">{t('metrics')}</h4>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Model:</span>{' '}
                <span className="font-mono">{result.model_used || 'N/A'}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Execution Time:</span>{' '}
                <span className="font-mono">{formatExecutionTime(result.execution_time_ms)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Tokens:</span>{' '}
                <span className="font-mono text-xs">{formatTokens(result.tokens_used)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Cache Hit:</span>{' '}
                <span className="font-mono">{result.cache_hit ? 'Yes' : 'No'}</span>
              </div>
              {result.retry_count !== null && result.retry_count > 0 && (
                <div>
                  <span className="text-muted-foreground">Retries:</span>{' '}
                  <span className="font-mono">{result.retry_count}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
