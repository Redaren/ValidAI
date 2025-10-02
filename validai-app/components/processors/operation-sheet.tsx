'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  createGenericOperationSchema,
  updateGenericOperationSchema,
  type CreateGenericOperationInput,
  type UpdateGenericOperationInput,
} from '@/lib/validations'
import {
  useCreateOperation,
  useUpdateOperation
} from '@/app/queries/operations/use-operations'
import { Operation } from '@/app/queries/processors/use-processor-detail'
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
import { ChevronRight } from 'lucide-react'

/**
 * Props for the OperationSheet component
 */
interface OperationSheetProps {
  /** Controls whether the sheet is visible */
  open: boolean
  /** Callback fired when the sheet's open state changes */
  onOpenChange: (open: boolean) => void
  /** The processor ID this operation belongs to */
  processorId: string
  /** The area name where this operation will be added (create mode only) */
  areaName?: string
  /** The operation to edit (edit mode only) */
  operation?: Operation
  /** Mode determines whether creating or editing */
  mode?: 'create' | 'edit'
}

/**
 * Operation Sheet Component - Dual Purpose Create/Edit
 *
 * A right-side sliding sheet that provides a form for creating new operations
 * or editing existing operations within a processor. Initially supports only
 * "Generic" operation type but is architected to support additional types.
 *
 * @component
 * @example
 * ```tsx
 * // Create mode
 * <OperationSheet
 *   open={isOpen}
 *   onOpenChange={setIsOpen}
 *   processorId={processor.id}
 *   areaName="Extraction"
 *   mode="create"
 * />
 *
 * // Edit mode
 * <OperationSheet
 *   open={isOpen}
 *   onOpenChange={setIsOpen}
 *   processorId={processor.id}
 *   operation={operationToEdit}
 *   mode="edit"
 * />
 * ```
 *
 * ## Dual-Mode Architecture
 *
 * ### Create Mode
 * - Requires: `areaName`, `processorId`
 * - Uses: `createGenericOperationSchema` validation
 * - Calls: `useCreateOperation` mutation
 * - Auto-calculates: position in area
 *
 * ### Edit Mode
 * - Requires: `operation`, `processorId`
 * - Uses: `updateGenericOperationSchema` validation
 * - Calls: `useUpdateOperation` mutation
 * - Preserves: area, position, operation_type
 *
 * ## Form Management
 * - Uses **React Hook Form** for optimal performance
 * - Integrates **Zod** schema validation via `@hookform/resolvers/zod`
 * - Different validation schemas for create vs edit modes
 *
 * ## Features
 * - ✅ Real-time field validation with Zod
 * - ✅ Type-safe form inputs via TypeScript inference
 * - ✅ Collapsible advanced section (prepared for future use)
 * - ✅ Context-aware (knows which area to add to in create mode)
 * - ✅ Smart position calculation (auto-orders within area)
 * - ✅ Pre-fills form data in edit mode
 * - ✅ Accessible form controls with ARIA attributes
 * - ✅ Loading states during submission
 * - ✅ Form reset on cancel or successful submission
 *
 * @param {OperationSheetProps} props - Component props
 * @returns {JSX.Element} The operation sheet component
 */
export function OperationSheet({
  open,
  onOpenChange,
  processorId,
  areaName,
  operation,
  mode = operation ? 'edit' : 'create',
}: OperationSheetProps) {
  // Local state for collapsible advanced section
  const [showAdvanced, setShowAdvanced] = useState(false)

  // TanStack Query mutations
  const createOperation = useCreateOperation()
  const updateOperation = useUpdateOperation()

  // Determine if we're in edit mode
  const isEditMode = mode === 'edit'

  /**
   * React Hook Form setup with Zod validation
   *
   * Uses different schemas based on mode:
   * - Create: includes operation_type field
   * - Edit: excludes operation_type (not editable)
   */
  const form = useForm<CreateGenericOperationInput | UpdateGenericOperationInput>({
    resolver: zodResolver(
      isEditMode ? updateGenericOperationSchema : createGenericOperationSchema
    ),
    defaultValues: isEditMode && operation
      ? {
          name: operation.name,
          description: operation.description || '',
          prompt: operation.prompt,
        }
      : {
          name: '',
          description: '',
          operation_type: 'generic' as const,
          prompt: '',
        },
  })

  /**
   * Reset form when operation changes (for edit mode)
   */
  useEffect(() => {
    if (isEditMode && operation) {
      form.reset({
        name: operation.name,
        description: operation.description || '',
        prompt: operation.prompt,
      })
    }
  }, [operation, isEditMode, form])

  /**
   * Form submission handler
   *
   * Handles both create and edit modes:
   * - Create: Adds new operation with calculated position
   * - Edit: Updates existing operation fields
   *
   * @param {CreateGenericOperationInput | UpdateGenericOperationInput} data - Validated form data
   */
  const onSubmit = async (data: CreateGenericOperationInput | UpdateGenericOperationInput) => {
    try {
      if (isEditMode && operation) {
        // Edit mode: Update existing operation
        await updateOperation.mutateAsync({
          id: operation.id,
          updates: data as UpdateGenericOperationInput,
        })
      } else if (!isEditMode && areaName) {
        // Create mode: Add new operation
        await createOperation.mutateAsync({
          ...(data as CreateGenericOperationInput),
          processor_id: processorId,
          area: areaName,
          // Position is calculated in the mutation hook
        })
      }
      // Success: mutation hooks handle cache invalidation
      form.reset()
      onOpenChange(false)
    } catch (error) {
      // Error is displayed via mutation.isError state in UI
      console.error('Failed to save operation:', error)
    }
  }

  /**
   * Sheet close handler with cleanup
   *
   * Ensures form state is reset when sheet is closed
   *
   * @param {boolean} open - New open state
   */
  const handleOpenChange = (open: boolean) => {
    if (!open) {
      form.reset()
      setShowAdvanced(false)
    }
    onOpenChange(open)
  }

  // Determine which mutation is currently pending
  const isPending = createOperation.isPending || updateOperation.isPending
  const error = createOperation.isError
    ? createOperation.error
    : updateOperation.isError
    ? updateOperation.error
    : null

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{isEditMode ? 'Edit Operation' : 'New Operation'}</SheetTitle>
          <SheetDescription>
            {isEditMode
              ? 'Update the operation details for analyzing documents'
              : 'Define an operation for analyzing documents'
            }
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-1 flex-col">
          <div className="grid flex-1 auto-rows-min gap-6 overflow-y-auto px-4">
            {/**
             * Name Field - Required Text Input
             *
             * Validation:
             * - Required: Cannot be empty
             * - Min length: 3 characters
             * - Max length: 100 characters
             * - Auto-trimmed whitespace
             */}
            <div className="space-y-2">
              <Label htmlFor="name">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                {...form.register('name')}
                placeholder="Operation name"
                aria-invalid={!!form.formState.errors.name}
                autoFocus
              />
              {form.formState.errors.name && (
                <p className="text-sm text-destructive" role="alert">
                  {form.formState.errors.name.message}
                </p>
              )}
            </div>

            {/* Description - Optional Textarea */}
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                {...form.register('description')}
                placeholder="Describe what this operation does"
                rows={3}
              />
              {form.formState.errors.description && (
                <p className="text-sm text-destructive" role="alert">
                  {form.formState.errors.description.message}
                </p>
              )}
            </div>

            {/* CONFIGURATION Section */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Configuration
              </h3>

              {/**
               * Operation Type Field - Disabled in both modes for now
               *
               * In edit mode: Shows the existing operation type (read-only)
               * In create mode: Shows "Generic" (only option for now)
               */}
              <div className="space-y-2">
                <Label htmlFor="operation_type">
                  Operation Type <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={isEditMode ? operation?.operation_type : 'generic'}
                  disabled // Always disabled for now
                >
                  <SelectTrigger id="operation_type" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="generic">Generic</SelectItem>
                    {/* Show other types if editing an operation of that type */}
                    {isEditMode && operation?.operation_type !== 'generic' && (
                      <SelectItem value={operation.operation_type}>
                        {operation.operation_type.charAt(0).toUpperCase() +
                         operation.operation_type.slice(1)}
                      </SelectItem>
                    )}
                    {/* Future types will be added here:
                    <SelectItem value="extraction">Extraction</SelectItem>
                    <SelectItem value="validation">Validation</SelectItem>
                    <SelectItem value="rating">Rating</SelectItem>
                    <SelectItem value="classification">Classification</SelectItem>
                    <SelectItem value="analysis">Analysis</SelectItem>
                    */}
                  </SelectContent>
                </Select>
              </div>

              {/**
               * Prompt Field - Required Large Textarea
               *
               * The main instruction field that tells the AI what to do.
               * Larger than other textareas to accommodate detailed instructions.
               */}
              <div className="space-y-2">
                <Label htmlFor="prompt">
                  Prompt <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id="prompt"
                  {...form.register('prompt')}
                  placeholder="Instructions for the AI. Be specific about what to extract, validate, or analyze."
                  rows={5}
                  className="resize-none"
                />
                {form.formState.errors.prompt && (
                  <p className="text-sm text-destructive" role="alert">
                    {form.formState.errors.prompt.message}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Instructions sent to the AI for this operation
                </p>
              </div>
            </div>

            {/* ADVANCED OPTIONS - Collapsible (Empty for now) */}
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
                {/*
                  Currently empty, but prepared for future options like:
                  - Output format preferences
                  - Model configuration overrides
                  - Retry settings
                  - Temperature adjustments
                  - etc.
                */}
                <p className="text-sm text-muted-foreground">
                  Advanced options will be available in future updates.
                </p>
              </CollapsibleContent>
            </Collapsible>

            {/**
             * Global Error Display
             *
             * Shows errors from the mutation hook (database/network errors)
             */}
            {error && (
              <div className="rounded-md bg-destructive/10 p-3">
                <p className="text-sm text-destructive">
                  {error instanceof Error
                    ? error.message
                    : `Failed to ${isEditMode ? 'update' : 'create'} operation. Please try again.`}
                </p>
              </div>
            )}
          </div>

          <SheetFooter>
            {/**
             * Submit Button - Primary action
             * Text changes based on mode: Create vs Save
             */}
            <Button type="submit" disabled={isPending}>
              {isPending
                ? (isEditMode ? 'Saving...' : 'Creating...')
                : (isEditMode ? 'Save' : 'Create')
              }
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}