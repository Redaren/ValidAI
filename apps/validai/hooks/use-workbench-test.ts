/**
 * Workbench Test Hook
 *
 * React Query mutation for executing LLM tests in the workbench.
 * Invokes the execute-workbench-test Edge Function with Anthropic Claude API.
 */

import { useMutation } from '@tanstack/react-query'
import { logger, extractErrorDetails } from '@/lib/utils/logger'
import { createBrowserClient } from '@playze/shared-auth/client'
import type { WorkbenchTestInput, WorkbenchTestResponse } from '@/lib/validations'

export function useWorkbenchTest() {
  const supabase = createBrowserClient()

  return useMutation({
    mutationFn: async (input: WorkbenchTestInput): Promise<WorkbenchTestResponse> => {

      const { data, error } = await supabase.functions.invoke<WorkbenchTestResponse>(
        'execute-workbench-test',
        {
          body: input
        }
      )

      if (error) {
        logger.error('Edge Function error details:', {
          message: error.message,
          context: error.context,
          error: error
        })
        throw new Error(error.message || error.context?.error || 'Failed to execute workbench test')
      }

      if (!data) {
        throw new Error('No response from Edge Function')
      }

      // Log response for debugging

      return data
    }
  })
}
