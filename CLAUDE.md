# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ValidAI is a Next.js application with Supabase backend integration, built as a starter template for authentication and database operations. The project uses the App Router architecture with TypeScript and Tailwind CSS.

## Development Commands

```bash
cd validai-app
npm run dev          # Start development server with Turbopack
npm run build        # Build production version
npm run start        # Start production server
npm run lint         # Run ESLint checks
```

Note: No test suite is currently configured. TypeScript checking can be done with `npx tsc --noEmit`.

## Architecture

### Project Structure
- **App Router**: Uses Next.js 15 App Router pattern
- **Authentication**: Cookie-based auth via Supabase middleware
- **Database**: Supabase PostgreSQL with MCP server integration
- **State Management**: TanStack Query + Zustand architecture
- **UI Components**: shadcn/ui ONLY (do not use other component libraries)
- **Styling**: Tailwind CSS with theme support

### Key Files
- `middleware.ts`: Handles session management across all routes
- `lib/supabase/`: Contains server, client, and middleware configurations
- `app/protected/`: Routes requiring authentication
- `app/queries/`: Database query functions and TanStack Query hooks
- `stores/`: Zustand state stores (ALL stores must be here)
- `components/`: Reusable UI components and forms
- `/docs/`: Comprehensive architecture documentation

### Supabase Integration
- **MCP Server**: Configured with project ref `xczippkxxdqlvaacjexj`
- **Client Types**:
  - `lib/supabase/server.ts`: Server-side client (RSC, Route Handlers)
  - `lib/supabase/client.ts`: Client-side operations
  - `lib/supabase/typed-clients.ts`: TypeScript-enhanced clients
  - `lib/supabase/middleware.ts`: Session refresh logic
- **Generated Types**: `lib/database.types.ts` (auto-generated from schema)

### Environment Variables
Required in `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY=
```

### Database Schema
- **instruments**: Custom table for financial instruments
- **todos**: Demo table for basic CRUD operations

### Path Aliases
- `@/*`: Maps to project root (configured in tsconfig.json)

## State Management & Data Fetching

### Modern Architecture (Recommended)
- **TanStack Query**: All database operations, caching, background refetching
- **Zustand**: Client-side UI state and notifications (ALL stores in `/stores`)
- **TypedSupabaseClient**: Generated types for all Supabase operations

### Query Patterns
- Reusable query functions in `app/queries/[table]/get-[table].ts`
- Custom hooks in `app/queries/[table]/use-[table].ts`
- Server-side prefetching with HydrationBoundary

### Store Management Rules
- **ALWAYS** create Zustand stores in the `stores/` directory
- **NEVER** create stores inside components, hooks, or other directories
- **ALWAYS** use devtools middleware for debugging
- **ALWAYS** export stores through `stores/index.ts`

### Example Routes
- `/examples/instruments` - Modern TanStack Query + Zustand example
- `/instruments` - Legacy pattern (for comparison)
- `/demo` - Original Supabase demo

## Important Notes

- **Authentication**: Never modify middleware.ts, auth routes, or session management
- **Data Fetching**: Use TanStack Query for all server data, Zustand for UI state
- **Type Safety**: Always use TypedSupabaseClient for database operations
- **UI Components**: ONLY use shadcn/ui components - do not install or use other component libraries
- **Documentation**: Comprehensive guides available in `/docs` directory
- Protected routes use layout-based authentication checks
- Theme switching supported via next-themes

## Quick Reference

For detailed documentation on architecture patterns, see:
- `/docs/architecture/` - Technical architecture decisions
- `/docs/guides/` - Step-by-step implementation guides
- `/docs/examples/` - Code patterns and examples