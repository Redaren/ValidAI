/**
 * Load Version Dialog Component
 *
 * @module components/processors/load-version-dialog
 * @description
 * Confirmation dialog when loading a version with unsaved changes.
 * Provides options to save & load, discard & load, or cancel.
 *
 * @since Version Management UI Redesign
 */

'use client'

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@playze/shared-ui'
import { AlertTriangle } from 'lucide-react'

interface LoadVersionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  versionNumber: number
  onSaveAndLoad: () => void
  onDiscardAndLoad: () => void
  isSaving?: boolean
  isLoading?: boolean
}

export function LoadVersionDialog({
  open,
  onOpenChange,
  versionNumber,
  onSaveAndLoad,
  onDiscardAndLoad,
  isSaving = false,
  isLoading = false,
}: LoadVersionDialogProps) {
  const isPending = isSaving || isLoading

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            <DialogTitle>Unsaved Changes</DialogTitle>
          </div>
          <DialogDescription>
            You have unsaved changes that will be lost if you load version {versionNumber}.
            What would you like to do?
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onDiscardAndLoad}
            disabled={isPending}
          >
            {isLoading ? 'Loading...' : 'Discard & Load'}
          </Button>
          <Button
            type="button"
            onClick={onSaveAndLoad}
            disabled={isPending}
          >
            {isSaving ? 'Saving...' : 'Save & Load'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
