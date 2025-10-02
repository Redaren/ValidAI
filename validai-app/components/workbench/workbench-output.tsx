"use client"

import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Copy, Download, RotateCcw, AlertCircle, Clock, Coins } from "lucide-react"
import { useWorkbenchStore } from "@/stores/workbench-store"
import { cn } from "@/lib/utils"

/**
 * Workbench Output Component
 *
 * Displays test results including:
 * - Response text
 * - Token usage
 * - Execution time
 * - Error states
 */
export function WorkbenchOutput() {
  const { output, error, isRunning, runTest, clearOutput } = useWorkbenchStore()

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      // Could add toast notification here
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const exportResults = () => {
    if (!output) return

    const exportData = {
      timestamp: output.timestamp,
      response: output.response,
      parsedValue: output.parsedValue,
      tokensUsed: output.tokensUsed,
      executionTime: output.executionTime
    }

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json'
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `test-result-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Loading state
  if (isRunning) {
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
  if (error) {
    return (
      <Card className="p-6 border-destructive/50 bg-destructive/5">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
          <div className="flex-1 space-y-2">
            <p className="text-sm font-medium text-destructive">Error</p>
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={runTest}
              className="mt-3"
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </div>
        </div>
      </Card>
    )
  }

  // Empty state
  if (!output) {
    return (
      <Card className="p-12">
        <div className="text-center space-y-2">
          <p className="text-sm text-muted-foreground">
            Results will appear here after test
          </p>
          <p className="text-xs text-muted-foreground">
            Configure your test settings above and click "Test" to begin
          </p>
        </div>
      </Card>
    )
  }

  // Success state with results
  return (
    <Card className="p-6">
      <div className="space-y-4">
        {/* Header with metadata */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="gap-1">
              <Clock className="h-3 w-3" />
              {output.executionTime}ms
            </Badge>
            <Badge variant="outline" className="gap-1">
              <Coins className="h-3 w-3" />
              {output.tokensUsed.total} tokens
            </Badge>
            <span className="text-xs text-muted-foreground">
              {new Date(output.timestamp).toLocaleTimeString()}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => copyToClipboard(output.response)}
              title="Copy response"
            >
              <Copy className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={exportResults}
              title="Export results"
            >
              <Download className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={clearOutput}
              title="Clear output"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <Separator />

        {/* Response Content */}
        <div className="space-y-4">
          <div>
            <h4 className="text-sm font-medium mb-2">Response</h4>
            <div className="rounded-lg bg-muted/50 p-4">
              <pre className="text-sm whitespace-pre-wrap break-words">
                {output.response}
              </pre>
            </div>
          </div>

          {/* Parsed Values (if any) */}
          {output.parsedValue && (
            <>
              <Separator />
              <div>
                <h4 className="text-sm font-medium mb-2">Parsed Values</h4>
                <div className="rounded-lg bg-muted/50 p-4">
                  <pre className="text-sm whitespace-pre-wrap break-words">
                    {JSON.stringify(output.parsedValue, null, 2)}
                  </pre>
                </div>
              </div>
            </>
          )}

          {/* Token Usage Details */}
          <Separator />
          <div>
            <h4 className="text-sm font-medium mb-2">Token Usage</h4>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Input</p>
                <p className="text-sm font-medium">{output.tokensUsed.input}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Output</p>
                <p className="text-sm font-medium">{output.tokensUsed.output}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="text-sm font-medium">{output.tokensUsed.total}</p>
              </div>
            </div>

            {/* Token usage visualization */}
            <div className="mt-3">
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{
                    width: `${(output.tokensUsed.input / output.tokensUsed.total) * 100}%`
                  }}
                />
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-xs text-muted-foreground">Input</span>
                <span className="text-xs text-muted-foreground">Output</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Card>
  )
}