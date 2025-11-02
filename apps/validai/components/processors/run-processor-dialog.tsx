/**
 * Run Processor Dialog Component
 *
 * @module components/processors/run-processor-dialog
 * @description
 * Dialog for drag-and-drop document upload and processor execution.
 * Uploads document to Supabase Storage, triggers the execute-processor-run Edge Function,
 * and navigates to the run detail page.
 *
 * **Features:**
 * - Drag-and-drop document upload
 * - Client-side file validation
 * - Upload progress indicator
 * - Automatic processor execution after upload
 * - Navigates to run detail page on success
 * - Error handling with inline display
 *
 * @since Phase 1.8
 */

'use client'

import { useState } from 'react'
import { useRouter } from '@/lib/i18n/navigation'
import { Button } from '@playze/shared-ui'
/**
 * TECHNICAL DEBT: Using direct @radix-ui/react-dialog import
 *
 * Issue: Dialog from @playze/shared-ui doesn't open when triggered.
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
import { useUploadDocument } from '@/app/queries/documents'
import { useCreateRun } from '@/app/queries/runs'
import { toast } from 'sonner'
import { DropZone } from '@/components/ui/dropzone'
import { validateDocumentFile } from '@/lib/constants/documents'
import { useTranslations } from 'next-intl'

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
    <DialogOverlay className="fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
    <DialogPrimitive.Content
      className={`fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg ${className || ''}`}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
        <X className="h-4 w-4" />
        <span className="sr-only">{closeLabel}</span>
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
 * **User Flow:**
 * 1. User clicks "Run" button
 * 2. Dialog opens with drag-and-drop zone
 * 3. User drags and drops a file (or clicks to browse)
 * 4. File is validated client-side
 * 5. File is uploaded to Supabase Storage
 * 6. Document record is created in database
 * 7. Edge Function creates run and returns run_id
 * 8. Dialog closes and user is navigated to run detail page
 *
 * **Error Handling:**
 * - Shows inline error for invalid files (size, format)
 * - Shows toast error if upload fails
 * - Shows toast error if run creation fails
 * - Cleanup: Deletes uploaded file if database insert fails
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

  const [open, setOpen] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const router = useRouter()

  const uploadDocument = useUploadDocument()
  const createRun = useCreateRun()

  const isProcessing = uploadDocument.isPending || createRun.isPending

  const handleFileSelect = async (file: File) => {
    setUploadError(null)

    // Validate file
    const validation = validateDocumentFile(file)
    if (!validation.valid) {
      setUploadError(validation.error!)
      return
    }

    try {
      // 1. Upload file and create document record
      const document = await uploadDocument.mutateAsync(file)

      // 2. Create processor run with uploaded document
      const { run_id } = await createRun.mutateAsync({
        processor_id: processorId,
        document_id: document.id,
      })

      // 3. Close dialog and navigate to run detail page with view parameter
      setOpen(false)
      router.push(`/proc/${processorId}/runs/${run_id}?view=${defaultView}`)

      toast.success('Processor run started', {
        description:
          'Processing in background. You can monitor progress on the run detail page.',
      })
    } catch (error) {
      console.error('Failed to upload document or create run:', error)
      const errorMessage =
        error instanceof Error
          ? error.message
          : typeof error === 'object' && error !== null && 'message' in error
            ? String(error.message)
            : 'Unknown error occurred'
      setUploadError(errorMessage)
      toast.error('Failed to start processor run', {
        description: errorMessage,
      })
    }
  }

  const handleOpenChange = (newOpen: boolean) => {
    // Reset state when dialog closes
    if (!newOpen) {
      setUploadError(null)
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
            Drag and drop your document here
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <DropZone
            onFileSelect={handleFileSelect}
            uploading={isProcessing}
            uploadProgress={uploadDocument.isPending ? 50 : createRun.isPending ? 75 : 0}
            error={uploadError}
            disabled={isProcessing}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
