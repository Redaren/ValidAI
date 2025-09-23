import { QueryClient } from '@tanstack/react-query'

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60000, // 60 seconds
        retry: 1,
      },
    },
  })
}