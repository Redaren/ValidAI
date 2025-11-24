"use client"

import { useState, useEffect } from "react"
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Button,
  Input,
  Label,
  Textarea,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@playze/shared-ui"
import { updateGalleryAreaSchema, type UpdateGalleryAreaInput } from "@/lib/validations"
import { type GalleryArea } from "@/app/queries/galleries"
import { IconPicker } from './icon-picker'
import { FolderOpen } from 'lucide-react'

interface EditGalleryAreaDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  area: GalleryArea | null
  onUpdate: (data: UpdateGalleryAreaInput) => void
  isLoading?: boolean
}

/**
 * Edit Gallery Area Dialog Component
 *
 * A dialog for editing existing areas within a gallery. Allows updating
 * name, description, and icon.
 *
 * @param open - Whether the dialog is open
 * @param onOpenChange - Callback when dialog open state changes
 * @param area - The area to edit
 * @param onUpdate - Callback when area is updated
 * @param isLoading - Whether the update is in progress
 */
export function EditGalleryAreaDialog({
  open,
  onOpenChange,
  area,
  onUpdate,
  isLoading = false,
}: EditGalleryAreaDialogProps) {
  const [showIconPicker, setShowIconPicker] = useState(false)

  const form = useForm<UpdateGalleryAreaInput>({
    resolver: zodResolver(updateGalleryAreaSchema),
    defaultValues: {
      name: '',
      description: '',
      icon: undefined,
    },
  })

  // Update form when area changes
  useEffect(() => {
    if (area) {
      form.reset({
        name: area.area_name,
        description: area.area_description || '',
        icon: area.area_icon || undefined,
      })
    }
  }, [area, form])

  const handleSubmit = (data: UpdateGalleryAreaInput) => {
    onUpdate(data)
  }

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setShowIconPicker(false)
    }
    onOpenChange(open)
  }

  if (!area) return null

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={form.handleSubmit(handleSubmit)}>
          <DialogHeader>
            <DialogTitle>Edit Area</DialogTitle>
            <DialogDescription>
              Update the name, description, or icon for this area.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {/* Name Field */}
            <div className="grid gap-2">
              <Label htmlFor="area-name">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="area-name"
                {...form.register('name')}
                placeholder="Sales Contracts"
                disabled={isLoading}
                autoFocus
              />
              {form.formState.errors.name && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.name.message}
                </p>
              )}
            </div>

            {/* Description Field */}
            <div className="grid gap-2">
              <Label htmlFor="area-description">Description</Label>
              <Textarea
                id="area-description"
                {...form.register('description')}
                placeholder="Processors for analyzing sales contracts and agreements"
                rows={2}
                disabled={isLoading}
              />
              {form.formState.errors.description && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.description.message}
                </p>
              )}
            </div>

            {/* Icon Picker */}
            <div className="grid gap-2">
              <Label>
                <FolderOpen className="inline h-4 w-4 mr-1.5" />
                Icon (optional)
              </Label>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowIconPicker(!showIconPicker)}
                disabled={isLoading}
                className="justify-start"
              >
                {form.watch('icon') ? `Selected: ${form.watch('icon')}` : 'Choose an icon'}
              </Button>
              {showIconPicker && (
                <IconPicker
                  value={form.watch('icon') || null}
                  onChange={(iconName) => {
                    form.setValue('icon', iconName, { shouldValidate: true })
                    setShowIconPicker(false)
                  }}
                />
              )}
              {form.formState.errors.icon && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.icon.message}
                </p>
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
              {isLoading ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
