# ValidAI Authorization Examples

**Phase 4 Task 6 - Authorization Framework Implementation**

This document demonstrates how to use the framework's authorization system in ValidAI components.

---

## Overview

ValidAI implements a **dual authorization model**:

1. **Tier-based features** (subscription model) - Features controlled by organization's subscription tier
2. **Role-based permissions** (user capability model) - Permissions controlled by user's role in the organization

**Benefits:**
- 🚀 ONE database query for all authorization checks
- ♻️ 5-minute cache via TanStack Query
- 🔒 Dual gating: tier + role
- 📦 Clean separation: framework provides hooks, apps use them

---

## ValidAI Subscription Tiers

| Tier | Features | Limits |
|------|----------|--------|
| **Free** | basic_processing, document_upload | 10 docs, 3 processors, 10 ops/processor |
| **Pro** | + export_reports, advanced_operations | 1000 docs, 50 processors, 50 ops/processor |
| **Enterprise** | + custom_models, priority_support | Unlimited |

## ValidAI Role Permissions

| Role | Permissions |
|------|-------------|
| **Owner** | Full access + member management |
| **Admin** | Full access (no member management) |
| **Member** | View, edit, execute (no delete/export) |
| **Viewer** | Read-only |

---

## Pattern 1: Using Authorization Hooks

### Primary Hook: `useAuthorization`

Returns complete authorization context in ONE query:

```typescript
import { useAuthorization } from '@playze/shared-auth'

function MyComponent() {
  const { data: auth, isLoading } = useAuthorization('validai')

  if (isLoading) return <div>Loading...</div>

  // Access all authorization data:
  auth.user_role           // 'owner' | 'admin' | 'member' | 'viewer'
  auth.tier_name           // 'free' | 'pro' | 'enterprise'
  auth.tier_features       // { export_reports: true, ... }
  auth.role_permissions    // { can_edit: true, can_delete: false, ... }
  auth.tier_limits         // { documents: 500, processors: 50, ... }
  auth.current_usage       // { documents: 125, processors: 12, ... }
}
```

### Convenience Hooks

All these hooks use `useAuthorization` internally (share same cache):

```typescript
import { useFeatureAccess, usePermission, useHasRole } from '@playze/shared-auth'

// Check tier-based feature
const { data: canExport } = useFeatureAccess('validai', 'export_reports')

// Check role-based permission
const { data: canEdit } = usePermission('validai', 'can_edit')

// Check user's role
const { data: isAdmin } = useHasRole('validai', ['owner', 'admin'])
```

---

## Pattern 2: Using AuthGate Component

### Tier-Based Feature Gate

```typescript
import { AuthGate } from '@playze/shared-ui'
import { Download } from 'lucide-react'
import { Button } from '@playze/shared-ui'

// Export button (Pro tier only)
function ExportButton() {
  return (
    <AuthGate appId="validai" feature="export_reports">
      <Button onClick={handleExport}>
        <Download className="h-4 w-4 mr-2" />
        Export Report
      </Button>
    </AuthGate>
  )
}
```

### Role-Based Permission Gate

```typescript
import { AuthGate } from '@playze/shared-ui'
import { Pencil, Trash2 } from 'lucide-react'
import { Button } from '@playze/shared-ui'

// Edit button (requires can_edit permission)
function EditButton() {
  return (
    <AuthGate appId="validai" permission="can_edit">
      <Button onClick={handleEdit}>
        <Pencil className="h-4 w-4 mr-2" />
        Edit
      </Button>
    </AuthGate>
  )
}

// Delete button (requires can_delete permission)
function DeleteButton() {
  return (
    <AuthGate appId="validai" permission="can_delete">
      <Button onClick={handleDelete} variant="destructive">
        <Trash2 className="h-4 w-4 mr-2" />
        Delete
      </Button>
    </AuthGate>
  )
}
```

### Role Requirement

```typescript
// Settings panel (Admin+ only)
function SettingsPanel() {
  return (
    <AuthGate appId="validai" role={['owner', 'admin']}>
      <SettingsContent />
    </AuthGate>
  )
}
```

### Combined Gating (Tier + Permission)

```typescript
// Advanced export (Pro tier + can_export permission)
function AdvancedExportDialog() {
  return (
    <AuthGate
      appId="validai"
      feature="export_reports"
      permission="can_export"
      requireAll={true}
    >
      <AdvancedExportContent />
    </AuthGate>
  )
}
```

### Custom Fallback

```typescript
import { AuthGate } from '@playze/shared-ui'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Button } from '@playze/shared-ui'

function AdvancedAIProcessor() {
  return (
    <AuthGate
      appId="validai"
      feature="advanced_operations"
      fallback={
        <Card>
          <CardHeader>
            <CardTitle>Advanced AI Processing</CardTitle>
            <CardDescription>Available in Pro plan</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Unlock advanced AI processing capabilities with custom models and priority support.
            </p>
            <Button onClick={() => window.location.href = 'mailto:support@example.com'}>
              Contact Sales
            </Button>
          </CardContent>
        </Card>
      }
    >
      <AdvancedAIContent />
    </AuthGate>
  )
}
```

---

## Pattern 3: Conditional Rendering

For complex conditional logic, use hooks directly:

```typescript
import { useAuthorization } from '@playze/shared-auth'
import { Button, Badge } from '@playze/shared-ui'

function ProcessorCard({ processor }) {
  const { data: auth } = useAuthorization('validai')

  // Complex logic combining tier and role
  const canModify = auth?.role_permissions?.can_edit && auth?.tier_features?.advanced_operations

  return (
    <div>
      <h3>{processor.name}</h3>

      {/* Show tier badge */}
      <Badge variant="secondary">{auth?.tier_display_name}</Badge>

      {/* Conditional rendering based on complex logic */}
      {canModify && (
        <Button onClick={handleEdit}>Edit with Advanced Tools</Button>
      )}

      {/* Tier-specific message */}
      {auth?.tier_name === 'free' && (
        <p className="text-sm text-muted-foreground">
          Upgrade to Pro to unlock advanced features
        </p>
      )}
    </div>
  )
}
```

---

## Real-World Examples

### Example 1: Operation Card (Edit/Delete Buttons)

**File:** `components/processors/operation-card.tsx`

```typescript
import { AuthGate } from '@playze/shared-ui'
import { Pencil, Trash2 } from 'lucide-react'
import { Button } from '@playze/shared-ui'

export function OperationCard({ operation, processorId }) {
  return (
    <div className="flex items-center gap-2">
      {/* ... operation details ... */}

      {/* Edit Button - Members can edit */}
      <AuthGate appId="validai" permission="can_edit">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsEditOpen(true)}
          title="Edit operation"
        >
          <Pencil className="h-4 w-4" />
        </Button>
      </AuthGate>

      {/* Delete Button - Only admins/owners can delete */}
      <AuthGate appId="validai" permission="can_delete">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsDeleteDialogOpen(true)}
          title="Delete operation"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </AuthGate>
    </div>
  )
}
```

### Example 2: Export Functionality

```typescript
import { AuthGate } from '@playze/shared-ui'
import { useFeatureAccess } from '@playze/shared-auth'
import { Download } from 'lucide-react'
import { Button } from '@playze/shared-ui'

export function RunResultsExport({ runId }) {
  // Option 1: Using AuthGate
  return (
    <AuthGate appId="validai" feature="export_reports">
      <Button onClick={() => handleExport(runId)}>
        <Download className="h-4 w-4 mr-2" />
        Export Results
      </Button>
    </AuthGate>
  )

  // Option 2: Using hook for custom logic
  const { data: canExport } = useFeatureAccess('validai', 'export_reports')

  if (!canExport) {
    return (
      <div>
        <p className="text-sm text-muted-foreground">
          Export available in Pro plan
        </p>
        <Button variant="secondary" onClick={() => window.open('mailto:support@example.com')}>
          Upgrade to Pro
        </Button>
      </div>
    )
  }

  return (
    <Button onClick={() => handleExport(runId)}>
      <Download className="h-4 w-4 mr-2" />
      Export Results
    </Button>
  )
}
```

### Example 3: Processor Run Button

```typescript
import { AuthGate } from '@playze/shared-ui'
import { Play } from 'lucide-react'
import { Button } from '@playze/shared-ui'

export function RunProcessorButton({ processorId, documentId }) {
  return (
    <AuthGate appId="validai" permission="can_execute">
      <Button onClick={() => handleRun(processorId, documentId)}>
        <Play className="h-4 w-4 mr-2" />
        Run Processor
      </Button>
    </AuthGate>
  )
}
```

### Example 4: Settings Page

```typescript
import { AuthGate } from '@playze/shared-ui'
import { useAuthorization } from '@playze/shared-auth'

export default function SettingsPage() {
  const { data: auth } = useAuthorization('validai')

  return (
    <div>
      <h1>Settings</h1>

      {/* Show user's role */}
      <p>Your role: {auth?.user_role}</p>

      {/* Only admins/owners can access settings */}
      <AuthGate appId="validai" permission="can_manage_settings">
        <div className="space-y-4">
          <LLMSettings />
          <ProcessorDefaults />
          <OrganizationSettings />
        </div>
      </AuthGate>
    </div>
  )
}
```

---

## Recommendations

### ✅ DO

1. **Use AuthGate for simple cases** - Cleaner code, less boilerplate
2. **Use hooks for complex logic** - When you need multiple conditions or custom behavior
3. **Provide fallback content** - Show upgrade prompts for tier-limited features
4. **Check permissions client-side** - Better UX, immediate feedback
5. **Trust RLS policies** - Server-side security is enforced by database

### ❌ DON'T

1. **Don't skip middleware checks** - Always verify app access in middleware
2. **Don't rely solely on client-side** - RLS policies are the security layer
3. **Don't check permissions manually** - Use framework hooks/components
4. **Don't duplicate authorization logic** - Centralized in framework hooks
5. **Don't bypass AuthGate** - It handles loading states and caching

---

## Testing Authorization

### Test Different Roles

1. **Viewer** - Should only see content, no edit/delete/execute buttons
2. **Member** - Can edit and execute, but not delete or export
3. **Admin** - Full access except member management
4. **Owner** - Full access including member management

### Test Different Tiers

1. **Free** - Basic features only, limited resources
2. **Pro** - Advanced features unlocked (export, advanced operations)
3. **Enterprise** - All features, unlimited resources

### Test Edge Cases

1. **No subscription** - Redirected to no-access page
2. **Inactive subscription** - Redirected to no-access page
3. **Org switching** - Authorization updates with new org context

---

## Middleware Protection

**File:** `middleware.ts`

The middleware ensures users have valid access before rendering any pages:

```typescript
import { updateSession } from "@playze/shared-auth/middleware";
import { createServerClient } from "@playze/shared-auth/server";
import { type NextRequest, NextResponse } from "next/server";

export async function middleware(request: NextRequest) {
  const response = await updateSession(request);

  // Skip for auth routes
  if (request.nextUrl.pathname.startsWith('/auth')) {
    return response;
  }

  // Check ValidAI access
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    const { data: auth } = await supabase
      .rpc('get_user_authorization', {
        p_org_id: null,
        p_app_id: 'validai'
      })
      .maybeSingle();

    if (!auth) {
      return NextResponse.redirect(new URL('/no-access', request.url));
    }
  }

  return response;
}
```

---

## Summary

ValidAI's authorization framework provides:

- **ONE database query** for all authorization checks
- **Dual model** supporting both subscription tiers and role permissions
- **AuthGate component** for declarative authorization
- **Convenience hooks** for complex logic
- **5-minute caching** for performance
- **Middleware protection** at the route level

Use AuthGate for simple cases, hooks for complex logic, and always trust RLS policies as the security layer.
