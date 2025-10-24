# ValidAI Documentation

This directory contains comprehensive documentation for the ValidAI project's modern architecture implementation.

## Documentation Structure

### Architecture
- [State Management](./architecture/state-management.md) - Zustand store patterns and best practices
- [Data Fetching](./architecture/data-fetching.md) - TanStack Query implementation and patterns
- [Component Patterns](./architecture/component-patterns.md) - Server/Client component separation

### Guides
- [Getting Started](./guides/getting-started.md) - Quick start guide for new developers
- [Adding Queries](./guides/adding-queries.md) - How to add new database queries
- [Creating Stores](./guides/creating-stores.md) - How to create and manage Zustand stores

### Examples
- [Basic Queries](./examples/basic-queries.md) - Simple query patterns
- [Server Components](./examples/server-components.md) - Server-side data fetching patterns
- [Client Components](./examples/client-components.md) - Client-side interaction patterns

## Quick Reference

### Key Technologies
- **TanStack Query**: Data fetching, caching, synchronization
- **Zustand**: Client-side state management
- **TypeScript**: Full type safety with generated Supabase types
- **Next.js App Router**: Server and client component patterns

### Important Directories
- `stores/` - All Zustand stores (REQUIRED location)
- `app/queries/` - Database query functions and hooks
- `app/examples/` - Modern architecture examples
- `lib/supabase/` - Database client utilities

### Getting Help
For questions about the architecture or implementation patterns, refer to the specific documentation files above or check the example implementations in `app/examples/`.