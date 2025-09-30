"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { AlertTriangle } from "lucide-react"

interface DeleteAreaDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  areaName: string
  operationCount: number
  otherAreaNames: string[]
  onDelete: (targetArea?: string) => void
  isLoading?: boolean
}

export function DeleteAreaDialog({
  open,
  onOpenChange,
  areaName,
  operationCount,
  otherAreaNames,
  onDelete,
  isLoading = false,
}: DeleteAreaDialogProps) {
  const [targetArea, setTargetArea] = useState<string>("")
  const [error, setError] = useState<string | null>(null)

  const hasOperations = operationCount > 0
  const needsTarget = hasOperations && otherAreaNames.length > 0

  // Reset target area when dialog opens/closes
  useEffect(() => {
    if (open) {
      setTargetArea("")
      setError(null)
    }
  }, [open])

  const handleDelete = () => {
    setError(null)

    // If area has operations, require target selection
    if (needsTarget && !targetArea) {
      setError("Please select a destination area")
      return
    }

    onDelete(needsTarget ? targetArea : undefined)
  }

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setTargetArea("")
      setError(null)
    }
    onOpenChange(open)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {hasOperations ? "Move Operations Before Deleting" : "Delete Area?"}
          </DialogTitle>
          <DialogDescription>
            {hasOperations ? (
              <>
                <span className="font-semibold">&quot;{areaName}&quot;</span> contains{" "}
                <span className="font-semibold">
                  {operationCount} operation{operationCount !== 1 ? "s" : ""}
                </span>
                . Choose where to move them before deleting the area.
              </>
            ) : (
              <>
                Are you sure you want to delete{" "}
                <span className="font-semibold">&quot;{areaName}&quot;</span>?
                This area is empty and can be safely deleted.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {needsTarget && (
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label htmlFor="target-area" className="text-sm font-medium">
                Move operations to:
              </label>
              <Select
                value={targetArea}
                onValueChange={setTargetArea}
                disabled={isLoading}
              >
                <SelectTrigger id="target-area">
                  <SelectValue placeholder="Select destination area" />
                </SelectTrigger>
                <SelectContent>
                  {otherAreaNames.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>

            <div className="flex items-start gap-2 rounded-md bg-amber-50 p-3 text-sm dark:bg-amber-950">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-500" />
              <p className="text-amber-900 dark:text-amber-200">
                The operations will be moved to the end of the selected area.
              </p>
            </div>
          </div>
        )}

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
            onClick={handleDelete}
            disabled={isLoading}
          >
            {isLoading
              ? "Deleting..."
              : hasOperations
                ? "Move & Delete Area"
                : "Delete Area"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}