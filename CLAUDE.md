# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ValidAI is a Next.js application with Supabase backend integration, built as a starter template for authentication and database operations. The project uses the App Router architecture with TypeScript and Tailwind CSS.

**Note**: During MVP phase, Payload CMS is integrated for content management. This is a temporary solution that will be extracted to a separate microservice. All new application features must follow Supabase best practices.

## 🚨 CRITICAL: Supabase Platform Best Practices

**ValidAI uses Supabase as a complete Backend-as-a-Service (BaaS) platform, NOT just a database.**

Read the Supabase Architecture Guide first: https://supabase.com/docs/guides/getting-started/architecture

### Platform Capabilities We MUST Use

Supabase provides these features out-of-the-box that you MUST use instead of building custom solutions:

1. **PostgREST** - Automatic REST API from your database schema
2. **Database Functions** - SQL/plpgsql functions for complex business logic
3. **Row Level Security (RLS)** - Authorization at the database level
4. **Edge Functions** - Deno-based serverless functions for service-role operations
5. **Real-time Subscriptions** - WebSocket connections for live data
6. **Authentication** - Built-in auth with JWT and user management
7. **Storage** - File uploads and serving with RLS policies

### ✅ DO - ALWAYS

1. **Use PostgREST directly** for all database operations
   - Simple CRUD: Direct table queries via `supabase.from('table')`
   - Complex queries: Database functions via `supabase.rpc('function_name')`

2. **Create database functions** (not API routes) when you need:
   - Multi-table operations in a single transaction
   - Complex business logic that belongs near the data
   - Computed aggregations or analytics
   - Return type: ALWAYS use `RETURNS TABLE` format, not JSON

3. **Use Edge Functions ONLY** when you need:
   - Service-role operations (JWT metadata updates, admin operations)
   - External API integrations (payment processors, email services)
   - File processing or transformations
   - Operations that MUST bypass RLS with proper validation

4. **Leverage RLS policies** for all authorization
   - Let the database handle data access control
   - Use `auth.uid()` and `auth.jwt()` in policies

5. **Use real-time subscriptions** for live data
   - Replace polling with `supabase.channel().on('postgres_changes')`

### ❌ DON'T - NEVER

1. **NEVER create Next.js API routes** for:
   - Database CRUD operations (use PostgREST)
   - Simple data fetching (use PostgREST)
   - Complex queries (use database functions)
   - Authorization logic (use RLS policies)

2. **NEVER use Edge Functions** for:
   - Simple database queries (use PostgREST)
   - Operations that RLS can handle (use RLS policies)
   - Client-accessible CRUD (use PostgREST with RLS)

3. **NEVER build custom solutions** for:
   - Authentication (use Supabase Auth)
   - File uploads (use Supabase Storage)
   - Real-time updates (use Supabase Realtime)
   - API generation (use PostgREST)

### Decision Tree for Data Operations

```
Need to fetch/modify data?
├─ Simple CRUD on single table?
│  └─ ✅ Use PostgREST directly: supabase.from('table')
│
├─ Complex query with joins/aggregations?
│  └─ ✅ Create database function: supabase.rpc('function_name')
│
├─ Need service-role permissions?
│  └─ ✅ Create Edge Function: supabase.functions.invoke('function-name')
│
└─ Need real-time updates?
   └─ ✅ Use subscriptions: supabase.channel().on('postgres_changes')
```

### Exceptions (The ONLY Times to Create API Routes)

1. **Authentication callback routes** (OAuth flows, email confirmations)
2. **Admin-only migration tools** (one-time data migrations)
3. **Third-party webhooks** that require specific Next.js middleware
4. **Payload CMS routes** (temporary MVP solution at `/api/*` - will be extracted)

**⚠️ IMPORTANT**: Payload CMS uses traditional API routes as a temporary MVP solution. This is the ONLY exception to our PostgREST-first approach. Never use CMS patterns for new application features.

If you're about to create an API route, STOP and ask:
- Can PostgREST handle this? (90% yes)
- Can a database function handle this? (9% yes)
- Can an Edge Function handle this? (0.9% yes)
- Is this Payload CMS content management? (0.09% temporary exception)
- Is this truly an exception? (0.01% maybe)

## Payload CMS Integration (MVP Phase Only)

**🚨 CRITICAL**: This is a temporary MVP solution. All new application features MUST follow Supabase best practices above.

### CMS Architecture Overview
- **Purpose**: Content management during MVP phase only
- **Extraction Plan**: Will be moved to separate microservice post-MVP
- **Schema**: Uses separate `payload` schema in same Supabase database
- **Routes**: Uses traditional API routes at `/api/*` (exception to our rules)

### Route Group Separation
```
app/
├── (app)/          # Main application - FOLLOWS Supabase patterns
├── (payload)/      # CMS routes - Exception using traditional APIs
└── (public)/       # Public content consumption
```

### CMS vs App Development Patterns

| Aspect | Application (Follow This) | CMS (Don't Copy This) |
|--------|---------------------------|----------------------|
| **Data Access** | PostgREST via `supabase.from()` | Traditional API routes |
| **Authentication** | Supabase Auth + RLS | Payload Auth system |
| **Database** | `public` schema + RLS | `payload` schema |
| **API Pattern** | Direct client queries | REST endpoints |
| **Real-time** | Supabase subscriptions | Not implemented |

### Critical Rules for CMS

1. **NEVER mix patterns**: Don't use CMS API patterns in app development
2. **NEVER bypass Supabase**: Always use PostgREST for new app features
3. **Content consumption**: Fetch CMS content via `/api/pages` etc. in app
4. **Schema separation**: CMS data stays in `payload` schema
5. **Temporary solution**: This will be extracted post-MVP

### When to Use Each System

- **Use CMS**: Only for content management (admin at `/admin`)
- **Use App patterns**: For ALL new application features
- **Content display**: App fetches CMS content via API for public display

### Documentation
- Full CMS architecture: `docs/architecture/cms-architecture.md`
- CMS admin interface: `http://localhost:3000/admin`

## Development Commands

```bash
cd validai-app
npm run dev          # Start development server with Turbopack
npm run build        # Build production version
npm run start        # Start production server
npm run lint         # Run ESLint checks
npm run typecheck    # Run TypeScript checks
```

### Testing Commands
```bash
npm run test         # Run unit tests with Vitest
npm run test:watch   # Run tests in watch mode
npm run test:coverage # Run tests with coverage report
# npm run test:e2e     # Run E2E tests with Playwright (prepared for future use)
npm run test:all     # Run all tests (currently unit tests only)
```

### Code Quality
```bash
npm run format       # Format code with Prettier
npm run lint:fix     # Fix ESLint issues automatically
```

## Architecture

### Project Structure
- **App Router**: Uses Next.js 15 App Router pattern with route groups
- **Route Groups**: `(app)` for main app, `(payload)` for CMS, `(public)` for content
- **Authentication**: Cookie-based auth via Supabase middleware (app routes only)
- **Database**: Supabase PostgreSQL with schema separation (`public` vs `payload`)
- **State Management**: TanStack Query + Zustand architecture
- **UI Components**: shadcn/ui with Radix primitives
- **Styling**: Tailwind CSS with theme support
- **Testing**: Vitest + React Testing Library + Playwright
- **Quality**: ESLint + Prettier + Husky hooks + GitHub Actions

### Key Files
- `middleware.ts`: Handles session management for `/dashboard/*` routes only
- `lib/supabase/`: Contains server, client, and middleware configurations
- `app/(app)/`: Main application routes using Supabase patterns
- `app/(payload)/`: CMS admin and API routes (temporary)
- `app/(public)/`: Public content display routes
- `app/queries/`: Database query functions and TanStack Query hooks
- `stores/`: Zustand state stores (ALL stores must be here)
- `components/`: Reusable UI components and forms
- `payload.config.ts`: Payload CMS configuration (temporary)
- `__tests__/`: Unit and integration tests
- `e2e/`: End-to-end tests with Playwright (prepared for future use)
- `/docs/`: Comprehensive architecture and quality documentation

### Supabase Integration
- **MCP Server**: Configured with project ref `xczippkxxdqlvaacjexj`
- **Client Types**:
  - `lib/supabase/server.ts`: Server-side client (RSC, Route Handlers)
  - `lib/supabase/client.ts`: Client-side operations
  - `lib/supabase/typed-clients.ts`: TypeScript-enhanced clients
  - `lib/supabase/middleware.ts`: Session refresh logic
- **Generated Types**: `lib/database.types.ts` (auto-generated from schema)
- **JWT Metadata**: Contains user identity and current organization details in `app_metadata`

### Environment Variables
Required in `.env.local`:
```bash
# Supabase (Application)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=

# Payload CMS (Temporary MVP)
PAYLOAD_SECRET=
PAYLOAD_DATABASE_URI=
```

### Database Schema
- **public schema**: App tables (todos, profiles, etc.) - Use PostgREST
- **payload schema**: CMS tables (users, pages, media) - Temporary MVP only

### Path Aliases
- `@/*`: Maps to project root (configured in tsconfig.json)

## State Management & Data Fetching

### Modern Architecture (Recommended)
- **TanStack Query**: All database operations, caching, background refetching
- **Zustand**: Client-side UI state and notifications (ALL stores in `/stores`)
- **TypedSupabaseClient**: Generated types for all Supabase operations

### Query Patterns
- Direct PostgREST queries in hooks: `supabase.from('table').select()`
- Database function calls: `supabase.rpc('function_name', params)`
- Edge Function invocations: `supabase.functions.invoke('name', { body })`
- NO separate get-*.ts files needed for PostgREST operations
- Server-side prefetching with HydrationBoundary

### Store Management Rules
- **ALWAYS** create Zustand stores in the `stores/` directory
- **NEVER** create stores inside components, hooks, or other directories
- **ALWAYS** use devtools middleware for debugging
- **ALWAYS** export stores through `stores/index.ts`

### Example Routes
- `/demo` - Original Supabase demo

## Quality Standards

### Testing Requirements
- Write tests for all new components and features
- Maintain 80%+ code coverage
- Use React Testing Library for component tests
- Add E2E tests for critical user journeys (framework prepared for future use)

### Code Quality
- ESLint must pass (auto-fixed on commit)
- Code formatted with Prettier (auto-formatted on commit)
- TypeScript strict mode enforced
- Conventional commit messages required

### Development Workflow
- Pre-commit hooks automatically run linting and formatting
- CI pipeline runs all tests on pull requests
- All PRs require code review and passing tests

## Important Notes

- **Authentication**: Never modify middleware.ts, auth routes, or session management
- **Data Fetching**: Use PostgREST/RPC for all database operations, Edge Functions for service-role operations, TanStack Query for caching
- **Type Safety**: Always use TypedSupabaseClient for database operations
- **Testing**: Write tests before or alongside feature development
- **Quality**: All code must pass automated quality checks

### 🚨 CRITICAL CMS vs App Development

- **CMS is temporary**: Payload CMS will be extracted to microservice post-MVP
- **Never mix patterns**: Don't use CMS API patterns (`/api/*`) for new app features
- **Always use Supabase**: For ALL new application functionality, follow PostgREST patterns
- **Content consumption**: App can fetch CMS content, but use app patterns for everything else
- **Schema boundaries**: App uses `public` schema, CMS uses `payload` schema - never mix

## Quick Reference

### Architecture Documentation
- `/docs/architecture/` - Technical architecture decisions
- `/docs/guides/` - Step-by-step implementation guides
- `/docs/examples/` - Code patterns and examples

### Quality Documentation
- `/docs/quality/quick-start.md` - 5-minute setup guide
- `/docs/quality/testing-guide.md` - How to write and run tests
- `/docs/quality/code-standards.md` - Coding conventions and best practices