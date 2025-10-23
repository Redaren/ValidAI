# Admin Portal Developer Guide

> **Target Audience:** Developers extending the Admin Portal app
> **Prerequisites:** None - this guide assumes no prior knowledge of Playze Core
> **Last Updated:** 2025-10-22

---

## Table of Contents

1. [Introduction](#introduction)
2. [High-Level Architecture](#high-level-architecture)
3. [Data Model & Entity Relationships](#data-model--entity-relationships)
4. [Authentication & Authorization](#authentication--authorization)
5. [Database Access Pattern (CRITICAL)](#database-access-pattern-critical)
6. [Adding New Functionality - Step-by-Step](#adding-new-functionality---step-by-step)
7. [Code Organization](#code-organization)
8. [UI Component Patterns](#ui-component-patterns)
9. [Best Practices & Anti-Patterns](#best-practices--anti-patterns)
10. [Quick Reference](#quick-reference)

---

## Introduction

### What is the Admin Portal?

The **Admin Portal** is a Next.js application used exclusively by Playze administrators to manage the entire platform. It provides god-mode access to:

- **Organizations**: Create, view, update all organizations
- **Users**: View all users and their memberships
- **Subscriptions**: Assign apps to organizations, manage tiers
- **Billing**: (Future) Generate invoices and track payments

### How is it Different from Regular Apps?

Unlike regular platform apps (RoadCloud, ProjectX), the Admin Portal:

- **Bypasses Row Level Security (RLS)** to access data across ALL organizations
- **Uses database functions exclusively** instead of direct PostgREST queries
- **Requires admin whitelist** to access
- **Never creates API routes** - all data operations happen in database functions

### Key Architectural Principle

**The Admin Portal follows a 100% Admin RPC Function pattern:**

```typescript
// ❌ WRONG: Regular apps use this pattern
const { data } = await supabase.from('organizations').select('*')

// ✅ CORRECT: Admin Portal uses this pattern
const { data } = await supabase.rpc('admin_list_organizations')
```

This guide explains **why** this pattern exists and **exactly how** to implement new features using it.

---

## High-Level Architecture

### Platform Context

Playze Core is a multi-tenant B2B SaaS platform that provides:

- **Organizations** as the primary tenant unit (not individual users)
- **Invite-only access** - users must be invited to organizations
- **Per-app subscriptions** - organizations subscribe to different apps with different tiers
- **Shared authentication** - one login across all apps

```
Platform Structure:
├── Organizations (Companies/Teams)
│   ├── Members (Users with Roles)
│   ├── Subscriptions (Apps with Tiers)
│   └── Data (Isolated per organization)
│
├── Apps (RoadCloud, ProjectX, etc.)
│   ├── App-specific tables (prefixed: roadcloud_roads)
│   └── Tiers (Free, Pro, Enterprise)
│       ├── Features (JSONB: {"export_reports": true})
│       └── Limits (JSONB: {"roads": 500})
│
└── Users
    ├── Profiles (Full name, avatar)
    ├── Preferences (Theme, language, timezone)
    └── Memberships (Many-to-many with Organizations)
```

### Admin Portal Role

The Admin Portal sits **above** the organization boundary and manages:

1. **Organization lifecycle**: Create organizations, assign initial owners
2. **Subscription management**: Assign apps, change tiers, track billing
3. **Platform monitoring**: View all users, memberships, usage
4. **Manual operations**: In MVP, admins handle upgrades and billing

---

## Data Model & Entity Relationships

### Core Entities

#### 1. Organizations

The **tenant unit** in Playze Core. All data belongs to an organization.

**Table:** `organizations`

```sql
CREATE TABLE organizations (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  description text,
  is_active boolean DEFAULT true,
  created_at timestamptz,
  updated_at timestamptz
);
```

**Key Concepts:**
- Organizations are created by Playze admins (not self-service in MVP)
- Organizations can be soft-deactivated with `is_active = false`
- Organizations have many members and many subscriptions

---

#### 2. Users & Profiles

**Users** are authenticated via Supabase Auth. **Profiles** extend user data.

**Table:** `auth.users` (managed by Supabase)

**Table:** `profiles`

```sql
CREATE TABLE profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id),
  full_name text,
  avatar_url text,
  bio text,
  created_at timestamptz,
  updated_at timestamptz
);
```

**Table:** `user_preferences`

```sql
CREATE TABLE user_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id),
  theme text DEFAULT 'system',
  language text DEFAULT 'en',
  timezone text DEFAULT 'UTC',
  email_notifications boolean DEFAULT true,
  push_notifications boolean DEFAULT false,
  created_at timestamptz,
  updated_at timestamptz
);
```

**Key Concepts:**
- One user can belong to multiple organizations
- Profiles are auto-created via database trigger on signup
- Preferences are shared across all apps

---

#### 3. Organization Memberships

**Many-to-many relationship** between users and organizations with roles.

**Table:** `organization_members`

```sql
CREATE TABLE organization_members (
  organization_id uuid REFERENCES organizations(id),
  user_id uuid REFERENCES auth.users(id),
  role text CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  joined_at timestamptz DEFAULT now(),
  invited_by uuid REFERENCES auth.users(id),
  PRIMARY KEY (organization_id, user_id)
);
```

**Roles:**
- **owner**: Full control, can delete org, manage billing
- **admin**: Manage members, change settings
- **member**: Standard access to apps
- **viewer**: Read-only access

**Key Concepts:**
- Composite primary key (no separate `id` column)
- Users switch between organizations to change context
- Current organization is stored in JWT `app_metadata.organization_id`

---

#### 4. Apps & Tiers

**Apps** are the products in the Playze family. **Tiers** define pricing and features.

**Table:** `apps`

```sql
CREATE TABLE apps (
  id text PRIMARY KEY,  -- e.g., 'roadcloud', 'projectx'
  name text NOT NULL,
  description text,
  icon_url text,
  app_url text,
  is_active boolean DEFAULT true,
  created_at timestamptz,
  updated_at timestamptz
);
```

**Table:** `app_tiers`

```sql
CREATE TABLE app_tiers (
  id uuid PRIMARY KEY,
  app_id text REFERENCES apps(id),
  tier_name text CHECK (tier_name IN ('free', 'pro', 'enterprise')),
  display_name text NOT NULL,
  description text,
  features jsonb DEFAULT '{}'::jsonb,  -- e.g., {"export_reports": true}
  limits jsonb DEFAULT '{}'::jsonb,    -- e.g., {"roads": 500}
  price_monthly numeric,
  price_yearly numeric,
  is_active boolean DEFAULT true,
  UNIQUE(app_id, tier_name)
);
```

**Key Concepts:**
- App IDs are used as table prefixes (e.g., `roadcloud_roads`)
- Features are boolean flags in JSONB
- Limits use `-1` for unlimited
- Each app has exactly 3 tiers: free, pro, enterprise

---

#### 5. Subscriptions

**Organizations subscribe to apps** with a specific tier.

**Table:** `organization_app_subscriptions`

```sql
CREATE TABLE organization_app_subscriptions (
  id uuid PRIMARY KEY,
  organization_id uuid REFERENCES organizations(id),
  app_id text REFERENCES apps(id),
  tier_id uuid REFERENCES app_tiers(id),
  tier_name text NOT NULL,  -- Denormalized for performance
  status text CHECK (status IN ('active', 'past_due', 'canceled', 'suspended')),
  billing_period_start timestamptz,
  billing_period_end timestamptz,
  last_invoice_date timestamptz,
  last_payment_date timestamptz,
  assigned_by uuid REFERENCES auth.users(id),  -- Playze admin who assigned
  assigned_at timestamptz DEFAULT now(),
  notes text,  -- Admin notes
  created_at timestamptz,
  updated_at timestamptz,
  UNIQUE(organization_id, app_id)  -- One subscription per app per org
);
```

**Key Concepts:**
- Organizations can only have ONE subscription per app
- Only `status = 'active'` grants app access
- `tier_name` is denormalized for RLS policy performance
- In MVP, subscriptions are assigned manually by admins

---

### Entity Relationship Diagram

```
┌─────────────────┐
│  Organizations  │
│  (Tenant Unit)  │
└────────┬────────┘
         │
         │ 1:N
         │
    ┌────┴────────────────────────┐
    │                             │
    │                             │
    ▼                             ▼
┌──────────────────┐    ┌─────────────────────────┐
│ organization_    │    │ organization_app_       │
│ members          │    │ subscriptions           │
│ (M:N User-Org)   │    │ (Org subscribes to App) │
└────────┬─────────┘    └──────────┬──────────────┘
         │                         │
         │ M:N                     │ M:1
         │                         │
         ▼                         ▼
    ┌────────┐              ┌──────────────┐
    │ Users  │              │  app_tiers   │
    │ (Auth) │              │  (Pricing)   │
    └────┬───┘              └──────┬───────┘
         │                         │
         │ 1:1                     │ N:1
         │                         │
         ▼                         ▼
    ┌─────────┐              ┌──────────┐
    │profiles │              │   apps   │
    └─────────┘              │ (Catalog)│
                             └──────────┘
```

**Read as:**
- An **Organization** has many **Members** (users with roles)
- An **Organization** has many **Subscriptions** (apps with tiers)
- A **User** can belong to many **Organizations** (many-to-many)
- An **App** has many **Tiers** (free, pro, enterprise)
- A **Subscription** links Organization + App + Tier

---

## Authentication & Authorization

### Admin Whitelist

Only specific users can access the Admin Portal. Authorization is database-driven.

**Table:** `admin_users`

```sql
CREATE TABLE admin_users (
  id uuid PRIMARY KEY,
  email text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Example data
INSERT INTO admin_users (id, email) VALUES
  (gen_random_uuid(), 'johan.mardfelt@olivab.se');
```

### Middleware Pattern

**File:** `apps/admin-portal/middleware.ts`

Every request to the Admin Portal goes through middleware that:

1. **Refreshes Supabase session** (cookie-based auth)
2. **Checks if user is authenticated**
3. **Queries `admin_users` table** to verify admin status
4. **Redirects non-admins** to `/unauthorized`

```typescript
// Simplified middleware logic
export async function middleware(request: NextRequest) {
  const supabase = createServerClient(...)

  // Public routes (login, unauthorized)
  if (isPublicRoute) return NextResponse.next()

  // Check authentication
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return redirect('/login')

  // Check admin whitelist
  const { data: adminUser } = await supabase
    .from('admin_users')
    .select('id, email')
    .eq('email', user.email?.toLowerCase() || '')
    .maybeSingle()

  if (!adminUser) return redirect('/unauthorized')

  // Allow access
  return NextResponse.next()
}
```

### Helper Function: `is_playze_admin()`

Database functions use this helper to check admin status:

```sql
CREATE FUNCTION is_playze_admin()
RETURNS boolean
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM admin_users
    WHERE email = (auth.jwt() ->> 'email')::text
  );
END;
$$;
```

---

## Database Access Pattern (CRITICAL)

### Why Admin Portal is Different

Regular platform apps (RoadCloud, ProjectX) use **PostgREST with RLS policies**:

```typescript
// Regular app pattern - RLS filters to user's organization
const { data } = await supabase
  .from('roadcloud_roads')
  .select('*')
// Returns only roads for user's current organization
```

**Admin Portal needs to bypass RLS** to access ALL organizations. Why not just add admin checks to RLS policies?

### The Problem: Infinite Recursion

If we added admin checks to RLS policies, we'd get infinite recursion:

```sql
-- ❌ BAD: This creates infinite loop
CREATE POLICY "organizations_policy" ON organizations
USING (
  is_playze_admin()  -- ← Queries admin_users, then organization_members
  OR
  EXISTS (           -- ← Queries organization_members
    SELECT 1 FROM organization_members
    WHERE organization_id = organizations.id
      AND user_id = auth.uid()
  )
);

-- When admin queries organizations:
-- 1. Policy evaluates is_playze_admin()
-- 2. is_playze_admin() queries organization_members
-- 3. organization_members has RLS policy
-- 4. organization_members policy queries organization_members
-- 5. INFINITE LOOP
```

### The Solution: SECURITY DEFINER Functions

Admin Portal uses **database functions that bypass RLS entirely**:

```sql
CREATE FUNCTION admin_list_organizations()
RETURNS TABLE (
  id uuid,
  name text,
  description text,
  is_active boolean,
  created_at timestamptz,
  updated_at timestamptz,
  member_count bigint
)
SECURITY DEFINER  -- ← Runs with elevated privileges, bypasses RLS
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- 1. Check authorization FIRST
  IF NOT is_playze_admin() THEN
    RAISE EXCEPTION 'Only Playze administrators can list all organizations';
  END IF;

  -- 2. Query data WITHOUT RLS evaluation
  RETURN QUERY
  SELECT
    o.id,
    o.name,
    o.description,
    o.is_active,
    o.created_at,
    o.updated_at,
    COUNT(om.user_id)::bigint as member_count
  FROM organizations o
  LEFT JOIN organization_members om ON om.organization_id = o.id
  GROUP BY o.id
  ORDER BY o.name ASC;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION admin_list_organizations() TO authenticated;
```

### Frontend Usage

```typescript
// Call admin RPC function
const { data, error } = await supabase.rpc('admin_list_organizations')
```

### Key Architectural Differences

| Aspect | Regular Apps | Admin Portal |
|--------|-------------|--------------|
| **Frontend API** | PostgREST (`.from()`) | RPC (`.rpc()`) |
| **Data Access** | RLS-filtered | SECURITY DEFINER bypass |
| **Authorization** | RLS policies | Function-internal checks |
| **Scope** | Single organization | All organizations |
| **Joins** | Client-side or manual | Server-side in function |

### Decision Tree

```
Need to query/mutate data in Admin Portal?
│
└─ ✅ ALWAYS create SECURITY DEFINER function
   └─ Call via supabase.rpc('admin_function_name')

❌ NEVER use:
   - supabase.from('table').select()
   - supabase.from('table').insert()
   - supabase.from('table').update()
   - Edge Functions for CRUD operations
```

---

## Adding New Functionality - Step-by-Step

Let's walk through adding a complete feature: **Invoice Management**

### Feature Requirements

As an admin, I want to:
- List all invoices across all organizations
- View invoice details
- Create new invoices
- Update invoice status (draft → sent → paid)

### Step 1: Create Database Functions

**File:** `supabase/migrations/YYYYMMDD_admin_invoice_functions.sql`

```sql
-- =====================================================
-- ADMIN: LIST ALL INVOICES
-- =====================================================

CREATE FUNCTION admin_list_all_invoices()
RETURNS TABLE (
  id uuid,
  invoice_number text,
  organization_id uuid,
  organization_name text,
  status text,
  total numeric,
  currency text,
  issue_date timestamptz,
  due_date timestamptz,
  paid_date timestamptz,
  created_at timestamptz
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- Authorization check
  IF NOT is_playze_admin() THEN
    RAISE EXCEPTION 'Only Playze administrators can list all invoices';
  END IF;

  -- Return all invoices with organization details
  RETURN QUERY
  SELECT
    i.id,
    i.invoice_number,
    i.organization_id,
    o.name as organization_name,
    i.status,
    i.total,
    i.currency,
    i.issue_date,
    i.due_date,
    i.paid_date,
    i.created_at
  FROM invoices i
  LEFT JOIN organizations o ON o.id = i.organization_id
  ORDER BY i.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_list_all_invoices() TO authenticated;

-- =====================================================
-- ADMIN: GET INVOICE DETAILS
-- =====================================================

CREATE FUNCTION admin_get_invoice(invoice_id uuid)
RETURNS TABLE (
  id uuid,
  invoice_number text,
  organization_id uuid,
  organization_name text,
  status text,
  billing_period_start timestamptz,
  billing_period_end timestamptz,
  subtotal numeric,
  tax numeric,
  total numeric,
  currency text,
  line_items jsonb,
  issue_date timestamptz,
  due_date timestamptz,
  paid_date timestamptz,
  payment_method text,
  payment_reference text,
  notes text,
  pdf_url text,
  created_at timestamptz,
  updated_at timestamptz
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT is_playze_admin() THEN
    RAISE EXCEPTION 'Only Playze administrators can view invoice details';
  END IF;

  RETURN QUERY
  SELECT
    i.id,
    i.invoice_number,
    i.organization_id,
    o.name as organization_name,
    i.status,
    i.billing_period_start,
    i.billing_period_end,
    i.subtotal,
    i.tax,
    i.total,
    i.currency,
    i.line_items,
    i.issue_date,
    i.due_date,
    i.paid_date,
    i.payment_method,
    i.payment_reference,
    i.notes,
    i.pdf_url,
    i.created_at,
    i.updated_at
  FROM invoices i
  LEFT JOIN organizations o ON o.id = i.organization_id
  WHERE i.id = invoice_id;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_get_invoice(uuid) TO authenticated;

-- =====================================================
-- ADMIN: CREATE INVOICE
-- =====================================================

CREATE FUNCTION admin_create_invoice(
  p_organization_id uuid,
  p_invoice_number text,
  p_billing_period_start timestamptz,
  p_billing_period_end timestamptz,
  p_line_items jsonb,
  p_subtotal numeric,
  p_tax numeric,
  p_total numeric,
  p_issue_date timestamptz,
  p_due_date timestamptz,
  p_notes text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  invoice_number text,
  status text,
  created_at timestamptz
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  new_invoice_id uuid;
BEGIN
  -- Authorization
  IF NOT is_playze_admin() THEN
    RAISE EXCEPTION 'Only Playze administrators can create invoices';
  END IF;

  -- Validation
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'Organization ID is required';
  END IF;

  IF p_invoice_number IS NULL OR p_invoice_number = '' THEN
    RAISE EXCEPTION 'Invoice number is required';
  END IF;

  -- Insert invoice
  INSERT INTO invoices (
    organization_id,
    invoice_number,
    status,
    billing_period_start,
    billing_period_end,
    subtotal,
    tax,
    total,
    currency,
    line_items,
    issue_date,
    due_date,
    notes,
    created_by
  )
  VALUES (
    p_organization_id,
    p_invoice_number,
    'draft',
    p_billing_period_start,
    p_billing_period_end,
    p_subtotal,
    p_tax,
    p_total,
    'USD',
    p_line_items,
    p_issue_date,
    p_due_date,
    p_notes,
    auth.uid()
  )
  RETURNING invoices.id INTO new_invoice_id;

  -- Return created invoice
  RETURN QUERY
  SELECT
    new_invoice_id,
    p_invoice_number,
    'draft'::text,
    now()
  FROM invoices
  WHERE invoices.id = new_invoice_id;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_create_invoice(uuid, text, timestamptz, timestamptz, jsonb, numeric, numeric, numeric, timestamptz, timestamptz, text) TO authenticated;

-- =====================================================
-- ADMIN: UPDATE INVOICE STATUS
-- =====================================================

CREATE FUNCTION admin_update_invoice_status(
  p_invoice_id uuid,
  p_status text,
  p_paid_date timestamptz DEFAULT NULL,
  p_payment_method text DEFAULT NULL,
  p_payment_reference text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  invoice_number text,
  status text,
  paid_date timestamptz
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- Authorization
  IF NOT is_playze_admin() THEN
    RAISE EXCEPTION 'Only Playze administrators can update invoice status';
  END IF;

  -- Validation
  IF p_status NOT IN ('draft', 'sent', 'paid', 'overdue', 'canceled') THEN
    RAISE EXCEPTION 'Invalid status: %', p_status;
  END IF;

  -- Update invoice
  RETURN QUERY
  UPDATE invoices
  SET
    status = p_status,
    paid_date = COALESCE(p_paid_date, invoices.paid_date),
    payment_method = COALESCE(p_payment_method, invoices.payment_method),
    payment_reference = COALESCE(p_payment_reference, invoices.payment_reference),
    updated_at = now()
  WHERE invoices.id = p_invoice_id
  RETURNING
    invoices.id,
    invoices.invoice_number,
    invoices.status,
    invoices.paid_date;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_update_invoice_status(uuid, text, timestamptz, text, text) TO authenticated;
```

**Deploy migration:**
```bash
npx supabase db push
```

---

### Step 2: Create Validation Schemas

**File:** `apps/admin-portal/lib/validations/invoice-schemas.ts`

```typescript
import { z } from 'zod'
import { uuidSchema, organizationNameSchema } from './common-schemas'

/**
 * Schema: Create Invoice
 * Used by: CreateInvoiceForm component
 * Database function: admin_create_invoice
 */
export const createInvoiceSchema = z.object({
  organizationId: uuidSchema,
  invoiceNumber: z.string()
    .min(1, 'Invoice number is required')
    .max(50, 'Invoice number must be at most 50 characters'),
  billingPeriodStart: z.date({
    required_error: 'Billing period start is required',
  }),
  billingPeriodEnd: z.date({
    required_error: 'Billing period end is required',
  }),
  lineItems: z.array(z.object({
    description: z.string().min(1, 'Description is required'),
    quantity: z.number().min(1, 'Quantity must be at least 1'),
    unitPrice: z.number().min(0, 'Unit price must be non-negative'),
    total: z.number().min(0, 'Total must be non-negative'),
  })).min(1, 'At least one line item is required'),
  subtotal: z.number().min(0, 'Subtotal must be non-negative'),
  tax: z.number().min(0, 'Tax must be non-negative'),
  total: z.number().min(0, 'Total must be non-negative'),
  issueDate: z.date({
    required_error: 'Issue date is required',
  }),
  dueDate: z.date({
    required_error: 'Due date is required',
  }),
  notes: z.string().max(500, 'Notes must be at most 500 characters').optional(),
})

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>

/**
 * Schema: Update Invoice Status
 * Used by: UpdateInvoiceStatusDialog component
 */
export const updateInvoiceStatusSchema = z.object({
  invoiceId: uuidSchema,
  status: z.enum(['draft', 'sent', 'paid', 'overdue', 'canceled'], {
    errorMap: () => ({ message: 'Invalid status' }),
  }),
  paidDate: z.date().optional(),
  paymentMethod: z.string().max(100, 'Payment method must be at most 100 characters').optional(),
  paymentReference: z.string().max(200, 'Payment reference must be at most 200 characters').optional(),
})

export type UpdateInvoiceStatusInput = z.infer<typeof updateInvoiceStatusSchema>

/**
 * Schema: Invoice Filters
 * Used by: InvoiceTable component for filtering
 */
export const invoiceFiltersSchema = z.object({
  status: z.enum(['all', 'draft', 'sent', 'paid', 'overdue', 'canceled']).optional(),
  organizationId: uuidSchema.optional(),
  search: z.string().optional(),
})

export type InvoiceFiltersInput = z.infer<typeof invoiceFiltersSchema>
```

**Export schemas:**

**File:** `apps/admin-portal/lib/validations/index.ts`

```typescript
// ... existing exports
export * from './invoice-schemas'
```

---

### Step 3: Create TanStack Query Hooks

**File:** `apps/admin-portal/lib/queries/invoices.ts`

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createBrowserClient } from '@playze/shared-auth/client'
import type {
  CreateInvoiceInput,
  UpdateInvoiceStatusInput,
  InvoiceFiltersInput,
} from '@/lib/validations'

/**
 * Query keys factory for invoices
 * Hierarchical structure for efficient cache invalidation
 */
export const invoiceKeys = {
  all: ['admin', 'invoices'] as const,
  lists: () => [...invoiceKeys.all, 'list'] as const,
  list: (filters?: InvoiceFiltersInput) => [...invoiceKeys.lists(), filters] as const,
  details: () => [...invoiceKeys.all, 'detail'] as const,
  detail: (id: string) => [...invoiceKeys.details(), id] as const,
}

/**
 * Hook: List all invoices
 * Uses admin RPC function to bypass RLS and access ALL invoices
 */
export function useInvoices(filters?: InvoiceFiltersInput) {
  return useQuery({
    queryKey: invoiceKeys.list(filters),
    queryFn: async () => {
      const supabase = createBrowserClient()

      // Call admin function (bypasses RLS, returns ALL invoices)
      const { data, error } = await supabase.rpc('admin_list_all_invoices')

      if (error) throw error

      // Apply client-side filtering
      let filtered = data || []

      if (filters?.status && filters.status !== 'all') {
        filtered = filtered.filter((invoice) => invoice.status === filters.status)
      }

      if (filters?.organizationId) {
        filtered = filtered.filter((invoice) => invoice.organization_id === filters.organizationId)
      }

      if (filters?.search) {
        const search = filters.search.toLowerCase()
        filtered = filtered.filter((invoice) =>
          invoice.invoice_number?.toLowerCase().includes(search) ||
          invoice.organization_name?.toLowerCase().includes(search)
        )
      }

      return filtered
    },
    enabled: true,
  })
}

/**
 * Hook: Get invoice details
 * Uses admin RPC function to bypass RLS and access ANY invoice
 */
export function useInvoice(id: string) {
  return useQuery({
    queryKey: invoiceKeys.detail(id),
    queryFn: async () => {
      const supabase = createBrowserClient()

      // Call admin function (bypasses RLS, can access ANY invoice)
      const { data, error } = await supabase.rpc('admin_get_invoice', {
        invoice_id: id,
      })

      if (error) throw error

      // RPC returns array, get first result
      return data?.[0] || null
    },
    enabled: !!id,
  })
}

/**
 * Hook: Create invoice
 * Uses admin RPC function to bypass RLS
 */
export function useCreateInvoice() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateInvoiceInput) => {
      const supabase = createBrowserClient()

      // Call admin function (bypasses RLS)
      const { data, error } = await supabase.rpc('admin_create_invoice', {
        p_organization_id: input.organizationId,
        p_invoice_number: input.invoiceNumber,
        p_billing_period_start: input.billingPeriodStart.toISOString(),
        p_billing_period_end: input.billingPeriodEnd.toISOString(),
        p_line_items: input.lineItems,
        p_subtotal: input.subtotal,
        p_tax: input.tax,
        p_total: input.total,
        p_issue_date: input.issueDate.toISOString(),
        p_due_date: input.dueDate.toISOString(),
        p_notes: input.notes || null,
      })

      if (error) throw error

      // RPC returns array, get first result
      return data?.[0] || null
    },
    onSuccess: () => {
      // Invalidate invoices list to refetch
      queryClient.invalidateQueries({ queryKey: invoiceKeys.lists() })
    },
  })
}

/**
 * Hook: Update invoice status
 * Uses admin RPC function to bypass RLS
 */
export function useUpdateInvoiceStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: UpdateInvoiceStatusInput) => {
      const supabase = createBrowserClient()

      // Call admin function (bypasses RLS)
      const { data, error } = await supabase.rpc('admin_update_invoice_status', {
        p_invoice_id: input.invoiceId,
        p_status: input.status,
        p_paid_date: input.paidDate?.toISOString() || null,
        p_payment_method: input.paymentMethod || null,
        p_payment_reference: input.paymentReference || null,
      })

      if (error) throw error

      // RPC returns array, get first result
      return data?.[0] || null
    },
    onSuccess: (_, variables) => {
      // Invalidate both list and detail caches
      queryClient.invalidateQueries({ queryKey: invoiceKeys.lists() })
      queryClient.invalidateQueries({ queryKey: invoiceKeys.detail(variables.invoiceId) })
    },
  })
}
```

**Export queries:**

**File:** `apps/admin-portal/lib/queries/index.ts`

```typescript
// ... existing exports
export * from './invoices'
```

---

### Step 4: Build UI Components

#### 4a. Invoice Table (List View)

**File:** `apps/admin-portal/components/invoices/invoices-table.tsx`

```typescript
'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { DataTable, Badge, Button } from '@playze/shared-ui'
import type { ColumnDef } from '@playze/shared-ui'
import { MoreHorizontal, Eye, Download } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@playze/shared-ui'
import { useInvoices } from '@/lib/queries'
import { formatDate, formatCurrency } from '@/lib/utils'

type Invoice = {
  id: string
  invoice_number: string
  organization_id: string
  organization_name: string
  status: string
  total: number
  currency: string
  issue_date: string
  due_date: string
  paid_date: string | null
  created_at: string
}

function InvoiceActions({ invoice }: { invoice: Invoice }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon">
          <MoreHorizontal className="h-4 w-4" />
          <span className="sr-only">Open menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link href={`/invoices/${invoice.id}`}>
            <Eye className="mr-2 h-4 w-4" />
            View Details
          </Link>
        </DropdownMenuItem>
        {invoice.pdf_url && (
          <DropdownMenuItem asChild>
            <a href={invoice.pdf_url} target="_blank" rel="noopener noreferrer">
              <Download className="mr-2 h-4 w-4" />
              Download PDF
            </a>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function getStatusVariant(status: string) {
  switch (status) {
    case 'paid':
      return 'default'
    case 'sent':
      return 'secondary'
    case 'overdue':
      return 'destructive'
    case 'draft':
      return 'outline'
    case 'canceled':
      return 'secondary'
    default:
      return 'secondary'
  }
}

export function InvoicesTable() {
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const { data: invoices, isLoading } = useInvoices({ status: statusFilter })

  const columns = useMemo<ColumnDef<Invoice>[]>(
    () => [
      {
        accessorKey: 'invoice_number',
        header: 'Invoice #',
        cell: ({ row }) => (
          <Link
            href={`/invoices/${row.original.id}`}
            className="font-medium hover:underline"
          >
            {row.original.invoice_number}
          </Link>
        ),
      },
      {
        accessorKey: 'organization_name',
        header: 'Organization',
        cell: ({ row }) => (
          <Link
            href={`/organizations/${row.original.organization_id}`}
            className="text-muted-foreground hover:underline"
          >
            {row.original.organization_name}
          </Link>
        ),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => (
          <Badge variant={getStatusVariant(row.original.status)}>
            {row.original.status}
          </Badge>
        ),
      },
      {
        accessorKey: 'total',
        header: 'Total',
        cell: ({ row }) => (
          <span className="font-medium">
            {formatCurrency(row.original.total, row.original.currency)}
          </span>
        ),
      },
      {
        accessorKey: 'issue_date',
        header: 'Issue Date',
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {formatDate(row.original.issue_date)}
          </span>
        ),
      },
      {
        accessorKey: 'due_date',
        header: 'Due Date',
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {formatDate(row.original.due_date)}
          </span>
        ),
      },
      {
        id: 'actions',
        cell: ({ row }) => <InvoiceActions invoice={row.original} />,
      },
    ],
    []
  )

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-4">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="all">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="sent">Sent</option>
          <option value="paid">Paid</option>
          <option value="overdue">Overdue</option>
          <option value="canceled">Canceled</option>
        </select>
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={invoices || []}
        isLoading={isLoading}
        searchKey="invoice_number"
        searchPlaceholder="Search invoices..."
        pageSize={10}
      />
    </div>
  )
}
```

#### 4b. Create Invoice Dialog

**File:** `apps/admin-portal/components/invoices/create-invoice-dialog.tsx`

```typescript
'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Button,
  Input,
  Label,
  Textarea,
} from '@playze/shared-ui'
import { Loader2 } from 'lucide-react'
import { useCreateInvoice, useOrganizations } from '@/lib/queries'
import { createInvoiceSchema, type CreateInvoiceInput } from '@/lib/validations'
import { toast } from '@/lib/utils/toast'

interface CreateInvoiceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultOrganizationId?: string
}

export function CreateInvoiceDialog({
  open,
  onOpenChange,
  defaultOrganizationId,
}: CreateInvoiceDialogProps) {
  const { data: organizations } = useOrganizations()
  const createInvoice = useCreateInvoice()

  const form = useForm<CreateInvoiceInput>({
    resolver: zodResolver(createInvoiceSchema),
    defaultValues: {
      organizationId: defaultOrganizationId || '',
      invoiceNumber: '',
      billingPeriodStart: new Date(),
      billingPeriodEnd: new Date(),
      lineItems: [],
      subtotal: 0,
      tax: 0,
      total: 0,
      issueDate: new Date(),
      dueDate: new Date(),
      notes: '',
    },
  })

  const onSubmit = async (data: CreateInvoiceInput) => {
    try {
      await createInvoice.mutateAsync(data)
      toast.success('Invoice created successfully')
      onOpenChange(false)
      form.reset()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create invoice')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create Invoice</DialogTitle>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          {/* Organization */}
          <div className="space-y-2">
            <Label htmlFor="organizationId">Organization</Label>
            <select
              id="organizationId"
              {...form.register('organizationId')}
              className="w-full rounded-md border border-input bg-background px-3 py-2"
            >
              <option value="">Select organization</option>
              {organizations?.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
            {form.formState.errors.organizationId && (
              <p className="text-sm text-destructive">
                {form.formState.errors.organizationId.message}
              </p>
            )}
          </div>

          {/* Invoice Number */}
          <div className="space-y-2">
            <Label htmlFor="invoiceNumber">Invoice Number</Label>
            <Input
              id="invoiceNumber"
              placeholder="INV-2025-001"
              {...form.register('invoiceNumber')}
            />
            {form.formState.errors.invoiceNumber && (
              <p className="text-sm text-destructive">
                {form.formState.errors.invoiceNumber.message}
              </p>
            )}
          </div>

          {/* ... Add more form fields ... */}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createInvoice.isPending}>
              {createInvoice.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Create Invoice
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

---

### Step 5: Create Page Routes

#### 5a. Invoices List Page

**File:** `apps/admin-portal/app/(admin)/invoices/page.tsx`

```typescript
'use client'

import { useState } from 'react'
import { Button } from '@playze/shared-ui'
import { Plus } from 'lucide-react'
import { InvoicesTable } from '@/components/invoices/invoices-table'
import { CreateInvoiceDialog } from '@/components/invoices/create-invoice-dialog'

export default function InvoicesPage() {
  const [createDialogOpen, setCreateDialogOpen] = useState(false)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Invoices</h1>
          <p className="text-muted-foreground">
            Manage invoices and track payments across all organizations
          </p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Create Invoice
        </Button>
      </div>

      {/* Table */}
      <InvoicesTable />

      {/* Create Dialog */}
      <CreateInvoiceDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />
    </div>
  )
}
```

#### 5b. Invoice Details Page

**File:** `apps/admin-portal/app/(admin)/invoices/[id]/page.tsx`

```typescript
'use client'

import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Button, Badge, Card } from '@playze/shared-ui'
import { ArrowLeft, Loader2, Download } from 'lucide-react'
import { useInvoice } from '@/lib/queries'
import { formatDate, formatCurrency } from '@/lib/utils'

export default function InvoiceDetailsPage() {
  const params = useParams()
  const invoiceId = params.id as string
  const { data: invoice, isLoading } = useInvoice(invoiceId)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!invoice) {
    return (
      <div className="space-y-6">
        <div>
          <Button variant="ghost" asChild className="mb-4">
            <Link href="/invoices">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Invoices
            </Link>
          </Button>
          <h1 className="text-3xl font-bold tracking-tight">Invoice Not Found</h1>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Button variant="ghost" asChild className="mb-4">
          <Link href="/invoices">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Invoices
          </Link>
        </Button>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">
                {invoice.invoice_number}
              </h1>
              <Badge>{invoice.status}</Badge>
            </div>
            <p className="mt-1 text-muted-foreground">
              {invoice.organization_name}
            </p>
          </div>
          {invoice.pdf_url && (
            <Button asChild>
              <a href={invoice.pdf_url} target="_blank" rel="noopener noreferrer">
                <Download className="mr-2 h-4 w-4" />
                Download PDF
              </a>
            </Button>
          )}
        </div>
      </div>

      {/* Details */}
      <Card className="p-6">
        <div className="grid grid-cols-2 gap-6">
          <div>
            <h3 className="font-semibold mb-2">Billing Period</h3>
            <p className="text-sm text-muted-foreground">
              {formatDate(invoice.billing_period_start)} -{' '}
              {formatDate(invoice.billing_period_end)}
            </p>
          </div>
          <div>
            <h3 className="font-semibold mb-2">Total Amount</h3>
            <p className="text-2xl font-bold">
              {formatCurrency(invoice.total, invoice.currency)}
            </p>
          </div>
          <div>
            <h3 className="font-semibold mb-2">Issue Date</h3>
            <p className="text-sm text-muted-foreground">
              {formatDate(invoice.issue_date)}
            </p>
          </div>
          <div>
            <h3 className="font-semibold mb-2">Due Date</h3>
            <p className="text-sm text-muted-foreground">
              {formatDate(invoice.due_date)}
            </p>
          </div>
          {invoice.paid_date && (
            <div>
              <h3 className="font-semibold mb-2">Paid Date</h3>
              <p className="text-sm text-muted-foreground">
                {formatDate(invoice.paid_date)}
              </p>
            </div>
          )}
        </div>

        {/* Line Items */}
        {invoice.line_items && (
          <div className="mt-6">
            <h3 className="font-semibold mb-4">Line Items</h3>
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">Description</th>
                  <th className="text-right py-2">Quantity</th>
                  <th className="text-right py-2">Unit Price</th>
                  <th className="text-right py-2">Total</th>
                </tr>
              </thead>
              <tbody>
                {invoice.line_items.map((item, index) => (
                  <tr key={index} className="border-b">
                    <td className="py-2">{item.description}</td>
                    <td className="text-right py-2">{item.quantity}</td>
                    <td className="text-right py-2">
                      {formatCurrency(item.unitPrice, invoice.currency)}
                    </td>
                    <td className="text-right py-2">
                      {formatCurrency(item.total, invoice.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-semibold">
                  <td colSpan={3} className="text-right py-2">Subtotal:</td>
                  <td className="text-right py-2">
                    {formatCurrency(invoice.subtotal, invoice.currency)}
                  </td>
                </tr>
                <tr className="font-semibold">
                  <td colSpan={3} className="text-right py-2">Tax:</td>
                  <td className="text-right py-2">
                    {formatCurrency(invoice.tax, invoice.currency)}
                  </td>
                </tr>
                <tr className="font-bold text-lg">
                  <td colSpan={3} className="text-right py-2">Total:</td>
                  <td className="text-right py-2">
                    {formatCurrency(invoice.total, invoice.currency)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
```

---

### Summary Checklist

When adding a new feature to Admin Portal:

- [ ] **Step 1**: Create SECURITY DEFINER database functions
  - [ ] List function: `admin_list_all_{entities}`
  - [ ] Detail function: `admin_get_{entity}`
  - [ ] Create function: `admin_create_{entity}`
  - [ ] Update function: `admin_update_{entity}`
  - [ ] Always check `is_playze_admin()` first
  - [ ] Always use `SECURITY DEFINER` and `SET search_path = public`
  - [ ] Always `GRANT EXECUTE TO authenticated`

- [ ] **Step 2**: Create Zod validation schemas
  - [ ] Create schema: `create{Entity}Schema`
  - [ ] Update schema: `update{Entity}Schema`
  - [ ] Filters schema: `{entity}FiltersSchema`
  - [ ] Export inferred TypeScript types
  - [ ] Add JSDoc comments

- [ ] **Step 3**: Create TanStack Query hooks
  - [ ] Query keys factory: `{entity}Keys`
  - [ ] List hook: `use{Entities}`
  - [ ] Detail hook: `use{Entity}`
  - [ ] Create hook: `useCreate{Entity}`
  - [ ] Update hook: `useUpdate{Entity}`
  - [ ] Invalidate caches in `onSuccess`

- [ ] **Step 4**: Build UI components
  - [ ] Table component: `{Entity}Table.tsx`
  - [ ] Create dialog: `Create{Entity}Dialog.tsx`
  - [ ] Update dialog: `Update{Entity}Dialog.tsx`
  - [ ] Use shared UI components from `@playze/shared-ui`

- [ ] **Step 5**: Create page routes
  - [ ] List page: `app/(admin)/{entities}/page.tsx`
  - [ ] Details page: `app/(admin)/{entities}/[id]/page.tsx`

---

## Code Organization

### Directory Structure

```
apps/admin-portal/
├── app/
│   ├── (admin)/              # Layout group for authenticated admin routes
│   │   ├── layout.tsx        # Admin layout with sidebar
│   │   ├── page.tsx          # Dashboard (home page)
│   │   ├── organizations/    # Organizations feature
│   │   │   ├── page.tsx                  # List all organizations
│   │   │   ├── new/page.tsx              # Create organization
│   │   │   └── [id]/page.tsx             # Organization details
│   │   ├── users/            # Users feature
│   │   │   ├── page.tsx                  # List all users
│   │   │   └── [id]/page.tsx             # User details
│   │   ├── subscriptions/    # Subscriptions feature
│   │   │   └── page.tsx                  # List all subscriptions
│   │   └── invoices/         # Invoices feature (future)
│   │       ├── page.tsx                  # List all invoices
│   │       └── [id]/page.tsx             # Invoice details
│   ├── login/
│   │   └── page.tsx          # Login page
│   ├── unauthorized/
│   │   └── page.tsx          # Unauthorized page
│   └── layout.tsx            # Root layout
│
├── components/
│   ├── layout/               # Layout components
│   │   ├── admin-sidebar.tsx
│   │   └── admin-nav.tsx
│   ├── organizations/        # Organization-specific components
│   │   ├── organization-table.tsx
│   │   ├── create-organization-form.tsx
│   │   └── assign-subscription-dialog.tsx
│   ├── users/                # User-specific components
│   │   ├── users-table.tsx
│   │   └── user-org-memberships.tsx
│   ├── subscriptions/        # Subscription-specific components
│   │   ├── subscriptions-table.tsx
│   │   ├── update-tier-dialog.tsx
│   │   └── cancel-subscription-dialog.tsx
│   └── ui/                   # Shared UI components (if any app-specific)
│       └── toast-container.tsx
│
├── lib/
│   ├── queries/              # TanStack Query hooks
│   │   ├── index.ts          # Export all hooks
│   │   ├── organizations.ts  # Organization hooks
│   │   ├── users.ts          # User hooks
│   │   ├── subscriptions.ts  # Subscription hooks
│   │   └── invoices.ts       # Invoice hooks (future)
│   ├── validations/          # Zod schemas
│   │   ├── index.ts          # Export all schemas
│   │   ├── common-schemas.ts # Reusable primitives
│   │   ├── organization-schemas.ts
│   │   ├── user-schemas.ts
│   │   ├── subscription-schemas.ts
│   │   └── invoice-schemas.ts
│   └── utils.ts              # Utility functions
│
├── middleware.ts             # Admin authorization check
├── package.json
└── next.config.ts
```

---

### File Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| **Pages** | `page.tsx` | `app/(admin)/organizations/page.tsx` |
| **Dynamic routes** | `[param]/page.tsx` | `app/(admin)/organizations/[id]/page.tsx` |
| **Layouts** | `layout.tsx` | `app/(admin)/layout.tsx` |
| **Components** | `kebab-case.tsx` | `organization-table.tsx` |
| **Hooks** | `use-{name}.ts` | `use-organizations.ts` |
| **Schemas** | `{entity}-schemas.ts` | `organization-schemas.ts` |
| **Query files** | `{entities}.ts` (plural) | `organizations.ts` |

---

### Import Patterns

```typescript
// ✅ Shared UI components (ALWAYS import from @playze/shared-ui)
import { Button, Card, DataTable, Badge } from '@playze/shared-ui'
import type { ColumnDef } from '@playze/shared-ui'

// ✅ Shared auth utilities
import { createBrowserClient } from '@playze/shared-auth/client'

// ✅ App-specific code (use path alias @/)
import { useOrganizations, useCreateOrganization } from '@/lib/queries'
import { createOrganizationSchema, type CreateOrganizationInput } from '@/lib/validations'

// ✅ External libraries
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
```

---

## UI Component Patterns

### Pattern 1: Data Tables

Use `DataTable` from `@playze/shared-ui` for all list views.

```typescript
import { DataTable, Badge, Button } from '@playze/shared-ui'
import type { ColumnDef } from '@playze/shared-ui'

type Entity = {
  id: string
  name: string
  status: string
  created_at: string
}

export function EntitiesTable() {
  const { data: entities, isLoading } = useEntities()

  const columns = useMemo<ColumnDef<Entity>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Name',
        cell: ({ row }) => (
          <Link href={`/entities/${row.original.id}`} className="font-medium hover:underline">
            {row.original.name}
          </Link>
        ),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => <Badge>{row.original.status}</Badge>,
      },
      {
        accessorKey: 'created_at',
        header: 'Created',
        cell: ({ row }) => <span className="text-muted-foreground">{formatDate(row.original.created_at)}</span>,
      },
      {
        id: 'actions',
        cell: ({ row }) => <EntityActions entity={row.original} />,
      },
    ],
    []
  )

  return (
    <DataTable
      columns={columns}
      data={entities || []}
      isLoading={isLoading}
      searchKey="name"
      searchPlaceholder="Search entities..."
      pageSize={10}
    />
  )
}
```

---

### Pattern 2: Forms with React Hook Form + Zod

```typescript
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button, Input, Label } from '@playze/shared-ui'
import { createEntitySchema, type CreateEntityInput } from '@/lib/validations'
import { useCreateEntity } from '@/lib/queries'

export function CreateEntityForm() {
  const createEntity = useCreateEntity()

  const form = useForm<CreateEntityInput>({
    resolver: zodResolver(createEntitySchema),
    defaultValues: {
      name: '',
      description: '',
    },
  })

  const onSubmit = async (data: CreateEntityInput) => {
    try {
      await createEntity.mutateAsync(data)
      toast.success('Entity created successfully')
      form.reset()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create entity')
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      {/* Name field */}
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          placeholder="Enter name"
          {...form.register('name')}
        />
        {form.formState.errors.name && (
          <p className="text-sm text-destructive">
            {form.formState.errors.name.message}
          </p>
        )}
      </div>

      {/* Description field */}
      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Input
          id="description"
          placeholder="Enter description"
          {...form.register('description')}
        />
        {form.formState.errors.description && (
          <p className="text-sm text-destructive">
            {form.formState.errors.description.message}
          </p>
        )}
      </div>

      {/* Submit button */}
      <Button type="submit" disabled={createEntity.isPending}>
        {createEntity.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Create Entity
      </Button>
    </form>
  )
}
```

---

### Pattern 3: Dialogs for Mutations

```typescript
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, Button } from '@playze/shared-ui'

interface UpdateEntityDialogProps {
  entityId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function UpdateEntityDialog({ entityId, open, onOpenChange }: UpdateEntityDialogProps) {
  const updateEntity = useUpdateEntity(entityId)

  const form = useForm<UpdateEntityInput>({
    resolver: zodResolver(updateEntitySchema),
  })

  const onSubmit = async (data: UpdateEntityInput) => {
    try {
      await updateEntity.mutateAsync(data)
      toast.success('Entity updated successfully')
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update entity')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Update Entity</DialogTitle>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          {/* Form fields */}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={updateEntity.isPending}>
              {updateEntity.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Update
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

---

### Pattern 4: Tab-Based Detail Pages

```typescript
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@playze/shared-ui'

export default function EntityDetailsPage() {
  const params = useParams()
  const entityId = params.id as string
  const { data: entity, isLoading } = useEntity(entityId)

  if (isLoading) {
    return <Loader2 className="h-8 w-8 animate-spin" />
  }

  if (!entity) {
    return <div>Entity not found</div>
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">{entity.name}</h1>
        <p className="text-muted-foreground">{entity.description}</p>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab entity={entity} />
        </TabsContent>

        <TabsContent value="settings">
          <SettingsTab entity={entity} />
        </TabsContent>

        <TabsContent value="activity">
          <ActivityTab entity={entity} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
```

---

## Best Practices & Anti-Patterns

### Database Access

#### ✅ DO: Use Admin RPC Functions

```typescript
// CORRECT: Admin Portal pattern
const { data } = await supabase.rpc('admin_list_organizations')
const { data } = await supabase.rpc('admin_get_organization', { org_id: id })
const { data } = await supabase.rpc('admin_update_organization', { org_id: id, org_name: name })
```

#### ❌ DON'T: Use PostgREST Queries

```typescript
// WRONG: Will fail with RLS permission errors or infinite recursion
const { data } = await supabase.from('organizations').select('*')
const { data } = await supabase.from('organizations').insert({ name })
const { data } = await supabase.from('organizations').update({ name })
```

---

### Cache Invalidation

#### ✅ DO: Invalidate Query Cache After Mutations

```typescript
export function useUpdateOrganization(organizationId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input) => { /* ... */ },
    onSuccess: () => {
      // Invalidate both list and detail caches
      queryClient.invalidateQueries({ queryKey: orgKeys.lists() })
      queryClient.invalidateQueries({ queryKey: orgKeys.detail(organizationId) })
    },
  })
}
```

#### ❌ DON'T: Forget to Invalidate

```typescript
// WRONG: Data will be stale after mutation
export function useUpdateOrganization(organizationId: string) {
  return useMutation({
    mutationFn: async (input) => { /* ... */ },
    // Missing onSuccess - cache not invalidated!
  })
}
```

---

### RLS Policies

#### ✅ DO: Keep RLS Policies Simple (Regular Users Only)

```sql
-- CORRECT: Simple policy for regular users
CREATE POLICY "users_access_own_org" ON organizations
USING (
  EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_id = organizations.id
      AND user_id = auth.uid()
  )
);
```

#### ❌ DON'T: Add Admin Checks to RLS Policies

```sql
-- WRONG: Causes infinite recursion
CREATE POLICY "users_and_admins_access" ON organizations
USING (
  is_playze_admin()  -- ← BAD: Queries organization_members
  OR
  EXISTS (
    SELECT 1 FROM organization_members  -- ← Also queries organization_members
    WHERE organization_id = organizations.id
      AND user_id = auth.uid()
  )
);
```

---

### Error Handling

#### ✅ DO: Handle Errors Gracefully

```typescript
const onSubmit = async (data: CreateOrganizationInput) => {
  try {
    await createOrganization.mutateAsync(data)
    toast.success('Organization created successfully')
    onOpenChange(false)
    form.reset()
  } catch (error) {
    // Extract meaningful error message
    const message = error instanceof Error ? error.message : 'Failed to create organization'
    toast.error(message)
  }
}
```

#### ❌ DON'T: Ignore Errors

```typescript
// WRONG: Errors silently fail
const onSubmit = async (data: CreateOrganizationInput) => {
  await createOrganization.mutateAsync(data)
  // No error handling - user doesn't know if it failed!
}
```

---

### Loading States

#### ✅ DO: Show Loading Indicators

```typescript
export default function OrganizationsPage() {
  const { data: organizations, isLoading } = useOrganizations()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return <OrganizationTable data={organizations} />
}
```

#### ❌ DON'T: Render Undefined Data

```typescript
// WRONG: Will crash if data is undefined
export default function OrganizationsPage() {
  const { data: organizations } = useOrganizations()

  // No loading check - organizations might be undefined!
  return <OrganizationTable data={organizations} />
}
```

---

## Quick Reference

### Available Admin Functions

| Entity | List Function | Detail Function | Create Function | Update Function |
|--------|---------------|-----------------|-----------------|-----------------|
| **Organizations** | `admin_list_organizations()` | `admin_get_organization(org_id)` | (Edge Function) | `admin_update_organization(org_id, ...)` |
| **Organization Members** | `admin_list_organization_members(org_id)` | - | - | - |
| **Organization Subscriptions** | `admin_list_organization_subscriptions(org_id)` | - | `admin_assign_subscription(...)` | `admin_update_subscription_tier(...)` |
| **All Subscriptions** | `admin_list_all_subscriptions()` | - | - | `admin_cancel_subscription(...)` |
| **Users** | `admin_list_all_users()` | `admin_get_user(user_id)` | - | - |
| **User Memberships** | `admin_list_user_memberships(user_id)` | - | - | - |
| **User Preferences** | `admin_get_user_preferences(user_id)` | - | - | - |
| **App Tiers** | `admin_list_app_tiers(app_id)` | - | - | - |

---

### Common Zod Schema Patterns

```typescript
// UUID validation
const uuidSchema = z.string().uuid('Invalid UUID format')

// Email validation
const emailSchema = z.string().email('Invalid email address').toLowerCase()

// Organization name
const organizationNameSchema = z.string()
  .min(2, 'Name must be at least 2 characters')
  .max(100, 'Name must be at most 100 characters')

// Optional description
const descriptionSchema = z.string()
  .max(500, 'Description must be at most 500 characters')
  .optional()

// Enum validation
const statusSchema = z.enum(['active', 'inactive', 'suspended'])

// Date validation
const dateSchema = z.date({ required_error: 'Date is required' })

// Positive number
const positiveNumberSchema = z.number().min(0, 'Must be non-negative')

// Array with min length
const arraySchema = z.array(z.string()).min(1, 'At least one item required')
```

---

### Query Key Naming Convention

```typescript
export const entityKeys = {
  all: ['admin', 'entities'] as const,           // Base key
  lists: () => [...entityKeys.all, 'list'] as const,  // All lists
  list: (filters) => [...entityKeys.lists(), filters] as const,  // Filtered list
  details: () => [...entityKeys.all, 'detail'] as const,  // All details
  detail: (id) => [...entityKeys.details(), id] as const,  // Single detail
  relationships: (id, rel) => [...entityKeys.detail(id), rel] as const,  // Related data
}

// Usage:
entityKeys.all                    // ['admin', 'entities']
entityKeys.lists()                // ['admin', 'entities', 'list']
entityKeys.list({ status: 'active' })  // ['admin', 'entities', 'list', { status: 'active' }]
entityKeys.detail('uuid')         // ['admin', 'entities', 'detail', 'uuid']
entityKeys.relationships('uuid', 'members')  // ['admin', 'entities', 'detail', 'uuid', 'members']
```

---

### Utility Functions

```typescript
// Format date
export function formatDate(date: string | Date | null): string {
  if (!date) return '—'
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

// Format currency
export function formatCurrency(amount: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount)
}

// Truncate text
export function truncate(text: string, length: number): string {
  if (text.length <= length) return text
  return `${text.slice(0, length)}...`
}

// Generate initials
export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((word) => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}
```

---

## Conclusion

This guide covered everything you need to extend the Admin Portal:

1. **Architecture**: Understanding the elevated access pattern
2. **Data Model**: Relationships between organizations, users, subscriptions, and tiers
3. **Database Pattern**: Why and how to use SECURITY DEFINER functions
4. **Step-by-Step**: Complete example of adding invoice management
5. **Patterns**: Code organization, UI components, best practices

### Key Takeaways

- **100% Admin RPC Pattern**: Never use PostgREST `.from()` queries in Admin Portal
- **SECURITY DEFINER**: All admin operations bypass RLS via database functions
- **Authorization First**: Always check `is_playze_admin()` at the start of functions
- **Cache Invalidation**: Always invalidate query cache after mutations
- **Shared UI**: Always import components from `@playze/shared-ui`

### Next Steps

1. Review existing admin functions in `supabase/migrations/*admin*.sql`
2. Study existing query hooks in `apps/admin-portal/lib/queries/`
3. Examine existing components in `apps/admin-portal/components/`
4. Follow the step-by-step pattern to add your first feature

### Need Help?

- **Architecture Docs**: See `/docs/playze-core-architecture.md`
- **Elevated Access Guide**: See `/docs/playze-core-architecture-elevated-access.md`
- **Database Migrations**: See `supabase/migrations/`
- **Existing Examples**: See `apps/admin-portal/` for working patterns

Happy coding! 🚀
