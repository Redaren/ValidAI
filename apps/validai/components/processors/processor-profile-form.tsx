'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  processorProfileSchema,
  type ProcessorProfileInput,
  commaSeparatedToArray,
} from '@/lib/validations'
import { useUpdateProcessor } from '@/app/queries/processors/use-processor-detail'
import type { ProcessorDetail } from '@/app/queries/processors/use-processor-detail'
import { Button, Input, Label, Textarea } from '@playze/shared-ui'
import { logger, extractErrorDetails } from '@/lib/utils/logger'

/**
 * Props for the ProcessorProfileForm component
 */
interface ProcessorProfileFormProps {
  /** The processor being edited */
  processor: ProcessorDetail
}

/**
 * Processor Profile Form Component
 *
 * An editable form for processor discovery information displayed in the Profile tab.
 * Contains fields for Title (name), Usage Description, and Tags.
 *
 * ## Field Layout Pattern
 * Each field follows this structure:
 * - Label (bold)
 * - Helper text (subtle gray, below label)
 * - Input field (below helper text)
 * - Error message (if validation fails)
 *
 * ## Features
 * - Uses React Hook Form with Zod validation
 * - Save button disabled when no changes (uses form.formState.isDirty)
 * - Shows "Saving..." during mutation
 * - Displays error message if save fails
 * - Resets dirty state after successful save
 */
export function ProcessorProfileForm({ processor }: ProcessorProfileFormProps) {
  const updateProcessor = useUpdateProcessor()

  const form = useForm<ProcessorProfileInput>({
    resolver: zodResolver(processorProfileSchema),
    defaultValues: {
      name: processor.processor_name,
      usage_description: processor.usage_description || '',
      tags: processor.tags || [],
    },
  })

  /**
   * Reset form when processor changes (e.g., after successful save)
   */
  useEffect(() => {
    form.reset({
      name: processor.processor_name,
      usage_description: processor.usage_description || '',
      tags: processor.tags || [],
    })
  }, [processor, form])

  /**
   * Form submission handler
   */
  const onSubmit = async (data: ProcessorProfileInput) => {
    try {
      await updateProcessor.mutateAsync({
        processorId: processor.processor_id,
        name: data.name,
        usage_description: data.usage_description || null,
        tags: data.tags || null,
      })
      // Reset form state to clear dirty flag after successful save
      form.reset(data)
    } catch (error) {
      logger.error('Failed to update processor profile:', extractErrorDetails(error))
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      {/* Title Field */}
      <div className="space-y-2">
        <Label htmlFor="name" className="font-semibold">
          Title
        </Label>
        <p className="text-sm text-muted-foreground">
          This should be between 3 and 100 characters for best practices
        </p>
        <Input
          id="name"
          {...form.register('name')}
          aria-invalid={!!form.formState.errors.name}
        />
        {form.formState.errors.name && (
          <p className="text-sm text-destructive" role="alert">
            {form.formState.errors.name.message}
          </p>
        )}
      </div>

      {/* Usage Description Field */}
      <div className="space-y-2">
        <Label htmlFor="usage_description" className="font-semibold">
          Usage Description
        </Label>
        <p className="text-sm text-muted-foreground">
          Explain when to use this playbook and when not to (max 500 characters)
        </p>
        <Textarea
          id="usage_description"
          {...form.register('usage_description')}
          rows={4}
          aria-invalid={!!form.formState.errors.usage_description}
        />
        {form.formState.errors.usage_description && (
          <p className="text-sm text-destructive" role="alert">
            {form.formState.errors.usage_description.message}
          </p>
        )}
      </div>

      {/* Tags Field */}
      <div className="space-y-2">
        <Label htmlFor="tags" className="font-semibold">
          Tags
        </Label>
        <p className="text-sm text-muted-foreground">
          Comma-separated tags for searching and categorization (max 10 tags)
        </p>
        <Input
          id="tags"
          placeholder="contracts, legal, software, vendor"
          defaultValue={processor.tags?.join(', ') || ''}
          onChange={(e) => {
            const tags = commaSeparatedToArray(e.target.value)
            form.setValue('tags', tags, { shouldValidate: true, shouldDirty: true })
          }}
          aria-invalid={!!form.formState.errors.tags}
        />
        {form.formState.errors.tags && (
          <p className="text-sm text-destructive" role="alert">
            {form.formState.errors.tags.message}
          </p>
        )}
      </div>

      {/* Mutation Error Display */}
      {updateProcessor.isError && (
        <div className="rounded-md bg-destructive/10 p-3">
          <p className="text-sm text-destructive">
            {updateProcessor.error instanceof Error
              ? updateProcessor.error.message
              : 'Failed to save. Please try again.'}
          </p>
        </div>
      )}

      {/* Save Button */}
      <div className="flex justify-end pt-4">
        <Button
          type="submit"
          disabled={updateProcessor.isPending || !form.formState.isDirty}
        >
          {updateProcessor.isPending ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </form>
  )
}
