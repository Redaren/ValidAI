/**
 * Save Version Dialog Component
 *
 * @module components/processors/save-version-dialog
 * @description
 * Dialog for saving the current processor state as a new version.
 * Allows selecting visibility level before saving.
 *
 * @since Version Management UI Redesign
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
import { Save, Lock, Users } from 'lucide-react'
import { toast } from 'sonner'
import { useSaveAsVersion, type PlaybookVisibility } from '@/app/queries/playbook-snapshots'
import { logger, extractErrorDetails } from '@/lib/utils/logger'

interface SaveVersionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  processorId: string
  processorName: string
  operationCount: number
  onSuccess?: (snapshotId: string, versionNumber: number) => void
}

export function SaveVersionDialog({
  open,
  onOpenChange,
  processorId,
  processorName,
  operationCount,
  onSuccess,
}: SaveVersionDialogProps) {
  const [visibility, setVisibility] = useState<PlaybookVisibility>('private')
  const saveAsVersion = useSaveAsVersion()

  const handleSave = async () => {
    try {
      const result = await saveAsVersion.mutateAsync({
        processorId,
        visibility,
      })

      toast.success('Version saved', {
        description: result.message,
      })

      onOpenChange(false)
      onSuccess?.(result.snapshot_id, result.version_number)
    } catch (error) {
      logger.error('Failed to save version:', extractErrorDetails(error))
      toast.error('Failed to save version', {
        description: error instanceof Error ? error.message : 'Unknown error occurred',
      })
    }
  }

  const isSaving = saveAsVersion.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Save className="h-5 w-5" />
            <DialogTitle>Save Version</DialogTitle>
          </div>
          <DialogDescription>
            Save the current state of{' '}
            <span className="font-semibold">&quot;{processorName}&quot;</span> with{' '}
            <span className="font-semibold">{operationCount} operations</span> as a new version.
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
                <RadioGroupItem value="private" id="save-private" className="mt-1" />
                <div className="flex-1">
                  <Label
                    htmlFor="save-private"
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
                <RadioGroupItem value="organization" id="save-organization" className="mt-1" />
                <div className="flex-1">
                  <Label
                    htmlFor="save-organization"
                    className="flex items-center gap-2 font-medium cursor-pointer"
                  >
                    <Users className="h-4 w-4 text-muted-foreground" />
                    Organization
                  </Label>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    All members of your organization can view this version
                  </p>
                </div>
              </div>
            </RadioGroup>
          </div>

          <div className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
            <p>
              <strong>Note:</strong> Saving creates a new version. To make it the active
              published version, publish it from the Versions tab.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={isSaving || operationCount === 0}
          >
            {isSaving ? 'Saving...' : 'Save Version'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
