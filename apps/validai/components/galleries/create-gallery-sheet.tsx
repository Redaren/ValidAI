'use client'

import { useState } from 'react'
import { logger, extractErrorDetails } from '@/lib/utils/logger'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from '@/lib/i18n/navigation'
import {
  createGallerySchema,
  type CreateGalleryInput,
  commaSeparatedToArray,
} from '@/lib/validations'
import { useCreateGallery } from '@/app/queries/galleries'
import {
  Button,
  Input,
  Label,
  Textarea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@playze/shared-ui'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ChevronRight, Lock, Users, LayoutGrid } from 'lucide-react'
import { IconPicker } from './icon-picker'
import { useTranslations } from 'next-intl'

/**
 * Props for the CreateGallerySheet component
 */
interface CreateGallerySheetProps {
  /** Controls whether the sheet is visible */
  open: boolean
  /** Callback fired when the sheet's open state changes */
  onOpenChange: (open: boolean) => void
}

/**
 * Create Gallery Sheet Component
 *
 * A right-side sliding sheet that provides a form for creating new processor galleries.
 * Galleries organize processors into themed collections with areas.
 *
 * @component
 * @example
 * ```tsx
 * const [isOpen, setIsOpen] = useState(false)
 *
 * return (
 *   <>
 *     <Button onClick={() => setIsOpen(true)}>New Gallery</Button>
 *     <CreateGallerySheet open={isOpen} onOpenChange={setIsOpen} />
 *   </>
 * )
 * ```
 *
 * ## Features
 * - Name and description fields
 * - Lucide icon picker for visual representation
 * - Visibility control (personal/organization)
 * - Status selection (draft/published)
 * - Optional tags for categorization
 * - Real-time validation with Zod
 * - Automatic navigation to gallery detail page on success
 *
 * @param {CreateGallerySheetProps} props - Component props
 * @returns {JSX.Element} The gallery creation sheet component
 *
 * @see {@link createGallerySchema} for validation schema definition
 * @see {@link useCreateGallery} for mutation logic
 * @see {@link IconPicker} for icon selection component
 */
export function CreateGallerySheet({ open, onOpenChange }: CreateGallerySheetProps) {
  const t = useTranslations('galleries.form')
  const router = useRouter()

  // Local state for collapsible advanced section
  const [showAdvanced, setShowAdvanced] = useState(false)

  // TanStack Query mutation for creating gallery via PostgREST
  const createGallery = useCreateGallery()

  /**
   * React Hook Form setup with Zod validation
   */
  const form = useForm<CreateGalleryInput>({
    resolver: zodResolver(createGallerySchema),
    defaultValues: {
      name: '',
      visibility: 'personal',
      description: '',
      icon: undefined,
      status: 'draft',
      tags: [],
    },
  })

  /**
   * Form submission handler
   *
   * @param {CreateGalleryInput} data - Validated form data from React Hook Form
   */
  const onSubmit = async (data: CreateGalleryInput) => {
    try {
      const result = await createGallery.mutateAsync(data)
      form.reset()
      onOpenChange(false)
      // Navigate to gallery detail page
      router.push(`/gallery/${result.id}`)
    } catch (error) {
      logger.error('Failed to create gallery:', extractErrorDetails(error))
    }
  }

  /**
   * Sheet close handler with cleanup
   */
  const handleOpenChange = (open: boolean) => {
    if (!open) {
      form.reset()
      setShowAdvanced(false)
    }
    onOpenChange(open)
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>New Gallery</SheetTitle>
          <SheetDescription>
            Create a themed collection to organize processors for convenient access
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-1 flex-col">
          <div className="grid flex-1 auto-rows-min gap-6 overflow-y-auto px-4">
            {/* Name Field */}
            <div className="space-y-2">
              <Label htmlFor="name">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                {...form.register('name')}
                placeholder="Sales Contracts"
                aria-invalid={!!form.formState.errors.name}
                autoFocus
              />
              {form.formState.errors.name && (
                <p className="text-sm text-destructive" role="alert">
                  {form.formState.errors.name.message}
                </p>
              )}
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                {...form.register('description')}
                placeholder="A short description of what this gallery contains"
                rows={3}
              />
              {form.formState.errors.description && (
                <p className="text-sm text-destructive" role="alert">
                  {form.formState.errors.description.message}
                </p>
              )}
            </div>

            {/* Icon Picker */}
            <div className="space-y-2">
              <Label htmlFor="icon">
                <LayoutGrid className="inline h-4 w-4 mr-1.5" />
                Icon
              </Label>
              <IconPicker
                value={form.watch('icon') || null}
                onChange={(iconName) => form.setValue('icon', iconName, { shouldValidate: true })}
              />
              {form.formState.errors.icon && (
                <p className="text-sm text-destructive" role="alert">
                  {form.formState.errors.icon.message}
                </p>
              )}
            </div>

            {/* CONFIGURATION */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Configuration
              </h3>

              {/* Visibility Field */}
              <div className="space-y-2">
                <Label htmlFor="visibility">
                  Visibility <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={form.watch('visibility')}
                  onValueChange={(value) =>
                    form.setValue('visibility', value as 'personal' | 'organization', {
                      shouldValidate: true,
                    })
                  }
                >
                  <SelectTrigger id="visibility" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="personal">
                      <span className="flex items-center gap-2">
                        <Lock className="h-3.5 w-3.5" />
                        Personal (only you)
                      </span>
                    </SelectItem>
                    <SelectItem value="organization">
                      <span className="flex items-center gap-2">
                        <Users className="h-3.5 w-3.5" />
                        Organization (all members)
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
                {form.formState.errors.visibility && (
                  <p className="text-sm text-destructive" role="alert">
                    {form.formState.errors.visibility.message}
                  </p>
                )}
              </div>

              {/* Status Field */}
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select
                  value={form.watch('status')}
                  onValueChange={(value) =>
                    form.setValue('status', value as 'draft' | 'published', {
                      shouldValidate: true,
                    })
                  }
                >
                  <SelectTrigger id="status" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft (work in progress)</SelectItem>
                    <SelectItem value="published">Published (ready to use)</SelectItem>
                  </SelectContent>
                </Select>
                {form.formState.errors.status && (
                  <p className="text-sm text-destructive" role="alert">
                    {form.formState.errors.status.message}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Draft galleries are only visible to you
                </p>
              </div>
            </div>

            {/* ADVANCED OPTIONS - Collapsible */}
            <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="w-full justify-start p-0" type="button">
                  <ChevronRight
                    className={`h-4 w-4 transition-transform ${showAdvanced ? 'rotate-90' : ''}`}
                  />
                  <span className="ml-2 text-sm font-medium text-muted-foreground uppercase tracking-wide">
                    Advanced Options
                  </span>
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-4 pt-4">
                {/* Tags Field */}
                <div className="space-y-2">
                  <Label htmlFor="tags">Tags</Label>
                  <Input
                    id="tags"
                    placeholder="sales, contracts, legal, compliance"
                    onChange={(e) => {
                      const tags = commaSeparatedToArray(e.target.value)
                      form.setValue('tags', tags, { shouldValidate: true })
                    }}
                  />
                  {form.formState.errors.tags && (
                    <p className="text-sm text-destructive" role="alert">
                      {form.formState.errors.tags.message}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Comma-separated tags for searching and categorization
                  </p>
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* Global Error Display */}
            {createGallery.isError && (
              <div className="rounded-md bg-destructive/10 p-3">
                <p className="text-sm text-destructive">
                  {createGallery.error instanceof Error
                    ? createGallery.error.message
                    : 'Failed to create gallery. Please try again.'}
                </p>
              </div>
            )}
          </div>

          <SheetFooter>
            <Button type="submit" disabled={createGallery.isPending}>
              {createGallery.isPending ? 'Creating...' : 'Create Gallery'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={createGallery.isPending}
            >
              Cancel
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
