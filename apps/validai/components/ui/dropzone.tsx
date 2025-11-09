"use client"

import { useCallback, useState } from "react"
import { Upload } from "lucide-react"
import { cn } from "@/lib/utils"
import { Progress } from "@/components/ui/progress"
import {
  ALLOWED_EXTENSIONS,
  ALLOWED_FORMAT_NAMES,
  DOCUMENT_MAX_SIZE_MB,
  validateDocumentFile,
} from "@/lib/constants/documents"

interface DropZoneProps {
  onFileSelect: (file: File) => void | Promise<void>
  uploading?: boolean
  uploadProgress?: number
  uploadMessage?: string
  error?: string | null
  disabled?: boolean
  className?: string
}

/**
 * Drag-and-drop file upload component
 *
 * Features:
 * - Drag and drop file selection
 * - Click to browse fallback
 * - Client-side validation
 * - Upload progress display
 * - Error state handling
 */
export function DropZone({
  onFileSelect,
  uploading = false,
  uploadProgress = 0,
  uploadMessage,
  error = null,
  disabled = false,
  className,
}: DropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false)

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    if (!disabled && !uploading) {
      setIsDragOver(true)
    }
  }, [disabled, uploading])

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragOver(false)

      if (disabled || uploading) return

      const files = Array.from(e.dataTransfer.files)
      if (files.length === 0) return

      const file = files[0] // Only take first file

      // Validate file
      const validation = validateDocumentFile(file)
      if (!validation.valid) {
        // Validation error will be handled by parent component
        return
      }

      await onFileSelect(file)
    },
    [disabled, uploading, onFileSelect]
  )

  const handleFileInput = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (!files || files.length === 0) return

      const file = files[0]

      // Validate file
      const validation = validateDocumentFile(file)
      if (!validation.valid) {
        return
      }

      await onFileSelect(file)
    },
    [onFileSelect]
  )

  const handleClick = useCallback(() => {
    if (disabled || uploading) return
    document.getElementById("dropzone-file-input")?.click()
  }, [disabled, uploading])

  return (
    <div className={cn("w-full", className)}>
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors",
          isDragOver && !uploading && !disabled
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50",
          (uploading || disabled) && "cursor-not-allowed opacity-50",
          error && "border-destructive bg-destructive/5"
        )}
      >
        <input
          id="dropzone-file-input"
          type="file"
          className="hidden"
          accept={ALLOWED_EXTENSIONS}
          onChange={handleFileInput}
          disabled={disabled || uploading}
        />

        {uploading ? (
          <div className="w-full space-y-3">
            <div className="flex flex-col items-center gap-2">
              <Upload className="h-8 w-8 animate-pulse text-primary" />
              <p className="text-sm font-medium transition-opacity duration-300">
                {uploadMessage || "Uploading..."}
              </p>
            </div>
            <Progress value={uploadProgress} className="h-2" />
            <p className="text-center text-xs text-muted-foreground">
              {uploadProgress}% complete
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 text-center">
            <Upload className="h-10 w-10 text-muted-foreground" />

            <div className="space-y-1">
              <p className="text-sm font-medium">
                {isDragOver
                  ? "Drop to start processing"
                  : "Drag and drop your document here"}
              </p>
              <p className="text-xs text-muted-foreground">
                {ALLOWED_FORMAT_NAMES} (max {DOCUMENT_MAX_SIZE_MB} MB)
              </p>
            </div>

            <p className="text-xs text-muted-foreground">or click to browse</p>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-2 rounded-md border border-destructive bg-destructive/10 p-3">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}
    </div>
  )
}
