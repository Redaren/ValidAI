# Data Fetching Architecture

## Overview

ValidAI leverages Supabase's PostgREST for direct database access and TanStack Query for client-side data management. This architecture eliminates the need for custom API routes and provides automatic background updates, optimistic updates, and intelligent caching.

**Core Philosophy**: Use Supabase as a complete Backend-as-a-Service (BaaS), not just a database. Direct PostgREST access + Edge Functions + Real-time subscriptions.

## Core Architecture

### 1. Direct PostgREST Queries

ValidAI uses three approaches for data access, depending on complexity:

#### A. Simple Table Queries

Direct table access for basic CRUD operations:

```typescript
import { createClient } from '@/lib/supabase/client'

export async function getInstruments() {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('instruments')
    .select('*')
    .order('name')

  if (error) throw error
  return data
}
```

#### B. Database Functions (RPC)

For complex queries involving multiple tables or business logic:

```typescript
export async function getUserOrganizations() {
  const supabase = createClient()

  const { data, error } = await supabase.rpc('get_user_organizations')

  if (error) throw error
  return data
}
```

#### C. Edge Functions

For service-role operations requiring elevated permissions:

```typescript
export async function switchOrganization(organizationId: string) {
  const supabase = createClient()

  const { data, error } = await supabase.functions.invoke('switch-organization', {
    body: { organizationId }
  })

  if (error) throw error
  return data
}
```

### 2. TanStack Query Hooks

React hooks integrate PostgREST with TanStack Query:

```typescript
'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

// Simple table query
export function useInstruments() {
  const supabase = createClient()

  return useQuery({
    queryKey: ['instruments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('instruments')
        .select('*')
        .order('name')

      if (error) throw error
      return data
    },
  })
}

// Database function query
export function useUserOrganizations() {
  const supabase = createClient()

  return useQuery({
    queryKey: ['user-organizations'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_user_organizations')

      if (error) throw error
      return data
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

// Edge Function mutation
export function useSwitchOrganization() {
  const queryClient = useQueryClient()
  const supabase = createClient()

  return useMutation({
    mutationFn: async (organizationId: string) => {
      const { data, error } = await supabase.functions.invoke('switch-organization', {
        body: { organizationId },
      })

      if (error) throw error

      // Refresh session to get new JWT
      const { error: refreshError } = await supabase.auth.refreshSession()
      if (refreshError) throw refreshError

      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['current-organization'] })
      queryClient.invalidateQueries({ queryKey: ['user-organizations'] })
    },
  })
}
```

### 3. Server-Side Prefetching

Prefetch PostgREST data on the server for optimal performance:

```typescript
// Server Component
import { HydrationBoundary, dehydrate } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/server'
import { createQueryClient } from '@/lib/query-client'

export default async function InstrumentsPage() {
  const queryClient = createQueryClient()
  const supabase = await createClient()

  // Prefetch direct PostgREST query
  await queryClient.prefetchQuery({
    queryKey: ['instruments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('instruments')
        .select('*')
        .order('name')

      if (error) throw error
      return data
    },
  })

  // Prefetch database function
  await queryClient.prefetchQuery({
    queryKey: ['user-organizations'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_user_organizations')
      if (error) throw error
      return data
    },
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
├── organizations/           # PostgREST + Edge Functions
│   └── use-organizations.ts # Combined hooks for RPC + Edge Functions
├── instruments/            # Simple table queries
│   └── use-instruments.ts  # Direct PostgREST hooks
└── [feature]/
    └── use-[feature].ts    # Feature-specific data hooks
```

## PostgREST Function Patterns

### Database Function Creation

Database functions return TABLE format for optimal PostgREST integration:

```sql
-- Example: Get user's organizations with roles
CREATE OR REPLACE FUNCTION get_user_organizations()
RETURNS TABLE(
  organization_id uuid,
  organization_name text,
  organization_slug text,
  plan_type text,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  created_by uuid,
  user_role text,
  joined_at timestamp with time zone
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    o.id,
    o.name,
    o.slug,
    o.plan_type,
    o.created_at,
    o.updated_at,
    o.created_by,
    om.role,
    om.joined_at
  FROM organizations o
  JOIN organization_members om ON om.organization_id = o.id
  WHERE om.user_id = auth.uid();
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_user_organizations() TO authenticated;
```

### Edge Functions for Service-Role Operations

Use Edge Functions for operations requiring elevated permissions:

```typescript
// supabase/functions/switch-organization/index.ts
import { createClient } from 'jsr:@supabase/supabase-js@2'

Deno.serve(async (req) => {
  const { organizationId } = await req.json()

  // Create admin client for JWT updates
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  // Verify user has access and update JWT
  // ... validation logic ...

  const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
    user.id,
    {
      app_metadata: {
        ...user.app_metadata,
        organization_id: organizationId,
      },
    }
  )

  return new Response(
    JSON.stringify({ success: !updateError }),
    {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, content-type'
      }
    }
  )
})
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

## Real-time Subscriptions

Leverage Supabase's real-time capabilities:

```typescript
import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export function useOrganizationSubscription() {
  const queryClient = useQueryClient()
  const supabase = createClient()

  useEffect(() => {
    const channel = supabase
      .channel('organizations')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'organizations',
        },
        () => {
          // Invalidate queries when data changes
          queryClient.invalidateQueries({ queryKey: ['user-organizations'] })
          queryClient.invalidateQueries({ queryKey: ['current-organization'] })
        }
      )
      .subscribe()

    return () => {
      channel.unsubscribe()
    }
  }, [queryClient, supabase])
}
```

## Mutations with PostgREST

Use appropriate method based on operation complexity:

```typescript
// Simple table mutation
export function useCreateInstrument() {
  const queryClient = useQueryClient()
  const supabase = createClient()

  return useMutation({
    mutationFn: async (data: { name: string; type: string }) => {
      const { data: result, error } = await supabase
        .from('instruments')
        .insert(data)
        .select()
        .single()

      if (error) throw error
      return result
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instruments'] })
    },
  })
}

// Complex operation using database function
export function useCreateOrganization() {
  const queryClient = useQueryClient()
  const supabase = createClient()

  return useMutation({
    mutationFn: async (data: { name: string; slug?: string }) => {
      const { data: result, error } = await supabase.rpc(
        'create_organization',
        {
          org_name: data.name,
          org_slug: data.slug
        }
      )

      if (error) throw error
      return result
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-organizations'] })
      queryClient.invalidateQueries({ queryKey: ['current-organization'] })
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

### Optimistic Updates with PostgREST

Implement optimistic updates for better UX:

```typescript
const updateInstrument = useMutation({
  mutationFn: async ({ id, updates }) => {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('instruments')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data
  },
  onMutate: async ({ id, updates }) => {
    await queryClient.cancelQueries({ queryKey: ['instruments', id] })

    const previousData = queryClient.getQueryData(['instruments', id])
    queryClient.setQueryData(['instruments', id], {
      ...previousData,
      ...updates,
    })

    return { previousData }
  },
  onError: (err, { id }, context) => {
    queryClient.setQueryData(['instruments', id], context.previousData)
  },
  onSettled: ({ id }) => {
    queryClient.invalidateQueries({ queryKey: ['instruments', id] })
  },
})```

## Best Practices

### ✅ DO
- Use PostgREST directly - eliminate API routes for database operations
- Create database functions for complex multi-table operations
- Use Edge Functions only for service-role operations
- Implement real-time subscriptions for live data
- Use TABLE return types in database functions for PostgREST optimization
- Organize queries by feature in `app/queries/`
- Include CORS headers in Edge Functions
- Use server-side prefetching for initial loads

### ❌ DON'T
- Create API routes for simple CRUD operations
- Use JSON return types in database functions (use TABLE)
- Call Supabase directly in components (use hooks)
- Store server state in Zustand (use TanStack Query)
- Use Edge Functions for operations that can be done with RLS
- Skip error handling in query functions
- Forget to refresh JWT after Edge Function calls that update metadata