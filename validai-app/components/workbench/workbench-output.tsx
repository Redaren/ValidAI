"use client"

import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Copy, Download, RotateCcw, AlertCircle, Clock, Coins, Trash2 } from "lucide-react"
import { useWorkbenchStore } from "@/stores/workbench-store"
import { useWorkbenchTest } from "@/hooks/use-workbench-test"
import { cn } from "@/lib/utils"

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
   * Export conversation history as JSON file
   *
   * Downloads conversation as JSON with timestamp.
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
      conversation: conversationHistory
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

        {/* Cache Performance Panel - Only show when there are cache statistics */}
        {(totalCachedRead > 0 || totalCachedWrite > 0) && (
          <>
            <div className="rounded-lg bg-muted/30 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Coins className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold">Cache Performance</h3>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Cache Writes</p>
                  <p className="text-lg font-semibold text-blue-600">
                    🔷 {totalCachedWrite.toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground">tokens (+25% cost)</p>
                </div>

                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Cache Hits</p>
                  <p className="text-lg font-semibold text-green-600">
                    🎯 {totalCachedRead.toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground">tokens (-90% cost)</p>
                </div>

                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Hit Rate</p>
                  <p className="text-lg font-semibold">{cacheHitRate}%</p>
                  <p className="text-xs text-muted-foreground">
                    {totalCachedRead} / {totalCacheableTokens.toLocaleString()}
                  </p>
                </div>

                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Cost Savings</p>
                  <p className="text-lg font-semibold text-green-600">~{costSavingsPercent}%</p>
                  <p className="text-xs text-muted-foreground">vs. no caching</p>
                </div>
              </div>

              {totalCachedRead === 0 && totalCachedWrite > 0 && (
                <div className="text-xs text-muted-foreground italic">
                  💡 Cache created. Send follow-up messages to see 90% cost savings!
                </div>
              )}
            </div>
            <Separator />
          </>
        )}

        {/* Conversation History */}
        <div className="space-y-4">
          {[...conversationHistory].reverse().map((message, index) => {
            // Determine cache status for this message
            const hasCacheWrite = message.tokensUsed?.cached_write && message.tokensUsed.cached_write > 0
            const hasCacheRead = message.tokensUsed?.cached_read && message.tokensUsed.cached_read > 0

            return (
              <div key={index} className="space-y-2">
                {/* Message Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant={message.role === 'user' ? 'default' : 'secondary'}>
                      {message.role === 'user' ? 'You' : 'Assistant'}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(message.timestamp).toLocaleTimeString()}
                    </span>

                    {/* Cache status badges */}
                    {hasCacheWrite && (
                      <Badge variant="outline" className="gap-1 bg-blue-500/10 text-blue-700 text-xs">
                        🔷 Cache Created
                      </Badge>
                    )}
                    {hasCacheRead && (
                      <Badge variant="outline" className="gap-1 bg-green-500/10 text-green-700 text-xs">
                        🎯 Cache Hit
                      </Badge>
                    )}
                  </div>
                </div>

              {/* Message Metadata - show if available */}
              {message.metadata && (
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  {/* Mode */}
                  <span className="flex items-center gap-1">
                    <span className="font-medium">Mode:</span>
                    <span className={message.metadata.mode === 'stateful' ? 'text-blue-600' : 'text-orange-600'}>
                      {message.metadata.mode === 'stateful' ? 'Stateful' : 'Stateless'}
                    </span>
                  </span>

                  <span>•</span>

                  {/* Cache Created */}
                  <span className="flex items-center gap-1">
                    <span className="font-medium">Cache:</span>
                    <span className={message.metadata.cacheCreated ? 'text-green-600' : ''}>
                      {message.metadata.cacheCreated ? '✓ Created' : '✗'}
                    </span>
                  </span>

                  <span>•</span>

                  {/* System Prompt */}
                  <span className="flex items-center gap-1">
                    <span className="font-medium">System Prompt:</span>
                    <span>{message.metadata.systemPromptSent ? '✓' : '✗'}</span>
                  </span>

                  <span>•</span>

                  {/* Thinking */}
                  <span className="flex items-center gap-1">
                    <span className="font-medium">Thinking:</span>
                    <span>{message.metadata.thinkingEnabled ? '✓' : '✗'}</span>
                  </span>

                  <span>•</span>

                  {/* Citations */}
                  <span className="flex items-center gap-1">
                    <span className="font-medium">Citations:</span>
                    <span>{message.metadata.citationsEnabled ? '✓' : '✗'}</span>
                  </span>
                </div>
              )}

              {/* Token Usage */}
              {message.metadata && (
                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <span className="font-medium">Input:</span>
                    <span>{message.metadata.inputTokens} tokens</span>
                    {message.metadata.cachedReadTokens && message.metadata.cachedReadTokens > 0 && (
                      <span className="text-green-600">
                        (🎯 {message.metadata.cachedReadTokens} cached)
                      </span>
                    )}
                    {message.metadata.cachedWriteTokens && message.metadata.cachedWriteTokens > 0 && (
                      <span className="text-blue-600">
                        (🔷 {message.metadata.cachedWriteTokens} cache write)
                      </span>
                    )}
                  </span>

                  <span>•</span>

                  <span className="flex items-center gap-1">
                    <span className="font-medium">Output:</span>
                    <span>{message.metadata.outputTokens} tokens</span>
                  </span>

                  {message.metadata.executionTimeMs && (
                    <>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <span className="font-medium">Time:</span>
                        <span>{(message.metadata.executionTimeMs / 1000).toFixed(2)}s</span>
                      </span>
                    </>
                  )}
                </div>
              )}

              {/* Legacy token display for backward compatibility */}
              {!message.metadata && message.tokensUsed && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{message.tokensUsed.input + message.tokensUsed.output} tokens</span>
                  {message.tokensUsed.cached_read && (
                    <span className="text-green-600">
                      ({message.tokensUsed.cached_read} cached)
                    </span>
                  )}
                </div>
              )}

              {/* Message Content */}
              <div className={cn(
                "rounded-lg p-4",
                message.role === 'user'
                  ? "bg-primary/5 border border-primary/20"
                  : "bg-muted/50"
              )}>
                <pre className="text-sm whitespace-pre-wrap break-words font-sans">
                  {message.content}
                </pre>
              </div>
            </div>
            )
          })}
        </div>
      </div>
    </Card>
  )
}