"use client"

import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Copy, Download, RotateCcw, AlertCircle, Clock, Coins, Trash2 } from "lucide-react"
import { useWorkbenchStore } from "@/stores/workbench-store"
import { useWorkbenchTest } from "@/hooks/use-workbench-test"
import { cn } from "@/lib/utils"
import type { ConversationMessage } from "@/lib/validations"

/**
 * Workbench Output Component
 *
 * Displays test results including:
 * - Conversation history
 * - Response text
 * - Thinking blocks
 * - Citations
 * - Token usage (with cache statistics)
 * - Cache performance panel (stateful mode only)
 *   - Cache writes (🔷) and reads (🎯)
 *   - Cache hit rate percentage
 *   - Cost savings estimation
 * - Per-message cache indicators
 * - Execution time
 * - Error states
 */
export function WorkbenchOutput() {
  const {
    conversationHistory,
    executionStatus,
    advancedSettings,
    advancedMode,
    clearConversation,
    clearOutput
  } = useWorkbenchStore()

  const workbenchTest = useWorkbenchTest()

  /**
   * Get status badge component for current execution
   *
   * Returns color-coded badge with icon based on real-time execution status.
   * Badge colors:
   * - Pending: Yellow (⏳)
   * - Processing: Blue (⚡)
   * - Completed: Green (✓)
   * - Failed: Red (✗)
   *
   * @returns Badge component or null if idle
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
   * Copy text to clipboard using Clipboard API
   *
   * Uses modern navigator.clipboard API for secure clipboard access.
   * Silently fails if clipboard access is denied.
   *
   * @param text - Text content to copy
   */
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      // Could add toast notification here
    } catch (err) {
      console.error('Failed to copy:', err)
    }
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
   * Downloads conversation as JSON with timestamp.
   * Document data is truncated for readability (original files unchanged).
   *
   * File format:
   * ```json
   * {
   *   "timestamp": "2025-10-03T12:34:56Z",
   *   "conversation": [ ... messages ... ]
   * }
   * ```
   *
   * Filename: `workbench-conversation-{timestamp}.json`
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
    (sum, msg) => sum + (msg.tokensUsed?.input || 0) + (msg.tokensUsed?.output || 0),
    0
  )
  const totalCachedRead = conversationHistory.reduce(
    (sum, msg) => sum + (msg.tokensUsed?.cached_read || 0),
    0
  )
  const totalCachedWrite = conversationHistory.reduce(
    (sum, msg) => sum + (msg.tokensUsed?.cached_write || 0),
    0
  )
  const totalInputTokens = conversationHistory.reduce(
    (sum, msg) => sum + (msg.tokensUsed?.input || 0),
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
                    </div>

                    {/* Thinking Blocks - Show after header, before response */}
                    {assistantMsg.thinking_blocks && assistantMsg.thinking_blocks.length > 0 && (
                      <div className="rounded-lg p-4 bg-amber-50/50 border border-amber-200/50 dark:bg-amber-950/20 dark:border-amber-800/30">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant="outline" className="gap-1 bg-amber-500/10 text-amber-700 text-xs">
                            💭 Extended Thinking
                          </Badge>
                        </div>
                        {assistantMsg.thinking_blocks.map((block: any, idx: number) => (
                          <div key={idx} className="mt-2">
                            <pre className="text-sm whitespace-pre-wrap break-words font-sans text-muted-foreground italic">
                              {block.thinking || block.text || JSON.stringify(block)}
                            </pre>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Response */}
                    <div className="rounded-lg p-4 bg-muted/50">
                      <pre className="text-sm whitespace-pre-wrap break-words font-sans">
                        {extractText(assistantMsg.content)}
                      </pre>
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
                          {assistantMsg.citations.map((citation: any, idx: number) => (
                            <div key={idx} className="border-l-2 border-cyan-400/50 pl-3">
                              <div className="text-sm mb-1">
                                <span className="font-medium text-foreground">"{citation.cited_text}"</span>
                              </div>
                              <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-1.5">
                                <span className="font-medium">{citation.document_title || 'Document'}</span>
                                {citation.type === 'page_location' && (
                                  <>
                                    <span>•</span>
                                    <span>Pages {citation.start_page_number}-{citation.end_page_number}</span>
                                  </>
                                )}
                                {citation.type === 'char_location' && (
                                  <>
                                    <span>•</span>
                                    <span>Chars {citation.start_char_index}-{citation.end_char_index}</span>
                                  </>
                                )}
                                {citation.type === 'content_block_location' && (
                                  <>
                                    <span>•</span>
                                    <span>Blocks {citation.start_block_index}-{citation.end_block_index}</span>
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