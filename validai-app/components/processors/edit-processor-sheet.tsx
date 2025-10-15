'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  updateProcessorSchema,
  type UpdateProcessorInput,
  commaSeparatedToArray,
} from '@/lib/validations'
import { useUpdateProcessor } from '@/app/queries/processors/use-processor-detail'
import { ProcessorDetail } from '@/app/queries/processors/use-processor-detail'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ChevronRight, Lock, Users } from 'lucide-react'
import { AVAILABLE_VIEWS, type ViewType } from '@/components/runs/views'

/**
 * Props for the EditProcessorSheet component
 */
interface EditProcessorSheetProps {
  /** Controls whether the sheet is visible */
  open: boolean
  /** Callback fired when the sheet's open state changes */
  onOpenChange: (open: boolean) => void
  /** The processor being edited */
  processor: ProcessorDetail
}

/**
 * Edit Processor Sheet Component
 *
 * A right-side sliding sheet that provides a form for editing processor metadata.
 * This component implements the same UI pattern as CreateProcessorSheet with pre-filled values.
 *
 * @component
 * @example
 * ```tsx
 * const [isOpen, setIsOpen] = useState(false)
 *
 * return (
 *   <>
 *     <Button onClick={() => setIsOpen(true)}>Edit Processor</Button>
 *     <EditProcessorSheet open={isOpen} onOpenChange={setIsOpen} processor={processor} />
 *   </>
 * )
 * ```
 *
 * ## Architecture
 *
 * ### Form Management
 * - Uses **React Hook Form** for optimal performance with uncontrolled inputs
 * - Integrates **Zod** schema validation via `@hookform/resolvers/zod`
 * - Validation schema defined in `lib/validations/processor-schemas.ts`
 * - Pre-fills form with current processor values
 *
 * ### Validation Setup
 * 1. **Schema Definition** (`updateProcessorSchema` from `lib/validations`):
 *    - All fields optional (partial update)
 *    - `name`: 3-100 characters
 *    - `visibility`: enum ['personal', 'organization']
 *    - `default_run_view`: enum ['technical', 'compliance', 'contract-comments']
 *    - `description`: max 500 characters
 *    - `usage_description`: max 500 characters
 *    - `system_prompt`: max 2000 characters
 *    - `tags`: array of strings, max 10 tags, 50 chars each
 *
 * 2. **React Hook Form Integration**:
 *    ```ts
 *    const form = useForm<UpdateProcessorInput>({
 *      resolver: zodResolver(updateProcessorSchema), // Automatic Zod validation
 *      defaultValues: { ... }
 *    })
 *    ```
 *
 * ### Data Flow
 * 1. User edits form → React Hook Form watches changes
 * 2. On submit → Zod validates all fields via `zodResolver`
 * 3. If valid → `useUpdateProcessor()` mutation hook called
 * 4. Mutation updates via PostgREST (no API route needed)
 * 5. Success → Optimistic update + cache invalidation
 *
 * ### Layout Pattern
 * Follows shadcn/ui Sheet reference pattern (same as CreateProcessorSheet):
 * - SheetContent: `flex flex-col gap-4` (no overflow)
 * - Form: `flex flex-1 flex-col` (fills space)
 * - Content area: `grid flex-1 overflow-y-auto px-4` (scrolls here)
 * - SheetFooter: `mt-auto` (sticks to bottom)
 *
 * ## Features
 * - ✅ Real-time field validation with Zod
 * - ✅ Type-safe form inputs via TypeScript inference
 * - ✅ Pre-populated with current processor values
 * - ✅ Default run view selector with icons
 * - ✅ Collapsible advanced section for power users
 * - ✅ Optimistic updates for instant feedback
 * - ✅ Smart defaults (falls back to current values)
 * - ✅ Accessible form controls with ARIA attributes
 * - ✅ Loading states during submission
 * - ✅ Form reset on cancel or successful submission
 *
 * @param {EditProcessorSheetProps} props - Component props
 * @returns {JSX.Element} The processor edit sheet component
 *
 * @see {@link updateProcessorSchema} for validation schema definition
 * @see {@link useUpdateProcessor} for mutation logic
 * @see {@link UpdateProcessorInput} for TypeScript type definition
 */
export function EditProcessorSheet({ open, onOpenChange, processor }: EditProcessorSheetProps) {
  // Local state for collapsible advanced section
  const [showAdvanced, setShowAdvanced] = useState(false)

  // TanStack Query mutation for updating processor via PostgREST
  const updateProcessor = useUpdateProcessor()

  // Extract default_run_view from configuration
  const currentDefaultView = (processor.configuration as { default_run_view?: ViewType })
    ?.default_run_view

  /**
   * React Hook Form setup with Zod validation
   *
   * - resolver: zodResolver(updateProcessorSchema) - Integrates Zod validation
   * - Validation runs automatically on blur and submit
   * - Type safety via UpdateProcessorInput (inferred from Zod schema)
   * - Pre-fills with current processor values
   */
  const form = useForm<UpdateProcessorInput>({
    resolver: zodResolver(updateProcessorSchema),
    defaultValues: {
      name: processor.processor_name,
      visibility: processor.visibility,
      description: processor.processor_description || '',
      usage_description: processor.usage_description || '',
      system_prompt: processor.system_prompt || '',
      tags: processor.tags || [],
      default_run_view: currentDefaultView || 'technical',
    },
  })

  /**
   * Reset form when processor changes
   */
  useEffect(() => {
    if (open) {
      const currentDefaultView = (processor.configuration as { default_run_view?: ViewType })
        ?.default_run_view

      form.reset({
        name: processor.processor_name,
        visibility: processor.visibility,
        description: processor.processor_description || '',
        usage_description: processor.usage_description || '',
        system_prompt: processor.system_prompt || '',
        tags: processor.tags || [],
        default_run_view: currentDefaultView || 'technical',
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, processor])

  /**
   * Form submission handler
   *
   * Validation flow:
   * 1. User clicks "Save"
   * 2. React Hook Form triggers validation via zodResolver
   * 3. If validation fails: errors displayed, submission blocked
   * 4. If validation passes: onSubmit called with validated data
   * 5. Mutation sends data to Supabase via PostgREST
   * 6. On success: optimistic update, cache invalidation, sheet closes
   * 7. On error: error message displayed via mutation state
   *
   * @param {UpdateProcessorInput} data - Validated form data from React Hook Form
   */
  const onSubmit = async (data: UpdateProcessorInput) => {
    try {
      await updateProcessor.mutateAsync({
        processorId: processor.processor_id,
        ...data,
      })
      // Success: mutation hook handles:
      // - Optimistic update
      // - Cache invalidation for processor detail and list
      onOpenChange(false)
    } catch (error) {
      // Error is displayed via updateProcessor.isError state in UI
      console.error('Failed to update processor:', error)
    }
  }

  /**
   * Sheet close handler with cleanup
   *
   * Ensures form state is reset when sheet is closed via:
   * - Click outside overlay
   * - Press Escape key
   * - Click X button
   * - Click Cancel button
   *
   * @param {boolean} open - New open state
   */
  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setShowAdvanced(false) // Collapse advanced section
    }
    onOpenChange(open)
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        className="sm:max-w-xl"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <SheetHeader>
          <SheetTitle>Edit Template</SheetTitle>
          <SheetDescription>
            Update template settings and configuration
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-1 flex-col">
          <div className="grid flex-1 auto-rows-min gap-6 overflow-y-auto px-4">
            {/**
             * Name Field - Required Text Input
             *
             * Validation (via updateProcessorSchema):
             * - Required: Cannot be empty
             * - Min length: 3 characters
             * - Max length: 100 characters
             * - Auto-trimmed whitespace
             *
             * Pattern: Standard text input with form.register()
             * - {...form.register('name')} connects field to React Hook Form
             * - Validation happens automatically via zodResolver
             * - Error state accessible via form.formState.errors.name
             */}
            <div className="space-y-2">
              <Label htmlFor="name">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                {...form.register('name')} // React Hook Form registration with auto-validation
                placeholder="Template name"
                aria-invalid={!!form.formState.errors.name} // Accessibility: marks invalid state
              />
              {form.formState.errors.name && (
                <p className="text-sm text-destructive" role="alert">
                  {form.formState.errors.name.message} {/* Zod error message */}
                </p>
              )}
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                {...form.register('description')}
                placeholder="A short description so you know what the template does"
                rows={3}
              />
              {form.formState.errors.description && (
                <p className="text-sm text-destructive" role="alert">
                  {form.formState.errors.description.message}
                </p>
              )}
            </div>

            {/* Usage Description */}
            <div className="space-y-2">
              <Label htmlFor="usage_description">Usage Description</Label>
              <Textarea
                id="usage_description"
                {...form.register('usage_description')}
                placeholder="A short text explaining to users when to use this template and not"
                rows={2}
              />
              {form.formState.errors.usage_description && (
                <p className="text-sm text-destructive" role="alert">
                  {form.formState.errors.usage_description.message}
                </p>
              )}
            </div>

            {/* CONFIGURATION */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Configuration
              </h3>

              {/**
               * Visibility Field - Required Select/Enum
               *
               * Validation (via updateProcessorSchema):
               * - Required: Must be either 'personal' or 'organization'
               * - Enum validation: Only accepts predefined values
               *
               * Pattern: Select component with manual setValue()
               * - form.watch('visibility') - subscribes to value changes
               * - form.setValue() - manually updates value with validation trigger
               * - { shouldValidate: true } - triggers Zod validation on change
               */}
              <div className="space-y-2">
                <Label htmlFor="visibility">
                  Visibility <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={form.watch('visibility')} // Watch for value changes
                  onValueChange={(value) =>
                    form.setValue('visibility', value as 'personal' | 'organization', {
                      shouldValidate: true, // Trigger validation on change
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

              {/**
               * Default Run View Field - Optional Select/Enum
               *
               * Validation (via updateProcessorSchema):
               * - Optional: Defaults to 'technical' if not set
               * - Enum validation: Only accepts predefined view types
               *
               * Purpose: Sets the default view shown when opening run results
               * Storage: Saved in processors.configuration.default_run_view
               */}
              <div className="space-y-2">
                <Label htmlFor="default_run_view">Default Run View</Label>
                <Select
                  value={form.watch('default_run_view') || 'technical'}
                  onValueChange={(value) =>
                    form.setValue('default_run_view', value as ViewType, {
                      shouldValidate: true,
                    })
                  }
                >
                  <SelectTrigger id="default_run_view" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AVAILABLE_VIEWS.map((view) => {
                      const Icon = view.icon
                      return (
                        <SelectItem key={view.value} value={view.value}>
                          <span className="flex items-center gap-2">
                            {Icon && <Icon className="h-3.5 w-3.5" />}
                            {view.label}
                          </span>
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
                {form.formState.errors.default_run_view && (
                  <p className="text-sm text-destructive" role="alert">
                    {form.formState.errors.default_run_view.message}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  The default view displayed when opening run results
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
                {/* System Prompt */}
                <div className="space-y-2">
                  <Label htmlFor="system_prompt">System Prompt</Label>
                  <Textarea
                    id="system_prompt"
                    {...form.register('system_prompt')}
                    placeholder="You are analyzing a software development contract. Focus on clarity, fairness, and legal compliance. Highlight any unusual or concerning clauses."
                    rows={4}
                  />
                  {form.formState.errors.system_prompt && (
                    <p className="text-sm text-destructive" role="alert">
                      {form.formState.errors.system_prompt.message}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Context provided to the AI for all operations
                  </p>
                </div>

                {/**
                 * Tags Field - Optional Array with Transform
                 *
                 * Validation (via updateProcessorSchema):
                 * - Optional: Can be empty array or undefined
                 * - Max items: 10 tags
                 * - Each tag: 1-50 characters, trimmed, non-empty
                 *
                 * Pattern: Custom transform from string to array
                 * - User types: "tag1, tag2, tag3" (comma-separated string)
                 * - commaSeparatedToArray() transforms to: ['tag1', 'tag2', 'tag3']
                 * - Zod validates the resulting array
                 */}
                <div className="space-y-2">
                  <Label htmlFor="tags">Tags</Label>
                  <Input
                    id="tags"
                    placeholder="contracts, legal, software, vendor"
                    defaultValue={processor.tags?.join(', ') || ''}
                    onChange={(e) => {
                      const tags = commaSeparatedToArray(e.target.value) // Transform string → array
                      form.setValue('tags', tags, { shouldValidate: true }) // Validate array
                    }}
                  />
                  {form.formState.errors.tags && (
                    <p className="text-sm text-destructive" role="alert">
                      {form.formState.errors.tags.message} {/* Zod validates array constraints */}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Comma-separated tags for searching and categorization
                  </p>
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/**
             * Global Error Display
             *
             * Shows errors from the mutation hook (database/network errors),
             * not validation errors (those are shown per-field above).
             *
             * Examples:
             * - RLS policy violation
             * - Network timeout
             * - Database constraint violation
             * - Authentication errors
             */}
            {updateProcessor.isError && (
              <div className="rounded-md bg-destructive/10 p-3">
                <p className="text-sm text-destructive">
                  {updateProcessor.error instanceof Error
                    ? updateProcessor.error.message
                    : 'Failed to update. Please try again.'}
                </p>
              </div>
            )}
          </div>

          <SheetFooter>
            {/**
             * Submit Button - Disabled During Validation/Submission
             *
             * Disabled states:
             * - updateProcessor.isPending: Mutation in progress (sending to database)
             * - Form will also prevent submission if Zod validation fails
             *
             * On click:
             * 1. form.handleSubmit(onSubmit) triggers
             * 2. Zod validates all fields via zodResolver
             * 3. If valid: onSubmit() called → mutation triggered
             * 4. If invalid: errors displayed, submission blocked
             */}
            <Button type="submit" disabled={updateProcessor.isPending}>
              {updateProcessor.isPending ? 'Saving...' : 'Save'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={updateProcessor.isPending}
            >
              Cancel
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
