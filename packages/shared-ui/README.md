# @playze/shared-ui

Shared UI components for Playze Core platform. Built on [shadcn/ui](https://ui.shadcn.com) with Radix UI primitives and Tailwind CSS.

## Installation

```json
{
  "dependencies": {
    "@playze/shared-ui": "workspace:*"
  }
}
```

## Components

### UI Primitives (shadcn/ui)

Pre-built, accessible components based on Radix UI:

- **Alert** - Display important messages and notifications
- **Avatar** - User profile images with fallback
- **Badge** - Status indicators and labels
- **Button** - Interactive buttons with variants
- **Card** - Content containers with header/footer
- **Checkbox** - Form checkboxes with labels
- **Dialog** - Modal dialogs and popups
- **DropdownMenu** - Contextual menus with actions
- **Input** - Text input fields
- **Label** - Form labels
- **Select** - Dropdown select menus
- **Switch** - Toggle switches
- **Table** - Data tables (basic)
- **Tabs** - Tabbed interfaces
- **Textarea** - Multi-line text inputs

### Data Components

Advanced components for data display:

- **DataTable** - Full-featured data table with:
  - Search/filtering
  - Column sorting
  - Pagination
  - Column visibility toggle
  - Row selection
  - Built on TanStack React Table

### Platform Components

Playze Core-specific components for multi-tenancy and app navigation:

- **AppSwitcher** - Navigate between apps in the Playze ecosystem
- **OrgSwitcher** - Switch between user's organizations
- **FeatureGate** - Conditionally render features based on subscription tier

## Usage Examples

### Basic UI Components

```typescript
import { Button, Card, Input, Badge } from '@playze/shared-ui'

export function UserProfile() {
  return (
    <Card className="p-6">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">Profile</h2>
          <Badge variant="success">Active</Badge>
        </div>

        <Input placeholder="Enter your name" />

        <Button>Save Changes</Button>
      </div>
    </Card>
  )
}
```

### Platform Components

```typescript
import { AppSwitcher, OrgSwitcher, FeatureGate } from '@playze/shared-ui'
import { Button } from '@playze/shared-ui'

export function AppHeader() {
  return (
    <header className="flex items-center justify-between p-4">
      <h1>RoadCloud</h1>

      <div className="flex items-center gap-3">
        {/* Switch between user's organizations */}
        <OrgSwitcher />

        {/* Navigate to other apps */}
        <AppSwitcher currentApp="roadcloud" />
      </div>
    </header>
  )
}

export function PremiumFeature() {
  return (
    <FeatureGate appId="roadcloud" feature="export_reports">
      {/* Only shown if org has access to export_reports feature */}
      <Button>Export to PDF</Button>
    </FeatureGate>
  )
}
```

### DataTable Component

```typescript
import { DataTable, type ColumnDef } from '@playze/shared-ui'

interface User {
  id: string
  name: string
  email: string
  role: string
}

const columns: ColumnDef<User>[] = [
  {
    accessorKey: 'name',
    header: 'Name',
  },
  {
    accessorKey: 'email',
    header: 'Email',
  },
  {
    accessorKey: 'role',
    header: 'Role',
    cell: ({ row }) => (
      <span className="capitalize">{row.getValue('role')}</span>
    ),
  },
]

export function UsersTable({ users }: { users: User[] }) {
  return (
    <DataTable
      columns={columns}
      data={users}
      searchKey="name"
      searchPlaceholder="Search by name..."
      pageSize={20}
    />
  )
}
```

## TypeScript Exports

The package also exports useful TypeScript types:

```typescript
import type { ColumnDef, Row, Cell } from '@playze/shared-ui'

// Use for defining DataTable columns
const columns: ColumnDef<MyDataType>[] = [...]
```

## Utilities

```typescript
import { cn } from '@playze/shared-ui'

// Utility for merging Tailwind classes
<div className={cn('base-class', conditional && 'conditional-class')} />
```

## Styling

This package uses **Tailwind CSS** with CSS variables for theming.

### App Setup

Apps must configure Tailwind to use the shared UI components:

**1. Install Tailwind CSS:**

```bash
pnpm add -D tailwindcss postcss autoprefixer
```

**2. Extend shared config in `tailwind.config.ts`:**

```typescript
import type { Config } from 'tailwindcss'
import sharedConfig from '@playze/shared-config/tailwind'

const config: Config = {
  ...sharedConfig,
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    // Include shared-ui components
    '../../packages/shared-ui/src/**/*.{ts,tsx}',
  ],
}

export default config
```

**3. Import Tailwind in your CSS:**

```css
/* app/globals.css */
@tailwind base;
@tailwind components;
@tailwind utilities;
```

## Theme Support

Components support light and dark themes via CSS variables. Apps should configure theme switching in their root layout.

## Dependencies

### Peer Dependencies

Apps using `@playze/shared-ui` must have:

- `react` >= 19.0.0
- `next` >= 15.0.0
- `tailwindcss` >= 3.4.0

### Included Dependencies

The package includes:

- `@radix-ui/*` - Accessible UI primitives
- `@tanstack/react-table` - Table state management
- `lucide-react` - Icon library
- `class-variance-authority` - Variant styling
- `clsx` + `tailwind-merge` - Class utilities

## Component Documentation

For detailed component props and usage, see:

- [shadcn/ui docs](https://ui.shadcn.com/docs/components) - UI primitives reference
- [TanStack Table docs](https://tanstack.com/table/latest) - DataTable advanced usage
- [Radix UI docs](https://www.radix-ui.com/primitives) - Low-level primitive docs

## Architecture Notes

### Why Shared UI?

- ✅ **Consistency** - All apps use the same components and styling
- ✅ **Accessibility** - Built on Radix UI with WAI-ARIA compliance
- ✅ **Maintainability** - Update components once, affects all apps
- ✅ **Type Safety** - Full TypeScript support across the platform

### When to Add Components

**DO add to shared-ui:**
- UI primitives used by multiple apps
- Platform-wide patterns (AppSwitcher, OrgSwitcher)
- Reusable data display components (DataTable)

**DON'T add to shared-ui:**
- App-specific business logic components
- Domain-specific forms (keep in app)
- One-off custom components

### Import Patterns

```typescript
// ✅ CORRECT: Import from @playze/shared-ui
import { Button, Card } from '@playze/shared-ui'

// ❌ WRONG: Never import from component files directly
import { Button } from '@playze/shared-ui/src/components/ui/button'

// ❌ WRONG: Don't duplicate UI components in apps
import { Button } from '@/components/ui/button'
```

## Contributing

To add new components:

1. Add component to `src/components/ui/` (primitives) or `src/components/platform/` (Playze-specific)
2. Export from `src/index.ts`
3. Rebuild package: `pnpm --filter @playze/shared-ui build`
4. Update this README with component documentation
5. Test in at least one app (TestApp or Admin Portal)
