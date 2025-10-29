/**
 * @fileoverview OCRResultDisplay Component - Display OCR processing results
 * @module components/workbench/ocr-result-display
 */

'use client'

import { useState } from 'react'
import { Download, AlertTriangle } from 'lucide-react'
import { Button } from '@playze/shared-ui'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@playze/shared-ui'
import { Alert, AlertDescription } from '@playze/shared-ui'
import type { OCRResult } from '@/stores/workbench-store'

/**
 * Component props
 */
interface OCRResultDisplayProps {
  results: OCRResult
}

/**
 * Truncate markdown to specified number of lines
 */
function truncateMarkdown(markdown: string, maxLines: number): string {
  const lines = markdown.split('\n')
  if (lines.length <= maxLines) return markdown

  return lines.slice(0, maxLines).join('\n') + '\n\n... (truncated)'
}

/**
 * OCRResultDisplay Component
 *
 * Displays OCR processing results with:
 * - Metadata bar (model, format, execution time)
 * - Tabbed interface for markdown and annotations
 * - Truncated markdown preview (500 lines)
 * - Download buttons for full results
 * - Structured annotations display (JSON)
 */
export function OCRResultDisplay({ results }: OCRResultDisplayProps) {
  const [activeTab, setActiveTab] = useState<'markdown' | 'annotations'>('markdown')

  // Truncate markdown to first 500 lines for display
  const truncatedMarkdown = truncateMarkdown(results.markdown, 500)
  const isTruncated = results.markdown.split('\n').length > 500

  /**
   * Download markdown file
   */
  const handleDownloadMarkdown = () => {
    const blob = new Blob([results.markdown], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ocr-results-${Date.now()}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  /**
   * Download annotations JSON file
   */
  const handleDownloadAnnotations = () => {
    if (!results.annotations) return

    const json = JSON.stringify(results.annotations, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ocr-annotations-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      {/* Metadata Bar */}
      <div className="flex items-center justify-between p-3 bg-muted rounded-lg text-sm flex-wrap gap-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Model:</span>
            <span className="font-medium">{results.metadata.model}</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Format:</span>
            <span className="font-medium">{results.metadata.annotationFormat}</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Time:</span>
            <span className="font-medium">
              {(results.metadata.executionTime / 1000).toFixed(2)}s
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleDownloadMarkdown}
          >
            <Download className="h-4 w-4 mr-2" />
            Download Markdown
          </Button>

          {results.annotations && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleDownloadAnnotations}
            >
              <Download className="h-4 w-4 mr-2" />
              Download Annotations
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList>
          <TabsTrigger value="markdown">Markdown</TabsTrigger>
          {results.annotations && (
            <TabsTrigger value="annotations">Annotations</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="markdown" className="space-y-4">
          {/* Truncation warning */}
          {isTruncated && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Preview shows first 500 lines. Download full results using the button above.
              </AlertDescription>
            </Alert>
          )}

          {/* Markdown preview */}
          <div className="rounded-lg border bg-card p-4 max-h-[600px] overflow-auto">
            <pre className="text-sm whitespace-pre-wrap font-mono">
              {truncatedMarkdown}
            </pre>
          </div>
        </TabsContent>

        {results.annotations && (
          <TabsContent value="annotations" className="space-y-4">
            {/* Annotations display */}
            <div className="rounded-lg border bg-card p-4 max-h-[600px] overflow-auto">
              <pre className="text-sm whitespace-pre-wrap font-mono">
                {JSON.stringify(results.annotations, null, 2)}
              </pre>
            </div>
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
