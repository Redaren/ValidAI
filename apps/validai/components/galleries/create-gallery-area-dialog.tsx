"use client"

import { useState } from "react"
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
import { createGalleryAreaSchema, type CreateGalleryAreaInput } from "@/lib/validations"
import { IconPicker } from './icon-picker'
import { FolderOpen } from 'lucide-react'

interface CreateGalleryAreaDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  galleryId: string
  onCreate: (data: CreateGalleryAreaInput) => void
  isLoading?: boolean
}

/**
 * Create Gallery Area Dialog Component
 *
 * A dialog for creating new areas within a gallery. Areas are used to organize
 * processors by themes (e.g., Sales, HR, Compliance).
 *
 * @param open - Whether the dialog is open
 * @param onOpenChange - Callback when dialog open state changes
 * @param galleryId - The gallery ID to create the area in
 * @param onCreate - Callback when area is created
 * @param isLoading - Whether the creation is in progress
 */
export function CreateGalleryAreaDialog({
  open,
  onOpenChange,
  galleryId,
  onCreate,
  isLoading = false,
}: CreateGalleryAreaDialogProps) {
  const [showIconPicker, setShowIconPicker] = useState(false)

  const form = useForm<CreateGalleryAreaInput>({
    resolver: zodResolver(createGalleryAreaSchema),
    defaultValues: {
      gallery_id: galleryId,
      name: '',
      description: '',
      icon: undefined,
    },
  })

  const handleSubmit = (data: CreateGalleryAreaInput) => {
    onCreate(data)
  }

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      form.reset()
      setShowIconPicker(false)
    }
    onOpenChange(open)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={form.handleSubmit(handleSubmit)}>
          <DialogHeader>
            <DialogTitle>Create New Area</DialogTitle>
            <DialogDescription>
              Areas help organize processors by themes like Sales, HR, or Compliance.
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
              {isLoading ? "Creating..." : "Create Area"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
