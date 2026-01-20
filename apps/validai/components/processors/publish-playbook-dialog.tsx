/**
 * Publish Playbook Dialog Component
 *
 * @module components/processors/publish-playbook-dialog
 * @description
 * Dialog for publishing a processor as a frozen playbook snapshot.
 * Allows selecting visibility level before publishing.
 *
 * **Features:**
 * - Visibility selection (private, organization)
 * - Shows operation count that will be published
 * - Confirmation before creating snapshot
 *
 * @since Phase 2.0 - Publish Workflow
 */

'use client'

import { useState } from 'react'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  RadioGroup,
  RadioGroupItem,
} from '@playze/shared-ui'
import { Upload, Lock, Users } from 'lucide-react'
import { toast } from 'sonner'
import { usePublishPlaybook, type PlaybookVisibility } from '@/app/queries/playbook-snapshots'
import { logger, extractErrorDetails } from '@/lib/utils/logger'

interface PublishPlaybookDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  processorId: string
  processorName: string
  operationCount: number
  onSuccess?: (snapshotId: string, versionNumber: number) => void
}

export function PublishPlaybookDialog({
  open,
  onOpenChange,
  processorId,
  processorName,
  operationCount,
  onSuccess,
}: PublishPlaybookDialogProps) {
  const [visibility, setVisibility] = useState<PlaybookVisibility>('private')
  const publishPlaybook = usePublishPlaybook()

  const handlePublish = async () => {
    try {
      const result = await publishPlaybook.mutateAsync({
        processorId,
        visibility,
      })

      toast.success('Playbook published successfully', {
        description: result.message,
      })

      onOpenChange(false)
      onSuccess?.(result.snapshot_id, result.version_number)
    } catch (error) {
      logger.error('Failed to publish playbook:', extractErrorDetails(error))
      toast.error('Failed to publish playbook', {
        description: error instanceof Error ? error.message : 'Unknown error occurred',
      })
    }
  }

  const isPublishing = publishPlaybook.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            <DialogTitle>Publish Playbook</DialogTitle>
          </div>
          <DialogDescription>
            Create a frozen snapshot of{' '}
            <span className="font-semibold">&quot;{processorName}&quot;</span> with{' '}
            <span className="font-semibold">{operationCount} operations</span>.
            <br />
            <br />
            Published versions are immutable and can be used to run documents without
            being affected by future edits to the draft.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          <div className="space-y-3">
            <Label className="text-sm font-medium">Visibility</Label>
            <RadioGroup
              value={visibility}
              onValueChange={(value) => setVisibility(value as PlaybookVisibility)}
              className="space-y-3"
            >
              <div className="flex items-start space-x-3">
                <RadioGroupItem value="private" id="private" className="mt-1" />
                <div className="flex-1">
                  <Label
                    htmlFor="private"
                    className="flex items-center gap-2 font-medium cursor-pointer"
                  >
                    <Lock className="h-4 w-4 text-muted-foreground" />
                    Private
                  </Label>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Only visible to you and your organization administrators
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-3">
                <RadioGroupItem value="organization" id="organization" className="mt-1" />
                <div className="flex-1">
                  <Label
                    htmlFor="organization"
                    className="flex items-center gap-2 font-medium cursor-pointer"
                  >
                    <Users className="h-4 w-4 text-muted-foreground" />
                    Organization
                  </Label>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    All members of your organization can view and run this playbook
                  </p>
                </div>
              </div>
            </RadioGroup>
          </div>

          <div className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
            <p>
              <strong>Note:</strong> After publishing, you can continue editing the draft.
              To update the published version, publish again to create a new version.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPublishing}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handlePublish}
            disabled={isPublishing || operationCount === 0}
          >
            {isPublishing ? 'Publishing...' : 'Publish'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
