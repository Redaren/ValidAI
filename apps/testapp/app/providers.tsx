"use client"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useState } from "react"

/**
 * Providers Component
 *
 * Client-side providers wrapper for TestApp.
 * This component wraps children with necessary context providers.
 *
 * Why separate from layout?
 * - Root layout should be server component for better performance
 * - Client-side state (QueryClient) needs "use client" directive
 * - Separating concerns prevents hydration issues
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
            refetchOnWindowFocus: false,
          },
        },
      })
  )

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}
