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
import { type GalleryArea } from "@/app/queries/galleries"
import { AlertTriangle } from 'lucide-react'

interface DeleteGalleryAreaDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  area: GalleryArea | null
  onDelete: () => void
  isLoading?: boolean
}

/**
 * Delete Gallery Area Dialog Component
 *
 * A confirmation dialog for deleting areas from a gallery. Warns the user
 * that deleting an area will remove all processors from that area (but not
 * delete the processors themselves).
 *
 * @param open - Whether the dialog is open
 * @param onOpenChange - Callback when dialog open state changes
 * @param area - The area to delete
 * @param onDelete - Callback when delete is confirmed
 * @param isLoading - Whether the deletion is in progress
 */
export function DeleteGalleryAreaDialog({
  open,
  onOpenChange,
  area,
  onDelete,
  isLoading = false,
}: DeleteGalleryAreaDialogProps) {
  if (!area) return null

  const processorCount = area.processors.length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Delete Area
          </DialogTitle>
          <DialogDescription>
            Are you sure you want to delete the area "{area.area_name}"?
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <div className="rounded-md bg-destructive/10 p-3 text-sm">
            <p className="font-medium text-destructive mb-2">This action cannot be undone.</p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>The area will be permanently deleted</li>
              {processorCount > 0 && (
                <li>
                  {processorCount} {processorCount === 1 ? 'processor' : 'processors'} will be removed from this area
                </li>
              )}
              <li>The processors themselves will not be deleted</li>
            </ul>
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
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
            {isLoading ? "Deleting..." : "Delete Area"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
