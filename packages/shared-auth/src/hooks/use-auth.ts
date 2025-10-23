import { useQuery } from '@tanstack/react-query'
import { createBrowserClient } from '../client'
import { queryKeys } from '../lib/query-keys'

/**
 * Hook to get the current authenticated user.
 *
 * @example
 * const { data: user, isLoading } = useAuth()
 * if (!user) return <Login />
 */
export function useAuth() {
  return useQuery({
    queryKey: queryKeys.auth.user(),
    queryFn: async () => {
      const supabase = createBrowserClient()
      const { data: { user }, error } = await supabase.auth.getUser()
      if (error) throw error
      return user
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  })
}
