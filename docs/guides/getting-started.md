# Getting Started with ValidAI Architecture

## Overview

ValidAI uses a modern React architecture with TanStack Query for data fetching and Zustand for state management. This guide will help you understand the patterns and get productive quickly.

## Quick Start

### 1. Understanding the Structure

```
validai-app/
├── app/
│   ├── queries/           # Database query functions and hooks
│   ├── examples/          # Modern architecture examples
│   └── [routes]/          # Next.js app router pages
├── stores/                # Zustand state stores (REQUIRED location)
├── lib/
│   ├── supabase/          # Database client utilities
│   └── query-client.ts    # TanStack Query configuration
└── components/
    └── providers/         # React context providers
```

### 2. Run the Examples

Visit these routes to see the architecture in action:

- `/examples/instruments` - Modern TanStack Query + Zustand example
- `/instruments` - Legacy pattern (for comparison)
- `/demo` - Original Supabase demo

### 3. Key Technologies

- **TanStack Query**: Handles all server data fetching, caching, and synchronization
- **Zustand**: Manages client-side UI state (sidebar, notifications, etc.)
- **TypeScript**: Full type safety with generated Supabase database types
- **Next.js App Router**: Server and client component patterns

## Development Workflow

### Adding a New Feature

1. **Create Query Functions** (if database access needed)
   ```bash
   mkdir app/queries/my-feature
   touch app/queries/my-feature/get-my-feature.ts
   touch app/queries/my-feature/use-my-feature.ts
   ```

2. **Create Zustand Store** (if client state needed)
   ```bash
   touch stores/my-feature-store.ts
   # Don't forget to export in stores/index.ts
   ```

3. **Implement Components**
   - Server Components for initial data fetching
   - Client Components for interactivity

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

### 1. Server Component with Prefetching

```typescript
// app/my-feature/page.tsx
import { HydrationBoundary, dehydrate } from '@tanstack/react-query'
import { createTypedServerClient } from '@/lib/supabase/typed-clients'
import { getMyFeatureData } from '@/app/queries/my-feature/get-my-feature'
import { createQueryClient } from '@/lib/query-client'
import { MyFeatureClient } from './my-feature-client'

export default async function MyFeaturePage() {
  const queryClient = createQueryClient()
  const supabase = await createTypedServerClient()

  await queryClient.prefetchQuery({
    queryKey: ['my-feature'],
    queryFn: () => getMyFeatureData(supabase),
  })

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <MyFeatureClient />
    </HydrationBoundary>
  )
}
```

### 2. Client Component with Hooks

```typescript
// app/my-feature/my-feature-client.tsx
'use client'

import { useMyFeature } from '@/app/queries/my-feature/use-my-feature'
import { useNotificationStore } from '@/stores'

export function MyFeatureClient() {
  const { data, isLoading, error } = useMyFeature()
  const addNotification = useNotificationStore((state) => state.addNotification)

  if (isLoading) return <div>Loading...</div>

  if (error) {
    addNotification({
      type: 'error',
      title: 'Failed to load data',
      message: error.message,
    })
    return <div>Error occurred</div>
  }

  return <div>{/* Your UI here */}</div>
}
```

### 3. Zustand Store

```typescript
// stores/my-feature-store.ts
import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

interface MyFeatureState {
  isExpanded: boolean
  selectedId: string | null
  setExpanded: (expanded: boolean) => void
  setSelectedId: (id: string | null) => void
}

export const useMyFeatureStore = create<MyFeatureState>()(
  devtools(
    (set) => ({
      isExpanded: false,
      selectedId: null,
      setExpanded: (expanded) => set({ isExpanded: expanded }),
      setSelectedId: (id) => set({ selectedId: id }),
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