/**
 * Run Processor Dialog Component
 *
 * @module components/processors/run-processor-dialog
 * @description
 * Dialog for drag-and-drop document upload and processor execution.
 * Phase 1.9: Uses direct upload (base64) to Edge Function, bypassing Supabase Storage.
 * This reduces latency by 3-7 seconds compared to Storage upload.
 *
 * **Features:**
 * - Drag-and-drop document upload
 * - Client-side file validation
 * - Direct upload to Edge Function (no Storage)
 * - Automatic processor execution after upload
 * - Navigates to run detail page on success
 * - Error handling with inline display
 *
 * @since Phase 1.8
 * @updated Phase 1.9 - Direct upload support
 */

'use client'

import { useState } from 'react'
import { logger, extractErrorDetails } from '@/lib/utils/logger'
import { useRouter } from '@/lib/i18n/navigation'
import { Button } from '@playze/shared-ui'
import { fileToBase64 } from '@/lib/utils/file'
/**
 * TECHNICAL DEBT: Using direct @radix-ui/react-dialog import
 *
 * Issue: Dialog from @playze/shared-ui doesn&apos;t open when triggered.
 * Cause: Unknown - likely Next.js/Turbopack bundling or workspace package resolution issue.
 * Workaround: Import Dialog directly from @radix-ui/react-dialog (works correctly).
 *
 * TODO: Investigate root cause and migrate back to @playze/shared-ui Dialog.
 * See: Phase 4 Task 4 integration issues
 *
 * @see https://github.com/anthropics/claude-code/issues (if reported)
 */
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { Play, X } from 'lucide-react'
import { useCreateRun } from '@/app/queries/runs'
import { toast } from 'sonner'
import { DropZone } from '@/components/ui/dropzone'
import { validateDocumentFile } from '@/lib/constants/documents'
import { useTranslations } from 'next-intl'
import { createAsymptoticProgress } from '@/lib/utils/progress'

// Dialog component wrappers (mirroring @playze/shared-ui structure)
const Dialog = DialogPrimitive.Root
const DialogTrigger = DialogPrimitive.Trigger
const DialogPortal = DialogPrimitive.Portal
const DialogOverlay = DialogPrimitive.Overlay

const DialogContent = ({
  children,
  className,
  closeLabel = 'Close',
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { closeLabel?: string }) => (
  <DialogPortal>
    <DialogOverlay
      onClick={(e) => e.stopPropagation()}
      className="fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=open]:pointer-events-auto data-[state=closed]:pointer-events-none"
    />
    <DialogPrimitive.Content
      className={`fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg ${className || ''}`}
      {...props}
    >
      {children}
      <DialogPrimitive.Close asChild>
        <button
          onClick={(e) => e.stopPropagation()}
          className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">{closeLabel}</span>
        </button>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
)

const DialogHeader = ({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={`flex flex-col space-y-1.5 text-center sm:text-left ${className || ''}`} {...props}>
    {children}
  </div>
)

const DialogTitle = DialogPrimitive.Title
const DialogDescription = DialogPrimitive.Description

/**
 * Props for the RunProcessorDialog component
 */
interface RunProcessorDialogProps {
  /** UUID of the processor to run */
  processorId: string
  /** Trigger element (optional, defaults to button) */
  trigger?: React.ReactNode
  /** Processor name for dialog title (optional, defaults to "Run") */
  processorName?: string
  /** Default view to navigate to (optional, defaults to "compliance") */
  defaultView?: 'technical' | 'compliance' | 'contract-comments'
}

/**
 * Run Processor Dialog
 *
 * Displays a dialog for drag-and-drop document upload and processor execution.
 * On successful upload and run creation, navigates to the run detail page.
 *
 * **User Flow (Phase 1.9 - Direct Upload):**
 * 1. User clicks "Run" button
 * 2. Dialog opens with drag-and-drop zone
 * 3. User drags and drops a file (or clicks to browse)
 * 4. File is validated client-side
 * 5. File is converted to base64
 * 6. Edge Function creates run with inline file (no Storage)
 * 7. Dialog closes and user is navigated to run detail page
 *
 * **Performance Improvement:**
 * - Eliminates 3-7 second Storage upload round trip
 * - Document processed directly in Edge Function
 *
 * **Error Handling:**
 * - Shows inline error for invalid files (size, format)
 * - Shows toast error if run creation fails
 *
 * **Future Enhancement:**
 * - TODO: Add optional Storage toggle for users who want to save documents for re-runs
 * - Possible approaches:
 *   1. UI toggle: "Save document for later re-runs"
 *   2. Automatic: Save to Storage in background (non-blocking)
 *   3. Smart: Only save if document used multiple times
 * - For now: Keep it simple, optimize for speed
 *
 * @param processorId - UUID of the processor
 * @param trigger - Custom trigger element (optional)
 * @returns Dialog component
 *
 * @example
 * ```tsx
 * <RunProcessorDialog processorId="uuid" />
 * ```
 */
export function RunProcessorDialog({
  processorId,
  trigger,
  processorName,
  defaultView = 'compliance',
}: RunProcessorDialogProps) {
  const t = useTranslations('common')
  const tUpload = useTranslations('upload')

  const [open, setOpen] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadStatus, setUploadStatus] = useState<{
    progress: number
    messageKey: string
  }>({ progress: 0, messageKey: '' })
  const [showProgress, setShowProgress] = useState(false)
  const router = useRouter()

  const createRun = useCreateRun()

  const isProcessing = createRun.isPending

  /**
   * Create a randomized delay for progress checkpoints
   * Adds brief pauses between steps to create distinct "checkpoint" feeling
   * @param min - Minimum delay in milliseconds
   * @param max - Maximum delay in milliseconds
   */
  const randomDelay = (min: number, max: number): Promise<void> => {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min
    return new Promise((resolve) => setTimeout(resolve, delay))
  }

  const handleFileSelect = async (file: File) => {
    setUploadError(null)
    setShowProgress(true)

    // Step 1: Validating file (10%)
    setUploadStatus({ progress: 10, messageKey: 'validating' })
    const validation = validateDocumentFile(file)
    if (!validation.valid) {
      // Translate error message using error type and params
      const errorMessage = validation.errorType
        ? tUpload(`errors.${validation.errorType}`, validation.errorParams)
        : 'Unknown validation error'
      setUploadError(errorMessage)
      setUploadStatus({ progress: 0, messageKey: '' })
      setShowProgress(false)
      return
    }

    // Pause briefly to show validation completed (150-250ms)
    await randomDelay(150, 250)

    // Initialize progress simulator (will be started after conversion)
    let progressSimulator: ReturnType<typeof createAsymptoticProgress> | null = null

    try {
      // Step 2: Converting file (20%)
      setUploadStatus({ progress: 20, messageKey: 'converting' })
      logger.info('[Direct Upload] Converting file to base64', { filename: file.name })
      const base64File = await fileToBase64(file)

      // Pause briefly to show conversion completed (150-250ms)
      await randomDelay(150, 250)

      // Step 3: Creating processor run (40% → 85% asymptotic)
      // Start smooth animation from 40% toward 85% over ~6s
      setUploadStatus({ progress: 40, messageKey: 'creating' })

      progressSimulator = createAsymptoticProgress({
        start: 40,
        target: 85,
        duration: 6000, // Matches slowest case: Gemini with cache up to 6s
        onUpdate: (progress) => {
          setUploadStatus({ progress, messageKey: 'creating' })
        },
      })
      progressSimulator.start()

      logger.info('[Direct Upload] Creating run with inline file', { processorId })
      const { run_id } = await createRun.mutateAsync({
        processor_id: processorId,
        file_upload: {
          file: base64File,
          filename: file.name,
          mime_type: file.type,
          size_bytes: file.size,
        },
      })

      // Stop asymptotic animation
      progressSimulator.complete()

      // Pause longer before final step to create anticipation (200-400ms)
      await randomDelay(200, 400)

      // Step 4: Preparing run view (90%)
      setUploadStatus({ progress: 90, messageKey: 'preparing' })

      // Brief pause before navigation (100-200ms)
      await randomDelay(100, 200)

      // Close dialog and navigate to run detail page with view parameter
      setOpen(false)
      router.push(`/proc/${processorId}/runs/${run_id}?view=${defaultView}`)

      toast.success('Processor run started', {
        description:
          'Processing in background. You can monitor progress on the run detail page.',
      })
    } catch (error) {
      // Ensure progress simulation is stopped on error
      if (progressSimulator) {
        progressSimulator.complete()
      }

      logger.error('Failed to create run', extractErrorDetails(error))
      const errorMessage =
        error instanceof Error
          ? error.message
          : typeof error === 'object' && error !== null && 'message' in error
            ? String(error.message)
            : 'Unknown error occurred'
      setUploadError(errorMessage)
      setUploadStatus({ progress: 0, messageKey: '' })
      setShowProgress(false)
      toast.error('Failed to start processor run', {
        description: errorMessage,
      })
    }
  }

  const handleOpenChange = (newOpen: boolean) => {
    // Reset state when dialog closes
    if (!newOpen) {
      // Delay reset until after dialog animation completes (200ms + buffer)
      setTimeout(() => {
        setUploadError(null)
        setUploadStatus({ progress: 0, messageKey: '' })
        setShowProgress(false)
      }, 300)
    }
    setOpen(newOpen)
  }

  const defaultTrigger = (
    <Button variant="default">
      <Play className="mr-2 h-4 w-4" />
      Run
    </Button>
  )

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger || defaultTrigger}</DialogTrigger>

      <DialogContent className="sm:max-w-[500px]" closeLabel={t('close')}>
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Play className="h-5 w-5" />
            <DialogTitle>{processorName || 'Run'}</DialogTitle>
          </div>
          <DialogDescription>
            {tUpload('dragAndDrop')}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <DropZone
            onFileSelect={handleFileSelect}
            uploading={showProgress}
            uploadProgress={uploadStatus.progress}
            uploadMessage={
              uploadStatus.messageKey
                ? tUpload(uploadStatus.messageKey as 'validating' | 'converting' | 'creating' | 'uploading' | 'preparing' | 'complete')
                : undefined
            }
            error={uploadError}
            disabled={isProcessing}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
