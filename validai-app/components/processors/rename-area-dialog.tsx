"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { renameAreaSchema } from "@/lib/validations"

interface RenameAreaDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentName: string
  existingNames: string[]
  onRename: (newName: string) => void
  isLoading?: boolean
}

export function RenameAreaDialog({
  open,
  onOpenChange,
  currentName,
  existingNames,
  onRename,
  isLoading = false,
}: RenameAreaDialogProps) {
  const [newName, setNewName] = useState(currentName)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    // Validate using Zod schema
    const schema = renameAreaSchema(existingNames, currentName)
    const result = schema.safeParse(newName)

    if (!result.success) {
      setError(result.error.errors[0].message)
      return
    }

    // No change - just close dialog
    if (result.data === currentName) {
      onOpenChange(false)
      return
    }

    onRename(result.data)
  }

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setNewName(currentName)
      setError(null)
    }
    onOpenChange(open)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Rename Area</DialogTitle>
            <DialogDescription>
              Enter a new name for this area. This will update all operations in
              this area.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="area-name">Area name</Label>
              <Input
                id="area-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Enter area name"
                disabled={isLoading}
                autoFocus
              />
              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Renaming..." : "Rename"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}