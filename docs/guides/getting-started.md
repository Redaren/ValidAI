# Getting Started with ValidAI Architecture

## Overview

ValidAI leverages **Supabase as a complete Backend-as-a-Service (BaaS)** with direct PostgREST access, database functions, Edge Functions, and real-time subscriptions. Combined with TanStack Query for client-side data management and Zustand for UI state, this creates a powerful, scalable architecture.

**Key Philosophy**: Eliminate API routes by using Supabase's full feature set - PostgREST for database operations, Edge Functions for privileged operations, and real-time subscriptions for live data.

## Quick Start

### 1. Understanding the Structure

```
validai-app/
├── app/
│   ├── queries/           # PostgREST query hooks (no API routes)
│   │   └── organizations/  # Database functions + Edge Functions
│   ├── examples/          # Architecture examples
│   └── [routes]/          # Next.js app router pages
├── stores/                # Zustand UI state (REQUIRED location)
├── lib/supabase/          # Direct Supabase clients
├── supabase/
│   ├── functions/         # Edge Functions for service-role ops
│   └── migrations/        # Database functions and RLS policies
└── components/
    └── providers/         # React context providers
```

### 2. Run the Examples

Visit these routes to see the architecture in action:

- `/examples/instruments` - Modern TanStack Query + Zustand example
- `/instruments` - Legacy pattern (for comparison)
- `/demo` - Original Supabase demo

### 3. Key Technologies

- **Supabase PostgREST**: Direct database access with automatic REST API generation
- **Supabase Edge Functions**: Deno-based functions for service-role operations
- **Supabase Real-time**: WebSocket subscriptions for live data updates
- **TanStack Query**: Client-side data caching, background updates, optimistic updates
- **Zustand**: Client-side UI state management (sidebar, notifications, etc.)
- **TypeScript**: Full type safety with generated Supabase database types
- **Next.js App Router**: Server and client component patterns

## Development Workflow

### Adding a New Feature

1. **Determine Data Access Pattern**
   - Simple CRUD → Direct PostgREST in hooks
   - Complex queries → Database functions
   - Privileged operations → Edge Functions

2. **Create Query Hooks** (if database access needed)
   ```bash
   touch app/queries/my-feature/use-my-feature.ts
   # No separate get-* files needed for PostgREST
   ```

3. **Create Database Functions** (if complex operations needed)
   ```bash
   # Create migration with your database function
   # Example: get_my_feature_data() returning TABLE format
   ```

4. **Create Edge Functions** (if service-role operations needed)
   ```bash
   mkdir supabase/functions/my-feature-action
   touch supabase/functions/my-feature-action/index.ts
   ```

5. **Create Zustand Store** (if client state needed)
   ```bash
   touch stores/my-feature-store.ts
   # Don't forget to export in stores/index.ts
   ```

6. **Implement Components**
   - Server Components for PostgREST prefetching
   - Client Components for interactivity and real-time updates

### Development Commands

```bash
cd validai-app

# Start development server
npm run dev

# Type checking
npx tsc --noEmit

# Linting
npm run lint

# Generate database types (when schema changes)
# This is done automatically via MCP Supabase integration
```

## Common Patterns

### 1. Server Component with PostgREST Prefetching

```typescript
// app/my-feature/page.tsx
import { HydrationBoundary, dehydrate } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/server'
import { createQueryClient } from '@/lib/query-client'
import { MyFeatureClient } from './my-feature-client'

export default async function MyFeaturePage() {
  const queryClient = createQueryClient()
  const supabase = await createClient()

  // Prefetch using direct PostgREST
  await queryClient.prefetchQuery({
    queryKey: ['my-feature'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('my_feature_table')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      return data
    },
  })

  // Prefetch using database function
  await queryClient.prefetchQuery({
    queryKey: ['my-feature-analytics'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_my_feature_analytics')
      if (error) throw error
      return data
    },
  })

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <MyFeatureClient />
    </HydrationBoundary>
  )
}
```

### 2. Client Component with PostgREST Hooks

```typescript
// app/my-feature/my-feature-client.tsx
'use client'

import { useMyFeature, useCreateMyFeature, useMyFeatureSubscription } from '@/app/queries/my-feature/use-my-feature'
import { useNotificationStore } from '@/stores'

export function MyFeatureClient() {
  const { data, isLoading, error } = useMyFeature()
  const createFeature = useCreateMyFeature()
  const addNotification = useNotificationStore((state) => state.addNotification)

  // Enable real-time subscriptions
  useMyFeatureSubscription()

  const handleCreate = async (name: string) => {
    try {
      await createFeature.mutateAsync({ name })
      addNotification({
        type: 'success',
        title: 'Feature created successfully',
      })
    } catch (error) {
      addNotification({
        type: 'error',
        title: 'Failed to create feature',
        message: error.message,
      })
    }
  }

  if (isLoading) return <div>Loading...</div>

  if (error) {
    addNotification({
      type: 'error',
      title: 'Failed to load data',
      message: error.message,
    })
    return <div>Error occurred</div>
  }

  return (
    <div>
      {/* Real-time updated UI */}
      {data?.map(item => (
        <div key={item.id}>{item.name}</div>
      ))}
    </div>
  )
}
```

### 3. PostgREST Query Hook

```typescript
// app/queries/my-feature/use-my-feature.ts
'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useEffect } from 'react'

// Direct PostgREST query
export function useMyFeature() {
  const supabase = createClient()

  return useQuery({
    queryKey: ['my-feature'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('my_feature_table')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      return data
    },
  })
}

// Database function query
export function useMyFeatureAnalytics() {
  const supabase = createClient()

  return useQuery({
    queryKey: ['my-feature-analytics'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_my_feature_analytics')
      if (error) throw error
      return data
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

// Mutation using PostgREST
export function useCreateMyFeature() {
  const queryClient = useQueryClient()
  const supabase = createClient()

  return useMutation({
    mutationFn: async (data: { name: string }) => {
      const { data: result, error } = await supabase
        .from('my_feature_table')
        .insert(data)
        .select()
        .single()

      if (error) throw error
      return result
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-feature'] })
    },
  })
}

// Real-time subscription
export function useMyFeatureSubscription() {
  const queryClient = useQueryClient()
  const supabase = createClient()

  useEffect(() => {
    const channel = supabase
      .channel('my-feature')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'my_feature_table',
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['my-feature'] })
        }
      )
      .subscribe()

    return () => {
      channel.unsubscribe()
    }
  }, [queryClient, supabase])
}
```

### 4. Zustand Store (UI State Only)

```typescript
// stores/my-feature-store.ts
import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

// Only for UI state - server data lives in TanStack Query
interface MyFeatureState {
  isExpanded: boolean
  selectedId: string | null
  filterMode: 'all' | 'active' | 'archived'
  setExpanded: (expanded: boolean) => void
  setSelectedId: (id: string | null) => void
  setFilterMode: (mode: 'all' | 'active' | 'archived') => void
}

export const useMyFeatureStore = create<MyFeatureState>()(
  devtools(
    (set) => ({
      isExpanded: false,
      selectedId: null,
      filterMode: 'all',
      setExpanded: (expanded) => set({ isExpanded: expanded }),
      setSelectedId: (id) => set({ selectedId: id }),
      setFilterMode: (mode) => set({ filterMode: mode }),
    }),
    { name: 'my-feature-store' }
  )
)
```

## Authentication

Authentication is already set up and should not be modified:

- Middleware handles session refresh automatically
- Use existing auth components in `/auth` routes
- Protected routes work via the `/protected` layout

## Environment Variables

Required in `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY=your-anon-key
```

## DevTools

- **React Query DevTools**: Available in development at bottom of screen
- **Zustand DevTools**: Use browser extension for Redux DevTools
- **TypeScript**: Full type checking and autocomplete

## Next Steps

1. Read the [Architecture Documentation](../architecture/)
2. Check out specific guides for [Adding Queries](./adding-queries.md) and [Creating Stores](./creating-stores.md)
3. Review the example implementations in `app/examples/`
4. Start building your features using these patterns!