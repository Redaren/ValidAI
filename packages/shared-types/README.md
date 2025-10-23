# @playze/shared-types

TypeScript types for Playze Core platform, auto-generated from Supabase database schema.

## Installation

This package is internal to the monorepo. Add to your app's `package.json`:

```json
{
  "dependencies": {
    "@playze/shared-types": "workspace:*"
  }
}
```

## Usage

```typescript
import { Organization, UserOrganization, TypedSupabaseClient } from '@playze/shared-types'

// Use type-safe types in your code
const org: Organization = { ... }

// Typed Supabase client
const supabase: TypedSupabaseClient = createClient(...)
```

## Regenerating Types

After applying new database migrations:

```bash
pnpm --filter @playze/shared-types gen:types
pnpm --filter @playze/shared-types build
```

## Type Categories

- **Database types** (`database.types.ts`): Auto-generated from Supabase
- **Shortcuts** (`shortcuts.ts`): Convenient aliases for common types
- **Helpers** (`helpers.ts`): Utility types for advanced patterns
- **Platform types** (`platform.types.ts`): Custom business logic types
