# Data Fetching Architecture

## Overview

ValidAI uses TanStack Query for all server data fetching, caching, and synchronization. This provides automatic background updates, optimistic updates, and intelligent caching.

## Core Architecture

### 1. Query Functions (`app/queries/[table]/get-*.ts`)

Pure functions that accept a typed Supabase client and return data:

```typescript
import { TypedSupabaseClient } from '@/lib/supabase/types'

export async function getInstruments(supabase: TypedSupabaseClient) {
  const { data, error } = await supabase
    .from('instruments')
    .select('*')
    .order('name')

  if (error) throw error
  return data
}
```

### 2. Custom Hooks (`app/queries/[table]/use-*.ts`)

React hooks that wrap TanStack Query functionality:

```typescript
'use client'

import { useQuery } from '@tanstack/react-query'
import { createTypedBrowserClient } from '@/lib/supabase/typed-clients'
import { getInstruments } from './get-instruments'

export function useInstruments() {
  const supabase = createTypedBrowserClient()

  return useQuery({
    queryKey: ['instruments'],
    queryFn: () => getInstruments(supabase),
  })
}
```

### 3. Server-Side Prefetching

For optimal performance, prefetch data on the server:

```typescript
// Server Component
import { HydrationBoundary, dehydrate } from '@tanstack/react-query'
import { createTypedServerClient } from '@/lib/supabase/typed-clients'
import { getInstruments } from '@/app/queries/instruments/get-instruments'
import { createQueryClient } from '@/lib/query-client'

export default async function InstrumentsPage() {
  const queryClient = createQueryClient()
  const supabase = await createTypedServerClient()

  // Prefetch on server
  await queryClient.prefetchQuery({
    queryKey: ['instruments'],
    queryFn: () => getInstruments(supabase),
  })

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <InstrumentsClient />
    </HydrationBoundary>
  )
}
```

## Directory Structure

```
app/queries/
├── instruments/
│   ├── get-instruments.ts    # Query functions
│   └── use-instruments.ts    # React hooks
├── users/
│   ├── get-users.ts
│   └── use-users.ts
└── [feature]/
    ├── get-[feature].ts
    └── use-[feature].ts
```

## TypeScript Integration

### Typed Supabase Clients

All query functions use the `TypedSupabaseClient` for full type safety:

```typescript
// lib/supabase/types.ts
export type TypedSupabaseClient = SupabaseClient<Database>

// lib/supabase/typed-clients.ts
export function createTypedBrowserClient(): TypedSupabaseClient
export async function createTypedServerClient(): Promise<TypedSupabaseClient>
```

### Generated Database Types

Database types are generated from Supabase schema:

```typescript
// lib/database.types.ts (auto-generated)
export interface Database {
  public: {
    Tables: {
      instruments: {
        Row: { id: number; name: string }
        Insert: { name: string }
        Update: { name?: string }
      }
    }
  }
}
```

## Query Configuration

### Default Settings

```typescript
// lib/query-client.ts
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
```

### Query Key Patterns

Consistent query key patterns for cache management:

```typescript
// Single resource
['instruments', id]

// List resources
['instruments']

// Filtered resources
['instruments', { filter: 'active' }]

// Related resources
['instruments', id, 'parts']
```

## Mutations

For data modifications, use TanStack Query mutations:

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query'

export function useCreateInstrument() {
  const queryClient = useQueryClient()
  const supabase = createTypedBrowserClient()

  return useMutation({
    mutationFn: (data: InstrumentInsert) =>
      createInstrument(supabase, data),
    onSuccess: () => {
      // Invalidate and refetch
      queryClient.invalidateQueries(['instruments'])
    },
  })
}
```

## Error Handling

### Global Error Handling

Errors are automatically caught by TanStack Query. Use Zustand for notifications:

```typescript
const { data, error, isLoading } = useInstruments()

if (error) {
  addNotification({
    type: 'error',
    title: 'Failed to load instruments',
    message: error.message,
  })
}
```

### Retry Logic

Configure retry behavior per query:

```typescript
useQuery({
  queryKey: ['critical-data'],
  queryFn: () => getCriticalData(supabase),
  retry: 3, // Retry 3 times on failure
  retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
})
```

## Performance Optimization

### Background Updates

TanStack Query automatically refetches stale data:

```typescript
useQuery({
  queryKey: ['instruments'],
  queryFn: () => getInstruments(supabase),
  staleTime: 5 * 60 * 1000, // 5 minutes
  refetchInterval: 10 * 60 * 1000, // 10 minutes
})
```

### Optimistic Updates

For better UX, implement optimistic updates:

```typescript
const updateInstrument = useMutation({
  mutationFn: (data) => updateInstrumentAPI(data),
  onMutate: async (newData) => {
    await queryClient.cancelQueries(['instruments', id])

    const previousData = queryClient.getQueryData(['instruments', id])
    queryClient.setQueryData(['instruments', id], newData)

    return { previousData }
  },
  onError: (err, newData, context) => {
    queryClient.setQueryData(['instruments', id], context.previousData)
  },
  onSettled: () => {
    queryClient.invalidateQueries(['instruments', id])
  },
})
```

## Best Practices

### ✅ DO
- Always use TypedSupabaseClient in query functions
- Organize queries by feature/table in `app/queries/`
- Use consistent query key patterns
- Implement server-side prefetching for initial loads
- Use mutations for data modifications
- Invalidate relevant queries after mutations

### ❌ DON'T
- Call Supabase directly in components
- Store server state in Zustand
- Forget to handle loading and error states
- Use overly complex query keys
- Skip TypeScript types