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
import { createAreaSchema } from "@/lib/validations"

interface CreateAreaDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  existingNames: string[]
  onCreate: (newName: string) => void
  isLoading?: boolean
}

export function CreateAreaDialog({
  open,
  onOpenChange,
  existingNames,
  onCreate,
  isLoading = false,
}: CreateAreaDialogProps) {
  const [name, setName] = useState("")
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    // Validate using Zod schema
    const schema = createAreaSchema(existingNames)
    const result = schema.safeParse(name)

    if (!result.success) {
      setError(result.error.errors[0].message)
      return
    }

    onCreate(result.data)
  }

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setName("")
      setError(null)
    }
    onOpenChange(open)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create New Area</DialogTitle>
            <DialogDescription>
              Enter a name for the new area. You can organize operations by
              dragging them into different areas.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="area-name">Area name</Label>
              <Input
                id="area-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
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
              {isLoading ? "Creating..." : "Create Area"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}