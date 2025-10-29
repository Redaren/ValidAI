/**
 * @fileoverview useOCRTest Hook - React Query hook for OCR processing
 * @module hooks/use-ocr-test
 */

import { useMutation } from '@tanstack/react-query'
import { createBrowserClient } from '@playze/shared-auth/client'
import type { OCRResult } from '@/stores/workbench-store'

/**
 * OCR test input parameters
 */
interface OCRTestInput {
  processor_id: string
  model_id: string
  annotation_format: string
  file_content: string
  file_type: string
}

/**
 * useOCRTest Hook
 *
 * React Query mutation for processing documents with Mistral OCR.
 * Invokes the execute-workbench-test Edge Function with OCR-specific parameters.
 *
 * @returns TanStack Query mutation object
 *
 * @example
 * ```tsx
 * const ocrMutation = useOCRTest()
 *
 * const handleProcess = async () => {
 *   const result = await ocrMutation.mutateAsync({
 *     processor_id: 'uuid',
 *     model_id: 'mistral-ocr-latest',
 *     annotation_format: 'chapters',
 *     file_content: base64String,
 *     file_type: 'application/pdf'
 *   })
 *   console.log(result.markdown, result.annotations)
 * }
 * ```
 */
export function useOCRTest() {
  return useMutation<OCRResult, Error, OCRTestInput>({
    mutationFn: async (input: OCRTestInput) => {
      const supabase = createBrowserClient()

      const { data, error } = await supabase.functions.invoke(
        'execute-workbench-test',
        {
          body: input,
        }
      )

      if (error) {
        throw new Error(error.message || 'OCR processing failed')
      }

      if (!data) {
        throw new Error('No response from OCR service')
      }

      return data as OCRResult
    },
  })
}
