"use client"

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@playze/shared-ui"

interface DeleteOperationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  operationName: string
  onDelete: () => void
  isLoading?: boolean
}

export function DeleteOperationDialog({
  open,
  onOpenChange,
  operationName,
  onDelete,
  isLoading = false,
}: DeleteOperationDialogProps) {
  const handleOpenChange = (open: boolean) => {
    onOpenChange(open)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Delete Operation?</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete{" "}
            <span className="font-semibold">&quot;{operationName}&quot;</span>?
            This action cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onDelete}
            disabled={isLoading}
          >
            {isLoading ? "Deleting..." : "Delete Operation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
