/**
 * Run Processor Dialog Component
 *
 * @module components/processors/run-processor-dialog
 * @description
 * Dialog for selecting a document and triggering a processor run.
 * Invokes the execute-processor-run Edge Function and navigates to the run detail page.
 *
 * **Features:**
 * - Document selector dropdown
 * - Displays document name and file size
 * - Creates run via Edge Function
 * - Navigates to run detail page on success
 * - Loading states and error handling
 *
 * @since Phase 1.8
 */

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Play, FileText } from 'lucide-react'
import { useDocuments } from '@/app/queries/documents'
import { useCreateRun } from '@/app/queries/runs'
import { toast } from 'sonner'

/**
 * Props for the RunProcessorDialog component
 */
interface RunProcessorDialogProps {
  /** UUID of the processor to run */
  processorId: string
  /** Trigger element (optional, defaults to button) */
  trigger?: React.ReactNode
}

/**
 * Formats file size in bytes to human-readable format
 *
 * @param bytes - File size in bytes
 * @returns Formatted string (e.g., "1.5 MB")
 */
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

/**
 * Run Processor Dialog
 *
 * Displays a dialog for selecting a document and starting a processor run.
 * On successful run creation, navigates to the run detail page.
 *
 * **User Flow:**
 * 1. User clicks "Run Processor" button
 * 2. Dialog opens with document selector
 * 3. User selects a document from dropdown
 * 4. User clicks "Start Run"
 * 5. Edge Function creates run and returns run_id
 * 6. User is navigated to run detail page
 *
 * **Error Handling:**
 * - Shows toast error if Edge Function fails
 * - Disables button while loading
 * - Shows empty state if no documents exist
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
export function RunProcessorDialog({ processorId, trigger }: RunProcessorDialogProps) {
  const [open, setOpen] = useState(false)
  const [selectedDocumentId, setSelectedDocumentId] = useState<string>()
  const router = useRouter()

  const { data: documents, isLoading: isLoadingDocuments } = useDocuments()
  const createRun = useCreateRun()

  const handleRun = async () => {
    if (!selectedDocumentId) return

    try {
      const { run_id } = await createRun.mutateAsync({
        processor_id: processorId,
        document_id: selectedDocumentId,
      })

      setOpen(false)
      setSelectedDocumentId(undefined)

      // Navigate to run detail page
      router.push(`/proc/${processorId}/runs/${run_id}`)

      toast.success('Processor run started', {
        description: 'Processing in background. You can monitor progress on the run detail page.',
      })
    } catch (error) {
      console.error('Failed to create run:', error)
      toast.error('Failed to start processor run', {
        description: error instanceof Error ? error.message : 'Unknown error occurred',
      })
    }
  }

  const defaultTrigger = (
    <Button variant="default">
      <Play className="mr-2 h-4 w-4" />
      Run Processor
    </Button>
  )

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger || defaultTrigger}</DialogTrigger>

      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Run Processor</DialogTitle>
          <DialogDescription>
            Select a document to process. The processor will execute all operations and store the
            results.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {isLoadingDocuments ? (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              Loading documents...
            </div>
          ) : documents && documents.length > 0 ? (
            <div className="space-y-2">
              <label htmlFor="document-select" className="text-sm font-medium">
                Document
              </label>
              <Select value={selectedDocumentId} onValueChange={setSelectedDocumentId}>
                <SelectTrigger id="document-select">
                  <SelectValue placeholder="Choose a document to process" />
                </SelectTrigger>
                <SelectContent>
                  {documents.map((doc) => (
                    <SelectItem key={doc.id} value={doc.id}>
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span>{doc.name}</span>
                        <span className="text-xs text-muted-foreground">
                          ({formatFileSize(doc.size_bytes)})
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-8 text-center">
              <FileText className="h-8 w-8 text-muted-foreground" />
              <div className="space-y-1">
                <p className="text-sm font-medium">No documents found</p>
                <p className="text-xs text-muted-foreground">
                  Upload a document first to run this processor
                </p>
              </div>
            </div>
          )}

          <Button
            onClick={handleRun}
            disabled={!selectedDocumentId || createRun.isPending}
            className="w-full"
          >
            {createRun.isPending ? (
              <>
                <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Starting...
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" />
                Start Run
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
