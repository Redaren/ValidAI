# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ValidAI is a Next.js application with Supabase backend integration, built as a starter template for authentication and database operations. The project uses the App Router architecture with TypeScript and Tailwind CSS.

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

If you're about to create an API route, STOP and ask:
- Can PostgREST handle this? (90% yes)
- Can a database function handle this? (9% yes)
- Can an Edge Function handle this? (0.9% yes)
- Is this truly an exception? (0.1% maybe)

## Development Commands

**Note:** ValidAI is now part of a monorepo structure using pnpm + Turborepo (Phase 1 complete).

### From Root (Recommended - Turborepo)
```bash
# Start ValidAI dev server
pnpm dev --filter=@playze/validai

# Build ValidAI
pnpm build --filter=@playze/validai

# Run all tasks across workspace
pnpm dev              # All apps in parallel
pnpm build            # Build all apps
pnpm lint             # Lint all apps
pnpm typecheck        # Type check all apps
pnpm test             # Test all apps
```

### From ValidAI Directory (Direct)
```bash
cd apps/validai
pnpm dev             # Start development server with Turbopack
pnpm build           # Build production version
pnpm start           # Start production server
pnpm lint            # Run ESLint checks
pnpm typecheck       # Run TypeScript checks
```

### Testing Commands
```bash
cd apps/validai
pnpm test            # Run unit tests with Vitest
pnpm test:watch      # Run tests in watch mode
pnpm test:coverage   # Run tests with coverage report
# pnpm test:e2e      # Run E2E tests with Playwright (prepared for future use)
pnpm test:all        # Run all tests (currently unit tests only)
```

### Code Quality
```bash
cd apps/validai
pnpm format          # Format code with Prettier
pnpm lint:fix        # Fix ESLint issues automatically
```

### Supabase Commands (From Root)
```bash
# Supabase is at root level (shared across apps)
npx supabase db push              # Push migrations to remote
npx supabase gen types typescript # Generate TypeScript types
npx supabase functions deploy     # Deploy Edge Functions
```

## Architecture

### Monorepo Structure (Phase 1 Complete)
ValidAI is structured as a monorepo using pnpm workspaces + Turborepo:
- **Root**: `package.json`, `pnpm-workspace.yaml`, `turbo.json`
- **apps/validai/**: ValidAI Next.js application (`@playze/validai`)
- **packages/**: Shared packages (prepared for Phase 2)
- **supabase/**: Database migrations, Edge Functions (shared across apps)

### ValidAI App Structure
- **App Router**: Uses Next.js 15 App Router pattern
- **Authentication**: Cookie-based auth via Supabase middleware
- **Database**: Supabase PostgreSQL with MCP server integration
- **State Management**: TanStack Query + Zustand architecture
- **UI Components**: shadcn/ui with Radix primitives
- **Styling**: Tailwind CSS with theme support
- **Testing**: Vitest + React Testing Library + Playwright
- **Quality**: ESLint + Prettier + Husky hooks + GitHub Actions

### Key Files (in apps/validai/)
- `middleware.ts`: Handles session management across all routes
- `lib/supabase/`: Contains server, client, and middleware configurations
- `app/protected/`: Routes requiring authentication
- `app/queries/`: Database query functions and TanStack Query hooks
- `stores/`: Zustand state stores (ALL stores must be here)
- `components/`: Reusable UI components and forms
- `__tests__/`: Unit and integration tests
- `e2e/`: End-to-end tests with Playwright (prepared for future use)
- `/docs/`: Comprehensive architecture and quality documentation

### Supabase Integration
- **MCP Server**: Configured with project ref `xczippkxxdqlvaacjexj`
- **Location**: Root level (`/supabase/`) - shared across all apps
- **Client Types** (in `apps/validai/lib/supabase/`):
  - `server.ts`: Server-side client (RSC, Route Handlers)
  - `client.ts`: Client-side operations
  - `typed-clients.ts`: TypeScript-enhanced clients
  - `middleware.ts`: Session refresh logic
- **Generated Types**: `apps/validai/lib/database.types.ts` (auto-generated from schema)
- **JWT Metadata**: Contains user identity and current organization details in `app_metadata`
- **Database Tables**: All ValidAI tables use `validai_` prefix (Phase 1)

### Environment Variables
Required in `apps/validai/.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY=
```

### Database Schema (Phase 1 - All tables prefixed)
- **validai_documents**: Document management
- **validai_processors**: AI processor configurations
- **validai_operations**: Processor operations
- **validai_runs**: Processor execution runs
- **validai_operation_results**: Operation execution results
- **validai_workbench_executions**: Workbench test executions
- **validai_llm_global_settings**: LLM configuration
- **validai_organizations**: Organizations (ValidAI-specific)
- **validai_organization_members**: Organization membership
- **validai_profiles**: User profiles

### Path Aliases
- `@/*`: Maps to `apps/validai/` root (configured in tsconfig.json)

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

### Validation Schema Management Rules
- **ALWAYS** create Zod validation schemas in the `lib/validations/` directory
- **NEVER** define validation schemas inline in components or hooks
- **ALWAYS** use common schemas from `common-schemas.ts` for reusable primitives (names, descriptions, tags, UUIDs)
- **ALWAYS** create feature-specific schema files (e.g., `processor-schemas.ts`, `operation-schemas.ts`)
- **ALWAYS** export schemas through `lib/validations/index.ts` for centralized imports
- **ALWAYS** include JSDoc comments explaining what each schema validates and where it's used
- **ALWAYS** export inferred TypeScript types alongside schemas (e.g., `export type CreateProcessorInput = z.infer<typeof createProcessorSchema>`)

### Form Management Rules
- **ALWAYS** use React Hook Form for forms with 3+ fields or complex validation
- **ALWAYS** integrate with Zod schemas using `@hookform/resolvers/zod` (via `zodResolver`)
- **NEVER** manually manage form state with `useState` for multi-field forms
- Simple single-field inputs (search bars, filters) don't require React Hook Form

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

## Quick Reference

### Architecture Documentation
- `/docs/architecture/` - Technical architecture decisions
- `/docs/guides/` - Step-by-step implementation guides
- `/docs/examples/` - Code patterns and examples

### Quality Documentation
- `/docs/quality/quick-start.md` - 5-minute setup guide
- `/docs/quality/testing-guide.md` - How to write and run tests
- `/docs/quality/code-standards.md` - Coding conventions and best practices