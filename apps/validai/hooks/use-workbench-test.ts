/**
 * Workbench Test Hook
 *
 * React Query mutation for executing LLM tests in the workbench.
 * Invokes the execute-workbench-test Edge Function with Anthropic Claude API.
 */

import { useMutation } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { WorkbenchTestInput, WorkbenchTestResponse } from '@/lib/validations'

export function useWorkbenchTest() {
  const supabase = createClient()

  return useMutation({
    mutationFn: async (input: WorkbenchTestInput): Promise<WorkbenchTestResponse> => {
      console.log('Sending request to Edge Function:', input)

      const { data, error } = await supabase.functions.invoke<WorkbenchTestResponse>(
        'execute-workbench-test',
        {
          body: input
        }
      )

      if (error) {
        console.error('Edge Function error details:', {
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
      console.log('Edge Function response:', data)

      return data
    }
  })
}
