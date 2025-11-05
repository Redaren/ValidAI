'use client'

import { useState } from 'react'
import { logger, extractErrorDetails } from '@/lib/utils/logger'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  createProcessorSchema,
  type CreateProcessorInput,
  commaSeparatedToArray,
} from '@/lib/validations'
import { useCreateProcessor } from '@/app/queries/processors/use-processors'
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
import { ChevronRight, Lock, Users } from 'lucide-react'
import { useTranslations } from 'next-intl'

/**
 * Props for the CreateProcessorSheet component
 */
interface CreateProcessorSheetProps {
  /** Controls whether the sheet is visible */
  open: boolean
  /** Callback fired when the sheet's open state changes */
  onOpenChange: (open: boolean) => void
}

/**
 * Create Processor Sheet Component
 *
 * A right-side sliding sheet that provides a form for creating new document processor templates.
 * This component implements the ValidAI pattern for processor creation with comprehensive validation.
 *
 * @component
 * @example
 * ```tsx
 * const [isOpen, setIsOpen] = useState(false)
 *
 * return (
 *   <>
 *     <Button onClick={() => setIsOpen(true)}>New Processor</Button>
 *     <CreateProcessorSheet open={isOpen} onOpenChange={setIsOpen} />
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
 *
 * ### Validation Setup
 * 1. **Schema Definition** (`createProcessorSchema` from `lib/validations`):
 *    - `name`: 3-100 characters (required)
 *    - `visibility`: enum ['personal', 'organization'] (required)
 *    - `description`: max 500 characters (optional)
 *    - `usage_description`: max 500 characters (optional)
 *    - `system_prompt`: max 2000 characters (optional)
 *    - `tags`: array of strings, max 10 tags, 50 chars each (optional)
 *
 * 2. **React Hook Form Integration**:
 *    ```ts
 *    const form = useForm<CreateProcessorInput>({
 *      resolver: zodResolver(createProcessorSchema), // Automatic Zod validation
 *      defaultValues: { ... }
 *    })
 *    ```
 *
 * 3. **Field Registration**:
 *    - Text inputs: `{...form.register('fieldName')}` - automatic validation
 *    - Select inputs: `form.setValue('fieldName', value, { shouldValidate: true })`
 *    - Custom inputs: `form.setValue()` with manual validation trigger
 *
 * 4. **Error Display**:
 *    - Field-level errors: `form.formState.errors.fieldName?.message`
 *    - Global errors: Displayed from mutation hook's error state
 *    - Accessible via `role="alert"` for screen readers
 *
 * ### Data Flow
 * 1. User fills form → React Hook Form watches changes
 * 2. On submit → Zod validates all fields via `zodResolver`
 * 3. If valid → `useCreateProcessor()` mutation hook called
 * 4. Mutation inserts via PostgREST (no API route needed)
 * 5. Success → Cache invalidation + navigation to `/proc/[id]`
 *
 * ### Layout Pattern
 * Follows shadcn/ui Sheet reference pattern:
 * - SheetContent: `flex flex-col gap-4` (no overflow)
 * - Form: `flex flex-1 flex-col` (fills space)
 * - Content area: `grid flex-1 overflow-y-auto px-4` (scrolls here)
 * - SheetFooter: `mt-auto` (sticks to bottom)
 *
 * ## Features
 * - ✅ Real-time field validation with Zod
 * - ✅ Type-safe form inputs via TypeScript inference
 * - ✅ Collapsible advanced section for power users
 * - ✅ Automatic navigation to processor detail page on success
 * - ✅ Smart defaults (status='draft', visibility='personal')
 * - ✅ Accessible form controls with ARIA attributes
 * - ✅ Loading states during submission
 * - ✅ Form reset on cancel or successful submission
 *
 * ## Validation Error Examples
 * - Name too short: "Must be at least 3 characters"
 * - Name too long: "Must be less than 100 characters"
 * - Description too long: "Must be less than 500 characters"
 * - Too many tags: "Maximum 10 tags allowed"
 * - Tag too long: "Tag must be less than 50 characters"
 *
 * @param {CreateProcessorSheetProps} props - Component props
 * @returns {JSX.Element} The processor creation sheet component
 *
 * @see {@link createProcessorSchema} for validation schema definition
 * @see {@link useCreateProcessor} for mutation logic
 * @see {@link CreateProcessorInput} for TypeScript type definition
 */
export function CreateProcessorSheet({ open, onOpenChange }: CreateProcessorSheetProps) {
  const t = useTranslations('processors.form')

  // Local state for collapsible advanced section
  const [showAdvanced, setShowAdvanced] = useState(false)

  // TanStack Query mutation for creating processor via PostgREST
  const createProcessor = useCreateProcessor()

  /**
   * React Hook Form setup with Zod validation
   *
   * - resolver: zodResolver(createProcessorSchema) - Integrates Zod validation
   * - Validation runs automatically on blur and submit
   * - Type safety via CreateProcessorInput (inferred from Zod schema)
   * - Uncontrolled inputs for optimal performance
   */
  const form = useForm<CreateProcessorInput>({
    resolver: zodResolver(createProcessorSchema),
    defaultValues: {
      name: '',
      visibility: 'personal', // Default to personal visibility
      description: '',
      usage_description: '',
      system_prompt: '',
      tags: [],
    },
  })

  /**
   * Form submission handler
   *
   * Validation flow:
   * 1. User clicks "Create"
   * 2. React Hook Form triggers validation via zodResolver
   * 3. If validation fails: errors displayed, submission blocked
   * 4. If validation passes: onSubmit called with validated data
   * 5. Mutation sends data to Supabase via PostgREST
   * 6. On success: form reset, sheet closes, navigate to /proc/[id]
   * 7. On error: error message displayed via mutation state
   *
   * @param {CreateProcessorInput} data - Validated form data from React Hook Form
   */
  const onSubmit = async (data: CreateProcessorInput) => {
    try {
      await createProcessor.mutateAsync(data)
      // Success: mutation hook handles:
      // - Cache invalidation for processors list
      // - Navigation to new processor detail page
      form.reset()
      onOpenChange(false)
    } catch (error) {
      // Error is displayed via createProcessor.isError state in UI
      logger.error('Failed to create processor:', extractErrorDetails(error))
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
      form.reset() // Clear all form fields
      setShowAdvanced(false) // Collapse advanced section
    }
    onOpenChange(open)
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>New Template</SheetTitle>
          <SheetDescription>
            Define a reusable template for analyzing documents
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-1 flex-col">
          <div className="grid flex-1 auto-rows-min gap-6 overflow-y-auto px-4">
            {/**
             * Name Field - Required Text Input
             *
             * Validation (via createProcessorSchema):
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
                autoFocus
              />
              {form.formState.errors.name && (
                <p className="text-sm text-destructive" role="alert">
                  {form.formState.errors.name.message} {/* Zod error message */}
                </p>
              )}
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">{t('description')}</Label>
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
              <Label htmlFor="usage_description">{t('usageDescription')}</Label>
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
             * Validation (via createProcessorSchema):
             * - Required: Must be either 'personal' or 'organization'
             * - Enum validation: Only accepts predefined values
             *
             * Pattern: Select component with manual setValue()
             * - form.watch('visibility') - subscribes to value changes
             * - form.setValue() - manually updates value with validation trigger
             * - { shouldValidate: true } - triggers Zod validation on change
             *
             * Note: Select components don't support {...form.register()}
             * so we use setValue() with shouldValidate option instead
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
               * Validation (via createProcessorSchema):
               * - Optional: Can be empty array or undefined
               * - Max items: 10 tags
               * - Each tag: 1-50 characters, trimmed, non-empty
               *
               * Pattern: Custom transform from string to array
               * - User types: "tag1, tag2, tag3" (comma-separated string)
               * - commaSeparatedToArray() transforms to: ['tag1', 'tag2', 'tag3']
               * - Zod validates the resulting array
               * - Useful for complex input transformations before validation
               */}
              <div className="space-y-2">
                <Label htmlFor="tags">{t('tags')}</Label>
                <Input
                  id="tags"
                  placeholder="contracts, legal, software, vendor"
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
          {createProcessor.isError && (
            <div className="rounded-md bg-destructive/10 p-3">
              <p className="text-sm text-destructive">
                {createProcessor.error instanceof Error
                  ? createProcessor.error.message
                  : 'Failed to create. Please try again.'}
              </p>
            </div>
          )}
        </div>

        <SheetFooter>
          {/**
           * Submit Button - Disabled During Validation/Submission
           *
           * Disabled states:
           * - createProcessor.isPending: Mutation in progress (sending to database)
           * - Form will also prevent submission if Zod validation fails
           *
           * On click:
           * 1. form.handleSubmit(onSubmit) triggers
           * 2. Zod validates all fields via zodResolver
           * 3. If valid: onSubmit() called → mutation triggered
           * 4. If invalid: errors displayed, submission blocked
           */}
          <Button type="submit" disabled={createProcessor.isPending}>
            {createProcessor.isPending ? 'Creating...' : 'Create'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={createProcessor.isPending}
          >
            Cancel
          </Button>
        </SheetFooter>
      </form>
      </SheetContent>
    </Sheet>
  )
}
