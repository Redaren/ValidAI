/**
 * @fileoverview Workbench Output Component - Displays LLM test results with rich formatting
 * @module components/workbench/workbench-output
 */

"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Download, AlertCircle, Clock, Coins, Trash2, FileJson } from "lucide-react"
import { useWorkbenchStore } from "@/stores/workbench-store"
import { useWorkbenchTest } from "@/hooks/use-workbench-test"
import type { ConversationMessage } from "@/lib/validations"
import { extractStructuredContent } from "@/lib/utils/content-detector"
import { StructuredOutputVisualizer } from "@/components/workbench/structured-output-visualizer"

/**
 * Workbench Output Component
 *
 * @component
 * @description
 * Comprehensive display interface for LLM test results with advanced visualization features.
 * Handles both simple text responses and complex structured outputs with proper formatting.
 *
 * ## Features
 * - **Conversation History**: Full message thread with user/assistant alternation
 * - **Token Analytics**: Real-time token usage with cache performance metrics
 * - **Structured Data**: Auto-detection and visualization of JSON/XML responses
 * - **Special Blocks**: Renders thinking blocks, citations, and cache indicators
 * - **Export Function**: Download conversations as JSON for analysis
 * - **Performance Metrics**: Execution time, cache hit rates, cost savings
 *
 * ## Cache Performance Display
 * - 🔷 Cache Created: Indicates new cache breakpoint (25% extra cost)
 * - 🎯 Cache Hit: Shows cache reuse (90% cost savings)
 * - Hit rate calculation: (cached_read / total_cacheable) * 100
 * - Cost savings: Compares actual cost vs. non-cached scenario
 *
 * ## Advanced Mode Features
 * - Detailed token breakdowns per message
 * - Context window usage tracking
 * - Manual structured data parsing toggle
 * - Advanced settings override display
 *
 * @returns {JSX.Element} Rendered output display with results
 */
export function WorkbenchOutput() {
  const {
    conversationHistory,
    executionStatus,
    advancedSettings,
    advancedMode,
    autoParseStructuredData,
    clearConversation
  } = useWorkbenchStore()

  const workbenchTest = useWorkbenchTest()

  // Track which messages have been manually parsed (by index)
  const [manuallyParsedMessages, setManuallyParsedMessages] = useState<Set<number>>(new Set())

  /**
   * Get status badge component for current execution
   *
   * @function getStatusBadge
   * @returns {JSX.Element | null} Color-coded status badge or null if idle
   *
   * @description
   * Generates visual status indicators based on real-time execution state.
   * Used to provide immediate feedback during test execution.
   *
   * @badge-states
   * - **Pending** (Yellow ⏳): Request queued, awaiting processing
   * - **Processing** (Blue ⚡): LLM actively generating response
   * - **Completed** (Green ✓): Response received successfully
   * - **Failed** (Red ✗): Error occurred during execution
   */
  const getStatusBadge = () => {
    if (executionStatus === 'pending') {
      return <Badge variant="outline" className="gap-1 bg-yellow-500/10 text-yellow-700">⏳ Pending</Badge>
    }
    if (executionStatus === 'processing') {
      return <Badge variant="outline" className="gap-1 bg-blue-500/10 text-blue-700">⚡ Processing</Badge>
    }
    if (executionStatus === 'completed') {
      return <Badge variant="outline" className="gap-1 bg-green-500/10 text-green-700">✓ Completed</Badge>
    }
    if (executionStatus === 'failed') {
      return <Badge variant="outline" className="gap-1 bg-red-500/10 text-red-700">✗ Failed</Badge>
    }
    return null
  }

  /**
   * Extract text from content (handles both string and content blocks array)
   *
   * Content can be:
   * - string: Simple text message
   * - array: Content blocks [{type: 'document', ...}, {type: 'text', text: '...'}]
   *
   * @param content - Message content (string or array)
   * @returns Extracted text string
   */
  const extractText = (content: string | unknown[]): string => {
    if (typeof content === 'string') {
      return content
    }

    // Content is an array of blocks - extract text blocks
    const textBlocks = content.filter((block): block is { type: string; text: string } =>
      typeof block === 'object' && block !== null && 'type' in block && block.type === 'text'
    )
    return textBlocks.map((block) => block.text).join(' ')
  }


  /**
   * Truncate document data in content for cleaner exports
   *
   * Replaces full base64 document data with preview + size info.
   * Makes exported JSON readable and manageable (60x smaller).
   *
   * @param content - Message content (string or content blocks array)
   * @returns Content with truncated document data
   */
  const truncateDocumentData = (content: string | unknown[]): string | unknown[] => {
    if (typeof content === 'string') return content

    return content.map(block => {
      if (typeof block === 'object' && block !== null &&
          'type' in block && block.type === 'document' &&
          'source' in block && typeof block.source === 'object' && block.source !== null &&
          'data' in block.source && typeof block.source.data === 'string') {
        const originalSize = block.source.data.length
        return {
          ...block,
          source: {
            ...block.source,
            data: block.source.data.substring(0, 20) + `... [${originalSize.toLocaleString()} bytes truncated]`
          }
        }
      }
      return block
    })
  }

  /**
   * Export conversation history as JSON file
   *
   * @function exportConversation
   * @description
   * Downloads the complete conversation history as a JSON file for external analysis.
   * Automatically truncates large document data to keep file sizes manageable.
   *
   * ## Export Format
   * ```json
   * {
   *   "timestamp": "2025-10-03T12:34:56Z",
   *   "conversation": [
   *     {
   *       "role": "user" | "assistant",
   *       "content": "...",
   *       "metadata": { ... },
   *       "tokensUsed": { ... }
   *     }
   *   ]
   * }
   * ```
   *
   * ## Data Processing
   * - Document/file data truncated to 20 bytes + size indicator
   * - All metadata and token information preserved
   * - Timestamps maintained for conversation reconstruction
   *
   * @filename-format `workbench-conversation-{timestamp}.json`
   */
  const exportConversation = () => {
    if (conversationHistory.length === 0) return

    const exportData = {
      timestamp: new Date().toISOString(),
      conversation: conversationHistory.map(msg => ({
        ...msg,
        content: truncateDocumentData(msg.content)
      }))
    }

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json'
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `workbench-conversation-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Loading state
  if (workbenchTest.isPending) {
    return (
      <Card className="p-8">
        <div className="flex flex-col items-center justify-center space-y-4">
          <div className="relative">
            <div className="h-12 w-12 rounded-full border-4 border-primary/20 animate-pulse" />
            <div className="absolute inset-0 h-12 w-12 rounded-full border-4 border-t-primary animate-spin" />
          </div>
          <p className="text-sm text-muted-foreground">Processing your request...</p>
        </div>
      </Card>
    )
  }

  // Error state
  if (workbenchTest.isError) {
    return (
      <Card className="p-6 border-destructive/50 bg-destructive/5">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
          <div className="flex-1 space-y-2">
            <p className="text-sm font-medium text-destructive">Error</p>
            <p className="text-sm text-muted-foreground">
              {workbenchTest.error?.message || 'An error occurred'}
            </p>
          </div>
        </div>
      </Card>
    )
  }

  // Empty state
  if (conversationHistory.length === 0) {
    return (
      <Card className="p-12">
        <div className="text-center space-y-2">
          <p className="text-sm text-muted-foreground">
            Results will appear here after test
          </p>
          <p className="text-xs text-muted-foreground">
            Configure your test settings above and click &quot;Test&quot; to begin
          </p>
        </div>
      </Card>
    )
  }

  // Conversation history display
  const lastMessage = conversationHistory[conversationHistory.length - 1]
  const totalTokens = conversationHistory.reduce(
    (sum, msg) => {
      // Assistant messages have tokensUsed
      if (msg.tokensUsed) {
        return sum + (msg.tokensUsed.input || 0) + (msg.tokensUsed.output || 0)
      }
      // User messages have metadata with inputTokens
      if (msg.metadata) {
        return sum + (msg.metadata.inputTokens || 0) + (msg.metadata.outputTokens || 0)
      }
      return sum
    },
    0
  )
  const totalCachedRead = conversationHistory.reduce(
    (sum, msg) => {
      // Check tokensUsed first (assistant messages)
      if (msg.tokensUsed?.cached_read !== undefined) {
        return sum + msg.tokensUsed.cached_read
      }
      // Check metadata (user messages)
      if (msg.metadata?.cachedReadTokens !== undefined) {
        return sum + msg.metadata.cachedReadTokens
      }
      return sum
    },
    0
  )
  const totalCachedWrite = conversationHistory.reduce(
    (sum, msg) => {
      // Check tokensUsed first (assistant messages)
      if (msg.tokensUsed?.cached_write !== undefined) {
        return sum + msg.tokensUsed.cached_write
      }
      // Check metadata (user messages)
      if (msg.metadata?.cachedWriteTokens !== undefined) {
        return sum + msg.metadata.cachedWriteTokens
      }
      return sum
    },
    0
  )
  const totalInputTokens = conversationHistory.reduce(
    (sum, msg) => {
      // Check tokensUsed first (assistant messages)
      if (msg.tokensUsed?.input !== undefined) {
        return sum + msg.tokensUsed.input
      }
      // Check metadata (user messages)
      if (msg.metadata?.inputTokens !== undefined) {
        return sum + msg.metadata.inputTokens
      }
      return sum
    },
    0
  )

  // Calculate cache performance metrics
  const totalCacheableTokens = totalInputTokens + totalCachedRead
  const cacheHitRate = totalCacheableTokens > 0
    ? ((totalCachedRead / totalCacheableTokens) * 100).toFixed(1)
    : '0.0'

  // Cache cost calculation (approximate)
  // Cache write costs 25% more, cache read costs 90% less
  const costWithoutCache = totalInputTokens + totalCachedRead + (totalCachedWrite * 1.25)
  const actualCost = totalInputTokens + (totalCachedRead * 0.1) + (totalCachedWrite * 1.25)
  const costSavingsPercent = costWithoutCache > 0
    ? (((costWithoutCache - actualCost) / costWithoutCache) * 100).toFixed(1)
    : '0.0'

  // Calculate cumulative context usage for models with context windows
  const cumulativeInputTokens = conversationHistory.reduce(
    (sum, msg) => sum + (msg.metadata?.inputTokens || 0),
    0
  )
  const cumulativeOutputTokens = conversationHistory.reduce(
    (sum, msg) => sum + (msg.metadata?.outputTokens || 0),
    0
  )
  const cumulativeTokens = cumulativeInputTokens + cumulativeOutputTokens

  // Get model info from last message to determine context window
  const lastModelUsed = lastMessage?.metadata?.modelUsed
  const contextWindow = lastModelUsed?.includes('claude-sonnet-4-5') || lastModelUsed?.includes('claude-3-5-haiku')
    ? 200000
    : null

  const contextPercent = contextWindow
    ? ((cumulativeTokens / contextWindow) * 100).toFixed(1)
    : null
  const remainingTokens = contextWindow ? contextWindow - cumulativeTokens : null

  return (
    <Card className="p-6">
      <div className="space-y-4">
        {/* Header with actions */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {getStatusBadge()}
            <Badge variant="outline" className="gap-1">
              <Coins className="h-3 w-3" />
              {totalTokens} tokens total
            </Badge>
            {totalCachedRead > 0 && (
              <Badge variant="outline" className="gap-1 bg-green-500/10 text-green-700">
                🎯 {totalCachedRead} cached
              </Badge>
            )}
            <span className="text-xs text-muted-foreground">
              {conversationHistory.length} {conversationHistory.length === 1 ? 'message' : 'messages'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={exportConversation}
              title="Export conversation"
            >
              <Download className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={clearConversation}
              title="Clear conversation"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <Separator />

        {/* Cache Performance Panel - Only show in advanced mode when there are cache statistics */}
        {advancedMode && (totalCachedRead > 0 || totalCachedWrite > 0) && (
          <>
            <div className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Coins className="h-3.5 w-3.5" />
              <span>Cache Performance: Writes {totalCachedWrite.toLocaleString()} • Hits {totalCachedRead.toLocaleString()} • Hit Rate {cacheHitRate}% {totalCachedRead}/{totalCacheableTokens.toLocaleString()} • Est savings vs no cache ~{costSavingsPercent}%</span>
              {totalCachedRead === 0 && totalCachedWrite > 0 && (
                <span className="italic ml-2">💡 Cache created. Send follow-up messages to see 90% cost savings!</span>
              )}
            </div>
            <Separator />
          </>
        )}

        {/* Conversation History */}
        <div className="space-y-6">
          {/* Group messages in pairs (reversed for display) */}
          {(() => {
            const pairs: Array<{ user: ConversationMessage; assistant: ConversationMessage }> = []
            const reversed = [...conversationHistory].reverse()

            // Group into user+assistant pairs
            for (let i = 0; i < reversed.length; i++) {
              if (reversed[i].role === 'assistant' && i + 1 < reversed.length && reversed[i + 1].role === 'user') {
                pairs.push({
                  assistant: reversed[i],
                  user: reversed[i + 1]
                })
                i++ // Skip the next message as it's already paired
              }
            }

            return pairs.map((pair, pairIndex) => {
              const assistantMsg = pair.assistant
              const userMsg = pair.user
              const metadata = assistantMsg.metadata

              // Build advanced settings overrides display
              const overrides: string[] = []
              if (metadata) {
                // Check if advanced settings were overridden (compare to defaults or check if enabled)
                if (advancedSettings.temperature.enabled) {
                  overrides.push(`Temp: ${advancedSettings.temperature.value}`)
                }
                if (advancedSettings.topP.enabled) {
                  overrides.push(`TopP: ${advancedSettings.topP.value.toFixed(2)}`)
                }
                if (advancedSettings.topK.enabled) {
                  overrides.push(`TopK: ${advancedSettings.topK.value}`)
                }
                if (advancedSettings.stopSequences.enabled && advancedSettings.stopSequences.values.length > 0) {
                  overrides.push(`Stop: ${advancedSettings.stopSequences.values.length}`)
                }
              }

              return (
                <div key={pairIndex} className="space-y-3">
                  {/* Execution Statistics - Single row above Assistant (only in advanced mode) */}
                  {advancedMode && metadata && (
                    <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" />
                      <span>Time {(metadata.executionTimeMs || 0) / 1000}s</span>
                      <span>•</span>
                      <span>Input {metadata.inputTokens} tokens{metadata.cachedReadTokens ? ` (${metadata.cachedReadTokens} cached)` : ''}</span>
                      <span>•</span>
                      <span>Output {metadata.outputTokens} tokens</span>
                      <span>•</span>
                      <span className={metadata.mode === 'stateful' ? 'text-blue-600' : 'text-orange-600'}>
                        {metadata.mode === 'stateful' ? 'Stateful' : 'Stateless'}
                      </span>
                      <span>•</span>
                      <span>System {metadata.systemPromptSent ? '✓' : '✗'}</span>
                      {metadata.fileSent && (
                        <>
                          <span>•</span>
                          <span>File ✓</span>
                        </>
                      )}
                      {metadata.thinkingEnabled && (
                        <>
                          <span>•</span>
                          <span>Thinking ✓ ({advancedSettings.thinkingBudget})</span>
                        </>
                      )}
                      {metadata.citationsEnabled && (
                        <>
                          <span>•</span>
                          <span>Citations ✓</span>
                        </>
                      )}
                      <span>•</span>
                      <span>Max {advancedSettings.maxTokens}</span>
                      {overrides.length > 0 && (
                        <>
                          <span>•</span>
                          <span className="text-amber-600">Overrides: {overrides.join(', ')}</span>
                        </>
                      )}
                      {/* Context Window Usage - Only in stateful mode for models with context awareness */}
                      {metadata.mode === 'stateful' && contextWindow && (
                        <>
                          <span>•</span>
                          <span>
                            Context: {cumulativeTokens.toLocaleString()}/{contextWindow.toLocaleString()}
                            ({contextPercent}%) • {remainingTokens?.toLocaleString()} remaining
                          </span>
                        </>
                      )}
                    </div>
                  )}

                  {/* User Message */}
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <Badge variant="default" className="text-xs">You</Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(userMsg.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="rounded-lg p-4 bg-primary/5 border border-primary/20">
                      <pre className="text-sm whitespace-pre-wrap break-words font-sans">
                        {extractText(userMsg.content)}
                      </pre>
                    </div>
                  </div>

                  {/* Assistant Message */}
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs">Assistant</Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(assistantMsg.timestamp).toLocaleTimeString()}
                      </span>
                      {/* Cache status badges */}
                      {metadata?.cachedWriteTokens && metadata.cachedWriteTokens > 0 && (
                        <Badge variant="outline" className="gap-1 bg-blue-500/10 text-blue-700 text-xs">
                          🔷 Cache Created
                        </Badge>
                      )}
                      {metadata?.cachedReadTokens && metadata.cachedReadTokens > 0 && (
                        <Badge variant="outline" className="gap-1 bg-green-500/10 text-green-700 text-xs">
                          🎯 Cache Hit
                        </Badge>
                      )}
                      {/* Manual parse button - only in advanced mode when auto-parse is off */}
                      {(() => {
                        const responseText = extractText(assistantMsg.content)
                        const messageIndex = conversationHistory.indexOf(assistantMsg)
                        const isParsed = manuallyParsedMessages.has(messageIndex)
                        const shouldShowParseButton = advancedMode &&
                          !autoParseStructuredData &&
                          !isParsed &&
                          (responseText.includes('{') || responseText.includes('<'))

                        return shouldShowParseButton ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-xs gap-1 px-2"
                            onClick={() => {
                              setManuallyParsedMessages(prev => new Set(prev).add(messageIndex))
                            }}
                          >
                            <FileJson className="h-3 w-3" />
                            Parse to structured data
                          </Button>
                        ) : null
                      })()}
                    </div>

                    {/* Thinking Blocks - Show after header, before response */}
                    {assistantMsg.thinking_blocks && assistantMsg.thinking_blocks.length > 0 && (
                      <div className="rounded-lg p-4 bg-amber-50/50 border border-amber-200/50 dark:bg-amber-950/20 dark:border-amber-800/30">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant="outline" className="gap-1 bg-amber-500/10 text-amber-700 text-xs">
                            💭 Extended Thinking
                          </Badge>
                        </div>
                        {assistantMsg.thinking_blocks.map((block: Record<string, unknown>, idx: number) => (
                          <div key={idx} className="mt-2">
                            <pre className="text-sm whitespace-pre-wrap break-words font-sans text-muted-foreground italic">
                              {String(block.thinking || block.text || JSON.stringify(block))}
                            </pre>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Response */}
                    <div className="space-y-3">
                      {(() => {
                        const responseText = extractText(assistantMsg.content)
                        const messageIndex = conversationHistory.indexOf(assistantMsg)
                        const isParsed = manuallyParsedMessages.has(messageIndex)

                        // Determine if we should parse structured content
                        const shouldParse =
                          // Always parse in non-advanced mode (backward compatibility)
                          !advancedMode ||
                          // In advanced mode, parse if auto-parse is on
                          (advancedMode && autoParseStructuredData) ||
                          // In advanced mode with auto-parse off, parse if manually triggered
                          (advancedMode && !autoParseStructuredData && isParsed)

                        if (shouldParse) {
                          const extracted = extractStructuredContent(responseText)

                          return (
                            <>
                              {/* Plain text response */}
                              {extracted.plainText && (
                                <div className="rounded-lg p-4 bg-muted/50">
                                  <pre className="text-sm whitespace-pre-wrap break-words font-sans">
                                    {extracted.plainText}
                                  </pre>
                                </div>
                              )}

                              {/* Structured output blocks */}
                              {extracted.blocks.map((block, blockIdx) => (
                                <StructuredOutputVisualizer
                                  key={blockIdx}
                                  data={block.data}
                                  originalType={block.type}
                                  showRawToggle={true}
                                />
                              ))}
                            </>
                          )
                        } else {
                          // Show raw response without parsing
                          return (
                            <div className="rounded-lg p-4 bg-muted/50">
                              <pre className="text-sm whitespace-pre-wrap break-words font-sans">
                                {responseText}
                              </pre>
                            </div>
                          )
                        }
                      })()}
                    </div>

                    {/* Citations - Show after response */}
                    {assistantMsg.citations && assistantMsg.citations.length > 0 && (
                      <div className="rounded-lg p-4 bg-cyan-50/50 border border-cyan-200/50 dark:bg-cyan-950/20 dark:border-cyan-800/30">
                        <div className="flex items-center gap-2 mb-3">
                          <Badge variant="outline" className="gap-1 bg-cyan-500/10 text-cyan-700 text-xs">
                            📎 Citations
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {assistantMsg.citations.length} {assistantMsg.citations.length === 1 ? 'citation' : 'citations'}
                          </span>
                        </div>
                        <div className="space-y-3">
                          {assistantMsg.citations.map((citation: Record<string, unknown>, idx: number) => (
                            <div key={idx} className="border-l-2 border-cyan-400/50 pl-3">
                              <div className="text-sm mb-1">
                                <span className="font-medium text-foreground">&quot;{String(citation.cited_text)}&quot;</span>
                              </div>
                              <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-1.5">
                                <span className="font-medium">{String(citation.document_title || 'Document')}</span>
                                {citation.type === 'page_location' && (
                                  <>
                                    <span>•</span>
                                    <span>Pages {String(citation.start_page_number)}-{String(citation.end_page_number)}</span>
                                  </>
                                )}
                                {citation.type === 'char_location' && (
                                  <>
                                    <span>•</span>
                                    <span>Chars {String(citation.start_char_index)}-{String(citation.end_char_index)}</span>
                                  </>
                                )}
                                {citation.type === 'content_block_location' && (
                                  <>
                                    <span>•</span>
                                    <span>Blocks {String(citation.start_block_index)}-{String(citation.end_block_index)}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )
            })
          })()}
        </div>
      </div>
    </Card>
  )
}