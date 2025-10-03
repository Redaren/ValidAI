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
      const { data, error } = await supabase.functions.invoke<WorkbenchTestResponse>(
        'execute-workbench-test',
        {
          body: input
        }
      )

      if (error) {
        throw new Error(error.message || 'Failed to execute workbench test')
      }

      if (!data) {
        throw new Error('No response from Edge Function')
      }

      return data
    }
  })
}
