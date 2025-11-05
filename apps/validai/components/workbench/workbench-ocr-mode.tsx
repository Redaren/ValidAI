/**
 * @fileoverview WorkbenchOCRMode Component - Mistral OCR document processing interface
 * @module components/workbench/workbench-ocr-mode
 */

'use client'

import { useState } from 'react'
import { logger, extractErrorDetails } from '@/lib/utils/logger'
import { FlaskConical, Loader2, Upload } from 'lucide-react'
import { Button } from '@playze/shared-ui'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@playze/shared-ui'
import { Label } from '@playze/shared-ui'
import { useWorkbenchStore } from '@/stores/workbench-store'
import { useOCRTest } from '@/hooks/use-ocr-test'
import { useTranslations } from 'next-intl'

/**
 * Component props
 */
interface WorkbenchOCRModeProps {
  processor: {
    processor_id: string
    [key: string]: unknown
  }
  selectedModel: string
}

/**
 * Format file size for display
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * WorkbenchOCRMode Component
 *
 * Provides file upload and OCR processing interface for Mistral OCR models.
 * Only shown when Advanced Mode is enabled and OCR model is selected.
 *
 * Features:
 * - File upload with type validation
 * - Annotation format selector (none, chapters, dates, items)
 * - Base64 encoding and direct Edge Function invocation
 * - Result display in WorkbenchOutput
 */
export function WorkbenchOCRMode({ processor, selectedModel }: WorkbenchOCRModeProps) {
  const t = useTranslations('workbench.input')

  const {
    selectedFile,
    ocrAnnotationFormat,
    setFile,
    setOCRAnnotationFormat,
    setOCRResults,
    clearOCRResults,
  } = useWorkbenchStore()

  const ocrMutation = useOCRTest()
  const [fileInputKey, setFileInputKey] = useState(0)

  /**
   * Handle file selection via input element
   */
  const handleFileSelect = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.pdf,.txt,.html,.md,.doc,.docx'
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (file) {
        // Validate file size (50MB limit)
        if (file.size > 50 * 1024 * 1024) {
          alert('File size must be less than 50MB')
          return
        }

        setFile({
          type: 'uploaded',
          file,
          name: file.name,
          size: file.size,
        })
      }
    }
    input.click()
  }

  /**
   * Read file as base64 string
   */
  const readFileAsBase64 = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const result = e.target?.result as string
        if (file.type === 'application/pdf') {
          // Extract base64 from data URL
          resolve(result.split(',')[1])
        } else {
          // For text files, convert to base64
          resolve(btoa(result))
        }
      }
      reader.onerror = reject

      if (file.type === 'application/pdf') {
        reader.readAsDataURL(file)
      } else {
        reader.readAsText(file)
      }
    })
  }

  /**
   * Handle OCR processing
   */
  const handleRunOCR = async () => {
    if (!selectedFile || selectedFile.type !== 'uploaded') return

    try {
      clearOCRResults()

      // Read file as base64
      const fileContent = await readFileAsBase64(selectedFile.file)

      // Call Edge Function
      const result = await ocrMutation.mutateAsync({
        processor_id: processor.processor_id,
        model_id: selectedModel,
        annotation_format: ocrAnnotationFormat,
        file_content: fileContent,
        file_type: selectedFile.file.type,
      })

      // Store results in state
      setOCRResults(result)
    } catch (error) {
      logger.error('OCR processing failed:', extractErrorDetails(error))
    }
  }

  const isProcessing = ocrMutation.isPending
  const hasFile = selectedFile !== null && selectedFile.type === 'uploaded'

  return (
    <div className="rounded-lg border bg-card p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <FlaskConical className="h-5 w-5 text-primary" />
        <h3 className="font-semibold">OCR Document Processing</h3>
      </div>

      {/* Description */}
      <p className="text-sm text-muted-foreground">
        Upload a document to extract text and structured data using Mistral OCR.
      </p>

      {/* File Upload */}
      <div className="space-y-2">
        <Label htmlFor="ocr-file-upload">{t('document')}</Label>
        <Button
          id="ocr-file-upload"
          variant="outline"
          onClick={handleFileSelect}
          className="w-full justify-start"
          disabled={isProcessing}
        >
          <Upload className="h-4 w-4 mr-2" />
          {hasFile
            ? `${selectedFile.name} (${formatFileSize(selectedFile.size)})`
            : 'Select file to process'}
        </Button>
        <p className="text-xs text-muted-foreground">
          Supported: PDF, TXT, HTML, MD, DOC, DOCX (max 50MB)
        </p>
      </div>

      {/* Annotation Format Selector */}
      <div className="space-y-2">
        <Label htmlFor="annotation-format">Annotation Format</Label>
        <Select
          value={ocrAnnotationFormat}
          onValueChange={(value) =>
            setOCRAnnotationFormat(
              value as 'none' | 'chapters' | 'dates' | 'items' | 'custom'
            )
          }
          disabled={isProcessing}
        >
          <SelectTrigger id="annotation-format">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">
              <div>
                <div className="font-medium">No annotation</div>
                <div className="text-xs text-muted-foreground">
                  Basic markdown conversion
                </div>
              </div>
            </SelectItem>
            <SelectItem value="chapters">
              <div>
                <div className="font-medium">Chapter sections and content</div>
                <div className="text-xs text-muted-foreground">
                  Extract document structure
                </div>
              </div>
            </SelectItem>
            <SelectItem value="dates">
              <div>
                <div className="font-medium">Key dates and parties</div>
                <div className="text-xs text-muted-foreground">
                  Contract analysis
                </div>
              </div>
            </SelectItem>
            <SelectItem value="items">
              <div>
                <div className="font-medium">Line items and amounts</div>
                <div className="text-xs text-muted-foreground">
                  Invoice processing
                </div>
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Action Button */}
      <Button
        onClick={handleRunOCR}
        disabled={!hasFile || isProcessing}
        className="w-full"
        size="lg"
      >
        {isProcessing ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Processing...
          </>
        ) : (
          <>
            <FlaskConical className="h-4 w-4 mr-2" />
            Process Document
          </>
        )}
      </Button>

      {/* Error Display */}
      {ocrMutation.isError && (
        <div className="rounded-lg border border-destructive bg-destructive/10 p-3">
          <p className="text-sm text-destructive">
            {ocrMutation.error?.message || 'OCR processing failed'}
          </p>
        </div>
      )}
    </div>
  )
}
