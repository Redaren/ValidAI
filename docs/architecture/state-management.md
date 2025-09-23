# State Management Architecture

## Overview

ValidAI uses Zustand for client-side state management with a strict organizational structure to ensure maintainability and debuggability.

## Core Principles

### 1. Centralized Store Location
- **ALL** Zustand stores MUST be located in the `stores/` directory
- **NEVER** create stores inside components, hooks, or other directories
- Each store should have a single responsibility

### 2. Store Structure

```typescript
import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

interface StoreState {
  // State properties
  someValue: string

  // Actions
  setSomeValue: (value: string) => void
}

export const useMyStore = create<StoreState>()(
  devtools(
    (set) => ({
      // Initial state
      someValue: '',

      // Actions
      setSomeValue: (value) => set({ someValue: value }),
    }),
    { name: 'my-store' } // Required for DevTools
  )
)
```

### 3. Export Pattern

All stores must be exported through `stores/index.ts`:

```typescript
export { useUiStore } from './ui-store'
export { useNotificationStore } from './notification-store'
export { useMyStore } from './my-store'
```

## Store Types

### UI State Store (`ui-store.ts`)
Manages global UI state that needs to persist across component unmounts:
- Sidebar open/closed state
- Theme preferences
- Modal visibility
- Layout preferences

### Notification Store (`notification-store.ts`)
Manages application notifications:
- Toast messages
- Error notifications
- Success confirmations
- System alerts

### Feature-Specific Stores
For complex features that require state management:
- User preferences
- Shopping cart state
- Form state (for multi-step forms)
- Real-time data subscriptions

## Best Practices

### 1. State Organization
- Keep stores focused on a single domain
- Avoid storing server state (use TanStack Query instead)
- Use TypeScript interfaces for all state shapes

### 2. Actions
- Always use the `set` function from Zustand
- Prefer granular updates over replacing entire state
- Keep actions simple and pure

### 3. DevTools Integration
- Always use the `devtools` middleware
- Provide meaningful names for DevTools
- Use in development only (automatically excluded in production)

### 4. Performance
- Use selectors to prevent unnecessary re-renders:

```typescript
// Good: Only re-renders when sidebarOpen changes
const sidebarOpen = useUiStore((state) => state.sidebarOpen)

// Avoid: Re-renders on any state change
const { sidebarOpen } = useUiStore()
```

## Integration with TanStack Query

Zustand should NOT store server state. Instead:
- Use TanStack Query for all server data
- Use Zustand for UI state and client-side interactions
- Use Zustand to trigger TanStack Query invalidations

Example:
```typescript
// In a Zustand store
const refreshData = useQueryClient()

const updateLocalState = (newValue: string) => {
  set({ localValue: newValue })
  // Trigger server data refresh
  refreshData.invalidateQueries(['some-key'])
}
```

## Store Guidelines

### ✅ DO
- Create stores in `stores/` directory only
- Use TypeScript interfaces
- Export through `stores/index.ts`
- Use devtools middleware
- Keep stores focused on single responsibility
- Use selectors for performance

### ❌ DON'T
- Create stores outside `stores/` directory
- Store server state in Zustand
- Create circular dependencies between stores
- Forget to export new stores
- Skip DevTools integration