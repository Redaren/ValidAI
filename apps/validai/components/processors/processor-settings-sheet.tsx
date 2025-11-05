'use client'

import { useEffect } from 'react'
import { logger, extractErrorDetails } from '@/lib/utils/logger'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  updateProcessorSettingsSchema,
  type UpdateProcessorSettingsInput,
} from '@/lib/validations'
import { useUpdateProcessorSettings } from '@/app/queries/processors/use-processor-detail'
import { ProcessorDetail } from '@/app/queries/processors/use-processor-detail'
import { Button, Label, Textarea } from '@playze/shared-ui'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

/**
 * Props for the ProcessorSettingsSheet component
 */
interface ProcessorSettingsSheetProps {
  /** Controls whether the sheet is visible */
  open: boolean
  /** Callback fired when the sheet's open state changes */
  onOpenChange: (open: boolean) => void
  /** The processor being configured */
  processor: ProcessorDetail
}

/**
 * Processor Settings Sheet Component
 *
 * A right-side sliding sheet that provides a form for updating processor settings.
 * Currently supports system prompt configuration.
 *
 * @component
 * @example
 * ```tsx
 * <ProcessorSettingsSheet
 *   open={isOpen}
 *   onOpenChange={setIsOpen}
 *   processor={processor}
 * />
 * ```
 *
 * ## Form Management
 * - Uses **React Hook Form** for optimal performance
 * - Integrates **Zod** schema validation via `@hookform/resolvers/zod`
 * - Pre-fills form with current processor settings
 *
 * ## Features
 * - ✅ Real-time field validation with Zod
 * - ✅ Type-safe form inputs via TypeScript inference
 * - ✅ Pre-fills current system prompt
 * - ✅ Accessible form controls with ARIA attributes
 * - ✅ Loading states during submission
 * - ✅ Form reset on cancel or successful submission
 *
 * @param {ProcessorSettingsSheetProps} props - Component props
 * @returns {JSX.Element} The processor settings sheet component
 */
export function ProcessorSettingsSheet({
  open,
  onOpenChange,
  processor,
}: ProcessorSettingsSheetProps) {
  const updateSettings = useUpdateProcessorSettings()

  /**
   * React Hook Form setup with Zod validation
   */
  const form = useForm<UpdateProcessorSettingsInput>({
    resolver: zodResolver(updateProcessorSettingsSchema),
    defaultValues: {
      system_prompt: processor.system_prompt || '',
    },
  })

  /**
   * Reset form when processor changes
   */
  useEffect(() => {
    form.reset({
      system_prompt: processor.system_prompt || '',
    })
  }, [processor.system_prompt, form])

  /**
   * Form submission handler
   *
   * @param {UpdateProcessorSettingsInput} data - Validated form data
   */
  const onSubmit = async (data: UpdateProcessorSettingsInput) => {
    try {
      await updateSettings.mutateAsync({
        processorId: processor.processor_id,
        systemPrompt: data.system_prompt,
      })
      form.reset()
      onOpenChange(false)
    } catch (error) {
      logger.error('Failed to update processor settings:', extractErrorDetails(error))
    }
  }

  /**
   * Sheet close handler with cleanup
   *
   * @param {boolean} open - New open state
   */
  const handleOpenChange = (open: boolean) => {
    if (!open) {
      form.reset()
    }
    onOpenChange(open)
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Processor Settings</SheetTitle>
          <SheetDescription>
            Configure settings for {processor.processor_name}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-1 flex-col">
          <div className="grid flex-1 auto-rows-min gap-6 overflow-y-auto px-4">
            {/* System Prompt */}
            <div className="space-y-2">
              <Label htmlFor="system_prompt">System Prompt</Label>
              <Textarea
                id="system_prompt"
                {...form.register('system_prompt')}
                placeholder="Context provided to the AI for all operations"
                rows={10}
                className="resize-none"
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

            {/* Global Error Display */}
            {updateSettings.isError && (
              <div className="rounded-md bg-destructive/10 p-3">
                <p className="text-sm text-destructive">
                  {updateSettings.error instanceof Error
                    ? updateSettings.error.message
                    : 'Failed to update settings. Please try again.'}
                </p>
              </div>
            )}
          </div>

          <SheetFooter>
            <Button type="submit" disabled={updateSettings.isPending}>
              {updateSettings.isPending ? 'Saving...' : 'Save'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={updateSettings.isPending}
            >
              Cancel
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
