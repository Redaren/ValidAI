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
npm run typecheck    # Run TypeScript checks
```

### Testing Commands
```bash
npm run test         # Run unit tests with Vitest
npm run test:watch   # Run tests in watch mode
npm run test:coverage # Run tests with coverage report
npm run test:e2e     # Run E2E tests with Playwright
npm run test:all     # Run all tests (unit + E2E)
```

### Code Quality
```bash
npm run format       # Format code with Prettier
npm run lint:fix     # Fix ESLint issues automatically
```

## Architecture

### Project Structure
- **App Router**: Uses Next.js 15 App Router pattern
- **Authentication**: Cookie-based auth via Supabase middleware
- **Database**: Supabase PostgreSQL with MCP server integration
- **State Management**: TanStack Query + Zustand architecture
- **UI Components**: shadcn/ui with Radix primitives
- **Styling**: Tailwind CSS with theme support
- **Testing**: Vitest + React Testing Library + Playwright
- **Quality**: ESLint + Prettier + Husky hooks + GitHub Actions

### Key Files
- `middleware.ts`: Handles session management across all routes
- `lib/supabase/`: Contains server, client, and middleware configurations
- `app/protected/`: Routes requiring authentication
- `app/queries/`: Database query functions and TanStack Query hooks
- `stores/`: Zustand state stores (ALL stores must be here)
- `components/`: Reusable UI components and forms
- `__tests__/`: Unit and integration tests
- `e2e/`: End-to-end tests with Playwright
- `/docs/`: Comprehensive architecture and quality documentation

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

## Quality Standards

### Testing Requirements
- Write tests for all new components and features
- Maintain 80%+ code coverage
- Use React Testing Library for component tests
- Add E2E tests for critical user journeys

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
- **Data Fetching**: Use TanStack Query for all server data, Zustand for UI state
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