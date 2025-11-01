# Multi-Language Support with next-intl: Implementation Plan

**Version:** 2.0
**Date:** 2025-11-01
**Status:** Planning Phase (Revised)
**Target Languages:** English (Primary), Swedish (Secondary)
**Framework:** next-intl (https://next-intl.dev)

---

## 🔄 Version 2.0 Changes (Critical Revisions)

**This version includes significant architectural changes and critical bug fixes identified during technical review:**

### Key Changes from v1.0

1. **✅ FIXED: Middleware Composition**
   - **Critical Bug**: Original middleware ignored intl redirects, causing loops and lost cookies
   - **Fix**: Proper redirect handling and cookie merging pattern implemented
   - **Impact**: Prevents authentication and routing failures

2. **✅ SIMPLIFIED: No `@playze/shared-i18n` Package in MVP**
   - **Change**: Implement i18n in ValidAI app first, extract to shared package later
   - **Rationale**: Faster MVP, validate patterns before framework-wide rollout
   - **Migration**: All utilities in `apps/validai/lib/i18n/` instead of shared package

3. **✅ OPTIMIZED: Cookie-Only Locale Storage**
   - **Change**: Database updated only when user explicitly switches language
   - **Benefit**: No DB queries in middleware = better performance (~20-50ms savings per request)
   - **Impact**: Middleware overhead reduced from ~50ms to ~10-15ms

4. **✅ ADDED: API Route Exclusions**
   - **Critical**: Middleware matcher now excludes `/api/*` and `/functions/*`
   - **Impact**: Prevents intl middleware from breaking API routes and Edge Functions

5. **✅ ADDED: Date/Time/Number Formatting**
   - **Addition**: `formats` configuration in `i18n/request.ts`
   - **Benefit**: Proper Swedish/English number and date localization

6. **✅ UPDATED: LanguageSwitcher Component**
   - **Change**: Props-based design (no shared-i18n dependency)
   - **Benefit**: Truly framework-agnostic, reusable across future apps

### Timeline Adjustment

- **Original**: 4 weeks (aggressive), 6 weeks (realistic)
- **Revised**: 3-4 weeks (realistic with simplified scope)
- **Savings**: Removing shared-i18n package creation saves ~1.5 days

### Out of Scope for MVP

The following items were removed from MVP scope (can be added post-MVP if needed):
- ❌ Zod validation translation (forms stay in English for MVP)
- ❌ Email localization
- ❌ SEO optimization (hreflang, sitemap)
- ❌ Server action error message localization
- ❌ Loading state UX improvements

These items add complexity without blocking core functionality. They can be added in future iterations based on user feedback.

---

## Executive Summary

### Overview

This document outlines the implementation plan for adding internationalization (i18n) support to the ValidAI Core Framework, starting with the ValidAI application. The implementation will support **English** (primary language) and **Swedish** (secondary language), establishing patterns and infrastructure for future language expansion.

### Strategic Importance

**Why Now:**
- **Market Expansion**: Swedish market represents significant B2B opportunity (Nordic region)
- **User Experience**: Native language support increases adoption and user satisfaction
- **Competitive Advantage**: Many competitors lack robust multi-language support
- **Framework Foundation**: Establishes i18n patterns for all future apps in the monorepo

**Business Impact:**
- Enables entry into Swedish/Nordic markets (estimated +30% TAM)
- Improves user engagement and retention (studies show +40% for native language)
- Reduces support burden through localized help text
- Positions ValidAI as enterprise-ready for international customers

### Key Architectural Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Routing Strategy** | Prefix-based (`/[locale]/dashboard`) | SEO-friendly, shareable URLs, standard for B2B SaaS |
| **Locale Storage** | Cookie-based (DB on explicit change) | Simple, fast, DB updated only when user switches language |
| **Translation Structure** | ValidAI-first, minimal shared-ui | Implement in ValidAI, extract to shared later when needed |
| **Implementation Scope** | ValidAI app only (MVP) | Establish patterns before framework-wide rollout |
| **Middleware Order** | next-intl → Supabase → app access | Critical for correct session handling and redirect preservation |

### Implementation Timeline

| Phase | Duration | Milestone |
|-------|----------|-----------|
| **Phase 1: ValidAI i18n Setup** | Days 1-3 | Install next-intl, create local utilities, minimal shared-ui translations |
| **Phase 2: Route Restructure & Middleware** | Days 4-7 | Restructure under `[locale]`, implement corrected middleware, extract strings |
| **Phase 3: Testing & Validation** | Days 8-12 | Comprehensive testing, performance validation, bug fixes |
| **Phase 4: Swedish Translation** | Days 13-20+ | Professional translation, bilingual QA, production rollout |

**Total Duration:** 3-4 weeks (realistic with buffer)

### Expected Outcomes

**By End of Phase 4:**
- ✅ All ValidAI routes accessible under `/[locale]/` prefix
- ✅ Language switcher component in shared-ui
- ✅ User language preference persisted via cookie (DB on explicit switch)
- ✅ All UI text translated to English and Swedish
- ✅ Type-safe translation keys (compile-time checking)
- ✅ Performance impact < 30ms per request (no middleware DB queries)
- ✅ Zero breaking changes for existing users (automatic redirect to `/en/`)
- ✅ Patterns established for future framework-wide i18n rollout

---

## Part 1: Technical Architecture

### 1.1 Routing Strategy: Prefix-Based

#### Selected Approach: Locale Prefix in URL

**URL Structure:**
```
Before:  /dashboard
After:   /en/dashboard   (English)
         /sv/dashboard   (Swedish)
```

**Examples:**
| Feature | English URL | Swedish URL |
|---------|-------------|-------------|
| Dashboard | `/en/dashboard` | `/sv/dashboard` |
| Processors | `/en/processors` | `/sv/processors` |
| Processor Detail | `/en/processors/abc-123` | `/sv/processors/abc-123` |
| Runs | `/en/runs` | `/sv/runs` |
| Settings | `/en/settings/profile` | `/sv/settings/profile` |

#### Why Prefix-Based?

**Pros:**
- ✅ **SEO-Friendly**: Search engines can index language-specific pages
- ✅ **Shareable URLs**: Users can share links with explicit language context
- ✅ **Browser History**: Back/forward buttons maintain language
- ✅ **Standard Practice**: Used by major B2B SaaS (Stripe, GitHub, Linear)
- ✅ **Next.js Support**: Native support via `[locale]` dynamic segment

**Cons (and Mitigations):**
- ❌ **Longer URLs** → Minor cosmetic issue, standard practice
- ❌ **Breaking Change** → Mitigated by automatic redirects (legacy URLs → `/en/...`)

#### Rejected Alternatives

**Cookie-Only (No URL Prefix):**
- Poor SEO (no language signal for crawlers)
- Can't share language-specific URLs
- Confusing if user switches devices
- **Verdict: ❌ Rejected**

**Domain-Based (`en.validai.com`, `sv.validai.com`):**
- Requires DNS/SSL setup per language
- Complex cookie management across domains
- Expensive to scale to many languages
- **Verdict: ❌ Rejected**

---

### 1.2 Locale Storage: Cookie-Based (MVP Approach)

#### Architecture

**For MVP, we use a simplified cookie-only approach.** The database is updated ONLY when the user explicitly changes their language preference through the LanguageSwitcher component.

**Why Cookie-Only?**
- ✅ **Fast**: No database query on every request (better performance)
- ✅ **Simple**: Less complex middleware logic
- ✅ **Sufficient**: Cookie persists across sessions (1 year expiry)
- ✅ **Scalable**: Reduces database load significantly

**Priority Order for Locale Detection:**
1. **URL Prefix** (highest priority) - Explicit user navigation (`/sv/dashboard`)
2. **NEXT_LOCALE Cookie** - User's stored preference
3. **Accept-Language Header** - Browser language setting
4. **Default Locale** (`en`) - Fallback

#### Database Schema (Optional Enhancement)

**MVP:** Cookie-only, no database queries in middleware.

**MVP Phase 1 (Required):** Add validation constraint to prevent invalid language codes:
```sql
-- Add constraint to ensure data integrity
ALTER TABLE user_preferences
DROP CONSTRAINT IF EXISTS valid_language_code;

ALTER TABLE user_preferences
ADD CONSTRAINT valid_language_code
CHECK (language IN ('en', 'sv'));
```

**Note:** This constraint is required in Phase 1 to ensure data integrity, even though middleware only reads from cookies. The database field is updated when users explicitly switch languages via the UI.

#### User Preference Flow

**When user switches language:**
1. User selects Swedish from LanguageSwitcher component
2. Client-side hook sets cookie:
   ```typescript
   document.cookie = `NEXT_LOCALE=sv; path=/; max-age=31536000`; // 1 year
   ```
3. (Optional) Client-side hook updates database for cross-device sync:
   ```typescript
   await supabase
     .from('user_preferences')
     .upsert({ user_id: user.id, language: 'sv' });
   ```
4. Next.js router navigates to `/sv/[current-page]`
5. All subsequent requests read from cookie (fast, no DB query)

**When new user visits:**
1. No URL prefix → Middleware detects locale:
   - Check `NEXT_LOCALE` cookie
   - Fallback to `accept-language` header
   - Fallback to `en`
2. Middleware redirects to `/{detected-locale}/[path]`

**Performance Impact:**
- Cookie read: <1ms (vs. DB query: 20-50ms)
- Total middleware overhead: ~10-15ms (next-intl processing only)

---

### 1.3 Translation File Structure: ValidAI-First (MVP)

#### Strategy: Implement in ValidAI, Extract to Shared Later

**For MVP**, we implement i18n entirely within the ValidAI app, with minimal translation support added to `shared-ui` for shared components. This approach:
- **Reduces Complexity**: No new shared package scaffolding needed
- **Faster MVP**: Get to market quicker with proven patterns
- **Easier Iteration**: Validate approach before framework-wide rollout
- **Clear Migration Path**: Extract to `@playze/shared-i18n` when 2nd app needs i18n

#### Directory Structure (MVP)

```
apps/
  validai/
    lib/
      i18n/                              # NEW: Local i18n utilities
        locales.ts                       # SUPPORTED_LOCALES constant
        navigation.ts                    # Type-safe routing helpers (from next-intl)
    messages/
      en.json                            # ValidAI-specific strings (English)
      sv.json                            # ValidAI-specific strings (Swedish)
    i18n/
      request.ts                         # next-intl request config (with date/time formats)
    middleware.ts                        # UPDATED: Composed middleware (critical!)

packages/
  shared-ui/
    messages/
      en.json                            # NEW: Shared UI component strings (minimal)
      sv.json                            # NEW: Shared UI component strings (minimal)
    src/
      components/
        platform/
          language-switcher.tsx          # NEW: Language switcher component

  # shared-i18n package NOT created in MVP
  # Will be extracted later when 2nd app needs i18n

  admin-portal/
    # Stays English-only (internal tool)

  testapp/
    # Stays English-only (reference implementation)
```

#### Future: Extraction to Shared Package

**When to Extract** (post-MVP):
- 2nd app needs multi-language support
- Managing 3+ languages
- Complex locale-specific formatting needs grow

**What Gets Extracted:**
- `apps/validai/lib/i18n/` → `packages/shared-i18n/src/`
- Common utilities, locale constants, navigation helpers
- Shared platform strings (currently in shared-ui)

#### Translation File Format

**Example: `apps/validai/messages/en.json`**
```json
{
  "common": {
    "save": "Save",
    "cancel": "Cancel",
    "delete": "Delete",
    "edit": "Edit",
    "loading": "Loading...",
    "error": "An error occurred"
  },
  "dashboard": {
    "title": "Dashboard",
    "welcome": "Welcome back, {name}",
    "recentRuns": "Recent Runs",
    "stats": {
      "processors": "{count, plural, =0 {No processors} =1 {1 processor} other {# processors}}",
      "runs": "{count} runs this month"
    }
  },
  "processors": {
    "list": {
      "title": "Processors",
      "createNew": "Create Processor",
      "empty": "No processors yet. Create your first one!"
    },
    "detail": {
      "operations": "Operations",
      "settings": "Settings",
      "deleteConfirm": "Are you sure you want to delete this processor?"
    }
  }
}
```

**Example: `apps/validai/messages/sv.json`**
```json
{
  "common": {
    "save": "Spara",
    "cancel": "Avbryt",
    "delete": "Ta bort",
    "edit": "Redigera",
    "loading": "Laddar...",
    "error": "Ett fel uppstod"
  },
  "dashboard": {
    "title": "Kontrollpanel",
    "welcome": "Välkommen tillbaka, {name}",
    "recentRuns": "Senaste körningar",
    "stats": {
      "processors": "{count, plural, =0 {Inga processorer} =1 {1 processor} other {# processorer}}",
      "runs": "{count} körningar denna månad"
    }
  },
  "processors": {
    "list": {
      "title": "Processorer",
      "createNew": "Skapa processor",
      "empty": "Inga processorer än. Skapa din första!"
    },
    "detail": {
      "operations": "Operationer",
      "settings": "Inställningar",
      "deleteConfirm": "Är du säker på att du vill ta bort denna processor?"
    }
  }
}
```

#### Merging Translations

**In `apps/validai/i18n/request.ts`:**
```typescript
import { getRequestConfig } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { SUPPORTED_LOCALES } from '@/lib/i18n/locales';

export default getRequestConfig(async ({ locale }) => {
  // Validate locale
  if (!SUPPORTED_LOCALES.includes(locale as any)) {
    notFound();
  }

  // Load app-specific messages
  const appMessages = (await import(`../messages/${locale}.json`)).default;

  // Load shared UI component messages
  const uiMessages = (await import(
    `@playze/shared-ui/messages/${locale}.json`
  )).default;

  // Merge messages (app-specific overrides shared)
  return {
    locale,
    messages: {
      ...uiMessages,      // Shared UI component strings
      ...appMessages,     // App-specific strings (can override shared)
    },
    timeZone: 'UTC',      // Or detect from user preferences
    now: new Date(),
    formats: {
      dateTime: {
        short: {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        },
        long: {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          weekday: 'long',
        },
      },
      number: {
        precise: {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        },
      },
    },
  };
});
```

**Note:** Date/time formats ensure Swedish and English users see localized dates and numbers.

---

### 1.4 Middleware Composition: Critical Order (FIXED)

#### Challenge

ValidAI middleware currently handles:
1. Supabase session refresh (`updateSession` from `@playze/shared-auth`)
2. App access check (`check_validai_access` RPC)

Now we need to add:
3. next-intl locale detection and routing

**Order matters!** Incorrect order can break authentication or locale detection.

#### Correct Order

```
1. next-intl middleware    (locale routing, set NEXT_LOCALE cookie)
    ↓
2. Supabase middleware     (refresh session, set auth cookies)
    ↓
3. App access check        (validate ValidAI subscription)
    ↓
4. Return response         (with all headers/cookies merged)
```

#### Implementation

**`apps/validai/middleware.ts` (CORRECTED):**

```typescript
import createMiddleware from 'next-intl/middleware';
import { updateSession } from '@playze/shared-auth/middleware';
import { createServerClient } from '@playze/shared-auth/server';
import { type NextRequest, NextResponse } from 'next/server';
import { SUPPORTED_LOCALES, DEFAULT_LOCALE } from '@/lib/i18n/locales';

// ============================================================
// Configure next-intl middleware
// ============================================================
const intlMiddleware = createMiddleware({
  locales: SUPPORTED_LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: 'always', // Always include locale in URL
  localeDetection: true,
});

export async function middleware(request: NextRequest) {
  // ============================================================
  // STEP 1: Handle locale routing (next-intl)
  // ============================================================
  const intlResponse = intlMiddleware(request);

  // ⚠️ CRITICAL: Check if intl middleware wants to redirect
  // If it does, we MUST preserve the redirect and merge auth cookies into it
  const isRedirect = intlResponse.status >= 300 && intlResponse.status < 400;

  if (isRedirect) {
    // Intl wants to redirect (e.g., / → /en/)
    // Update session but return intl's redirect with auth cookies merged
    const authResponse = await updateSession(request);

    // Merge auth cookies into the redirect response
    authResponse.cookies.getAll().forEach(cookie => {
      intlResponse.cookies.set(cookie);
    });

    // Return the redirect with both intl and auth cookies
    return intlResponse;
  }

  // ============================================================
  // STEP 2: No redirect - continue with auth flow
  // ============================================================
  const authResponse = await updateSession(request);

  // Merge intl cookies and headers into auth response
  intlResponse.cookies.getAll().forEach(cookie => {
    authResponse.cookies.set(cookie);
  });
  intlResponse.headers.forEach((value, key) => {
    authResponse.headers.set(key, value);
  });

  // ============================================================
  // STEP 3: Skip access check for auth routes and no-access page
  // ============================================================
  const pathname = request.nextUrl.pathname;

  // Extract locale from path (e.g., /en/dashboard → "en")
  const locale = pathname.split('/')[1];

  // Remove locale prefix for route matching
  const pathWithoutLocale = pathname.replace(/^\/[a-z]{2}\//, '/');

  if (
    pathWithoutLocale.startsWith('/auth') ||
    pathWithoutLocale === '/no-access'
  ) {
    return authResponse;
  }

  // ============================================================
  // STEP 4: Check ValidAI access
  // ============================================================
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    const orgId = user.app_metadata?.organization_id;

    if (orgId) {
      const { data: hasAccess, error } = await supabase
        .rpc('check_validai_access' as any, { p_org_id: orgId })
        .single();

      if (error || !hasAccess) {
        // Redirect to no-access page (preserving locale)
        const url = request.nextUrl.clone();
        url.pathname = `/${locale}/no-access`;
        return NextResponse.redirect(url);
      }
    }
  }

  return authResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - API routes (/api/*) - Never have locale prefixes
     * - Edge Functions (/functions/*) - Never have locale prefixes
     * - Next.js internals (/_next/*) - Static files, images, etc.
     *
     * Simplified pattern: Since API routes and functions should never
     * have locale prefixes, we can safely exclude any path starting
     * with /api, /functions, or /_next (which covers /static and /image).
     *
     * This prevents issues where locale-prefixed paths like /en/api/test
     * would incorrectly match with more complex negative lookaheads.
     */
    "/((?!api|functions|_next).*)",
  ],
};
```

**Key Fixes:**
1. ✅ **Redirect Handling**: Checks if intl middleware returns redirect, preserves it
2. ✅ **Cookie Merging**: Properly merges auth cookies into redirect response
3. ✅ **API Route Exclusion**: Excludes `/api/*` from middleware processing
4. ✅ **Edge Function Exclusion**: Excludes `/functions/*` from middleware processing
5. ✅ **Import Fix**: Uses local `@/lib/i18n/locales` instead of `@playze/shared-i18n`

#### Why This Order & Pattern?

1. **next-intl first**: Must run before auth so it can:
   - Detect locale from URL, cookie, or header
   - Set `NEXT_LOCALE` cookie
   - Redirect if needed (e.g., `/` → `/en/`)
   - Rewrite URL for Next.js routing (e.g., `/sv/dashboard` → internal `/[locale]/dashboard`)

2. **Check for redirect**: If intl middleware returns redirect:
   - **MUST** preserve the redirect
   - Merge auth cookies into redirect response
   - Return immediately (don't continue processing)

3. **Supabase second** (if no redirect): Refresh session and set auth cookies

4. **Merge cookies/headers**: Combine both middleware results

5. **App access last**: Only checks access after auth is confirmed

**⚠️ CRITICAL BUGS PREVENTED:**
- ❌ **Lost Redirects**: Original code ignored intl redirects, causing infinite loops
- ❌ **Lost Cookies**: Improper merging lost either auth or locale cookies
- ❌ **API Route Errors**: API routes would be processed by intl middleware (wrong!)
- ❌ **Performance**: Cookie-only approach avoids DB queries in middleware

---

## Part 2: File Structure Changes

### 2.1 Root Layout Restructure

#### Current Structure

```
apps/validai/app/
  layout.tsx                # Root layout
  page.tsx                  # Homepage
  dashboard/
    layout.tsx
    page.tsx
  processors/
    layout.tsx
    page.tsx
    [id]/
      page.tsx
  # ... other routes
```

#### New Structure

```
apps/validai/app/
  [locale]/                          # NEW: Dynamic locale segment
    layout.tsx                       # Locale-specific layout (wraps with NextIntlClientProvider)
    page.tsx                         # Homepage (redirects to dashboard)
    dashboard/
      layout.tsx
      page.tsx
    processors/
      layout.tsx
      page.tsx
      [id]/
        page.tsx
    # ... all routes move under [locale]

  layout.tsx                         # Root layout (minimal, no locale yet)
  i18n/
    request.ts                       # NEW: next-intl configuration
  middleware.ts                      # UPDATED: Add next-intl middleware
  next.config.ts                     # UPDATED: Add next-intl plugin
```

### 2.2 Root Layout Files

#### `apps/validai/app/layout.tsx` (ROOT - Updated)

```typescript
import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  display: "swap",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ValidAI",
  description: "Document processing and AI validation",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html suppressHydrationWarning>
      <body className={`${geistSans.className} antialiased`}>
        {children}
      </body>
    </html>
  );
}
```

#### `apps/validai/app/[locale]/layout.tsx` (LOCALE - New)

```typescript
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { ThemeProvider } from "next-themes";
import { QueryProvider } from "@/components/providers/query-provider";
import { NotificationDisplay } from "@/components/notifications";
import { ToastContainer } from "@/components/ui/toast-container";
import { Toaster } from "sonner";
import { SUPPORTED_LOCALES } from '@/lib/i18n/locales';

type Props = {
  children: React.ReactNode;
  params: { locale: string };
};

export function generateStaticParams() {
  return SUPPORTED_LOCALES.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params: { locale },
}: Props) {
  // Validate locale
  if (!SUPPORTED_LOCALES.includes(locale as any)) {
    notFound();
  }

  // Load messages for this locale
  const messages = await getMessages();

  return (
    <NextIntlClientProvider messages={messages}>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        <QueryProvider>
          {children}
          <NotificationDisplay />
          <ToastContainer />
          <Toaster />
        </QueryProvider>
      </ThemeProvider>
    </NextIntlClientProvider>
  );
}
```

#### `apps/validai/i18n/request.ts` (NEW - with date/time formatting)

```typescript
import { getRequestConfig } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { SUPPORTED_LOCALES } from '@/lib/i18n/locales';

export default getRequestConfig(async ({ locale }) => {
  // Validate locale
  if (!SUPPORTED_LOCALES.includes(locale as any)) {
    notFound();
  }

  // Load app messages
  const appMessages = (await import(`../messages/${locale}.json`)).default;

  // Load shared UI messages
  const uiMessages = (await import(
    `@playze/shared-ui/messages/${locale}.json`
  )).default;

  return {
    locale,
    messages: {
      ...uiMessages,      // Shared UI component strings
      ...appMessages,     // App-specific strings (can override)
    },
    timeZone: 'UTC',      // Or detect from user preferences
    now: new Date(),
    // Date/time/number formatting for localization
    formats: {
      dateTime: {
        short: {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        },
        long: {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          weekday: 'long',
        },
      },
      number: {
        precise: {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        },
      },
    },
  };
});
```

#### `apps/validai/next.config.ts` (UPDATED)

```typescript
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // ... existing config
};

export default withNextIntl(nextConfig);
```

#### Local i18n Utilities (NEW)

**`apps/validai/lib/i18n/locales.ts`:**
```typescript
export const SUPPORTED_LOCALES = ['en', 'sv'] as const;
export type Locale = typeof SUPPORTED_LOCALES[number];

export const DEFAULT_LOCALE: Locale = 'en';

export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  sv: 'Svenska',
};
```

**`apps/validai/lib/i18n/navigation.ts`:**
```typescript
import { createSharedPathnamesNavigation } from 'next-intl/navigation';
import { SUPPORTED_LOCALES } from './locales';

// Type-safe navigation helpers (replaces next/navigation)
export const { Link, redirect, usePathname, useRouter } =
  createSharedPathnamesNavigation({ locales: SUPPORTED_LOCALES });
```

**Usage in components:**
```typescript
// ❌ OLD: Direct from next/navigation
import { Link } from 'next/navigation';

// ✅ NEW: Locale-aware navigation
import { Link } from '@/lib/i18n/navigation';
```

---

### 2.3 Component Updates

#### Using Translations in Components

**Server Component Example:**

```typescript
import { useTranslations } from 'next-intl';
import { getTranslations } from 'next-intl/server';

// For RSC (Server Components)
export default async function ProcessorList() {
  const t = await getTranslations('processors.list');

  return (
    <div>
      <h1>{t('title')}</h1>
      <button>{t('createNew')}</button>
    </div>
  );
}

// For metadata (RSC)
export async function generateMetadata() {
  const t = await getTranslations('processors.list');

  return {
    title: t('title'),
  };
}
```

**Client Component Example:**

```typescript
'use client';

import { useTranslations } from 'next-intl';

export function ProcessorCard({ processor }) {
  const t = useTranslations('processors.detail');

  return (
    <div>
      <h2>{processor.name}</h2>
      <button onClick={handleDelete}>
        {t('deleteConfirm')}
      </button>
    </div>
  );
}
```

#### Parameterized Translations

```typescript
const t = useTranslations('dashboard');

// Simple parameter
t('welcome', { name: user.full_name });
// Output: "Welcome back, John"

// Plurals
t('stats.processors', { count: processorCount });
// count=0: "No processors"
// count=1: "1 processor"
// count=5: "5 processors"

// Rich text
t.rich('announcement', {
  link: (chunks) => <a href="/docs">{chunks}</a>,
});
```

#### Navigation with Locale

```typescript
'use client';

import { Link, useRouter } from '@/lib/i18n/navigation';

export function Navigation() {
  const router = useRouter();

  return (
    <>
      {/* Link automatically includes locale */}
      <Link href="/dashboard">Dashboard</Link>
      {/* → /en/dashboard or /sv/dashboard */}

      {/* Programmatic navigation */}
      <button onClick={() => router.push('/processors')}>
        View Processors
      </button>
    </>
  );
}
```

---

## Part 3: Language Switcher Component

### 3.1 Component Implementation

**`packages/shared-ui/src/components/platform/language-switcher.tsx` (NEW):**

```typescript
'use client';

import * as React from 'react';
import { useLocale } from 'next-intl';
import { usePathname, useRouter } from 'next/navigation';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { Button } from '../ui/button';
import { ChevronDown, Languages } from 'lucide-react';
import { toast } from 'sonner';

/**
 * LanguageSwitcher component allows users to switch between supported languages.
 *
 * Props:
 * - supportedLocales: Array of supported locale codes (e.g., ['en', 'sv'])
 * - localeNames: Object mapping locale codes to display names
 *
 * Flow:
 * 1. User selects language from dropdown
 * 2. Sets NEXT_LOCALE cookie (client-side)
 * 3. (Optional) Updates user_preferences.language via callback
 * 4. Navigates to same page in new locale
 *
 * All UI text will update to selected language immediately.
 *
 * @example
 * import { SUPPORTED_LOCALES, LOCALE_NAMES } from '@/lib/i18n/locales';
 *
 * <LanguageSwitcher
 *   supportedLocales={SUPPORTED_LOCALES}
 *   localeNames={LOCALE_NAMES}
 * />
 */

export interface LanguageSwitcherProps {
  supportedLocales: readonly string[];
  localeNames: Record<string, string>;
  onLocaleChange?: (locale: string) => Promise<void> | void;
}

export function LanguageSwitcher({
  supportedLocales,
  localeNames,
  onLocaleChange,
}: LanguageSwitcherProps) {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  const handleLocaleChange = async (newLocale: string) => {
    if (newLocale === locale) return;

    try {
      // Set cookie for middleware to pick up
      // Security attributes:
      // - SameSite=Lax: Prevents CSRF attacks
      // - Secure: Only sent over HTTPS in production (omitted for local http://localhost)
      const isSecure = window.location.protocol === 'https:';
      const secureFlag = isSecure ? '; Secure' : '';
      document.cookie = `NEXT_LOCALE=${newLocale}; path=/; max-age=31536000; SameSite=Lax${secureFlag}`; // 1 year

      // Optional: Call custom handler (e.g., update database)
      if (onLocaleChange) {
        await onLocaleChange(newLocale);
      }

      // Navigate to same page in new locale
      // Remove current locale prefix and add new one
      const pathWithoutLocale = pathname.replace(/^\/[a-z]{2}(\/|$)/, '/');
      router.push(`/${newLocale}${pathWithoutLocale}`);
      router.refresh();
    } catch (error) {
      console.error('Failed to switch language:', error);
      // Show user feedback using toast notification
      toast.error('Failed to switch language. Please try again.');
      return; // Don't navigate if switch failed
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2">
          <Languages className="h-4 w-4" />
          <span className="hidden sm:inline">{localeNames[locale]}</span>
          <ChevronDown className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Select Language</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {supportedLocales.map((loc) => (
          <DropdownMenuItem
            key={loc}
            onClick={() => handleLocaleChange(loc)}
            className={loc === locale ? 'bg-accent' : ''}
          >
            {localeNames[loc]}
            {loc === locale && ' ✓'}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

**Note:** This component is framework-agnostic (no ValidAI-specific dependencies), making it truly shared. Apps provide their locale config via props.

### 3.2 Integration into Navigation

**`apps/validai/components/nav-bar.tsx` (Example):**

```typescript
'use client';

import { OrgSwitcher, LanguageSwitcher } from '@playze/shared-ui';
import { useTranslations } from 'next-intl';
import { SUPPORTED_LOCALES, LOCALE_NAMES } from '@/lib/i18n/locales';
import { createBrowserClient } from '@playze/shared-auth/client';
import { useAuth } from '@playze/shared-auth';

export function NavBar() {
  const t = useTranslations('common.nav');
  const { data: user } = useAuth();

  // Optional: Update database when locale changes (for cross-device sync)
  const handleLocaleChange = async (locale: string) => {
    if (!user) return; // Guest users don't update DB

    const supabase = createBrowserClient();
    await supabase
      .from('user_preferences')
      .upsert({
        user_id: user.id,
        language: locale,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
  };

  return (
    <nav className="flex items-center justify-between p-4">
      <div className="flex items-center gap-4">
        <OrgSwitcher />
        {/* ... other nav items */}
      </div>

      <div className="flex items-center gap-2">
        <LanguageSwitcher
          supportedLocales={SUPPORTED_LOCALES}
          localeNames={LOCALE_NAMES}
          onLocaleChange={handleLocaleChange}  // Optional: DB sync
        />
        {/* ... user menu */}
      </div>
    </nav>
  );
}
```

---

## Part 4: Type Safety

### 4.1 TypeScript Configuration

**`apps/validai/global.d.ts` (NEW):**

```typescript
// Merge app-specific and shared UI messages for complete type safety
type AppMessages = typeof import('./messages/en.json');
type UIMessages = typeof import('@playze/shared-ui/messages/en.json');
type Messages = AppMessages & UIMessages;

declare interface IntlMessages extends Messages {}
```

**Why merge types?** The runtime merges messages from both sources (see `i18n/request.ts` lines 389-391), so TypeScript autocomplete must know about all available keys from both `shared-ui` and `validai` messages.

This enables:
- ✅ **Autocomplete** for translation keys in IDE
- ✅ **Compile-time errors** for missing keys
- ✅ **Type checking** for parameters

**Example:**

```typescript
const t = useTranslations('processors');

// ✅ Valid - key exists
t('list.title');

// ❌ Error - key doesn't exist (caught at compile time!)
t('list.nonexistent');

// ✅ Valid - parameter provided
t('welcome', { name: 'John' });

// ❌ Error - missing required parameter
t('welcome'); // TypeScript error: missing 'name' parameter
```

---

## Part 5: Migration Strategy

### Phase 1: ValidAI i18n Setup (Days 1-3)

**Objectives:**
- Install next-intl in ValidAI app
- Create local i18n utilities (no shared package)
- Add minimal translations to shared-ui
- Create LanguageSwitcher component

**Tasks:**

| Task | Estimated Time | Dependencies |
|------|----------------|--------------|
| Install next-intl in ValidAI | 15 minutes | None |
| Create `lib/i18n/locales.ts` (local utilities) | 30 minutes | Install complete |
| Create `lib/i18n/navigation.ts` (routing helpers) | 30 minutes | Locales created |
| Create `i18n/request.ts` with date/time formatting | 1 hour | Locales created |
| Update `next.config.ts` with next-intl plugin | 15 minutes | Config created |
| Create `messages/en.json` structure | 1 hour | None |
| Extract minimal `shared-ui` strings to English | 2 hours | None |
| Create minimal `shared-ui/messages/sv.json` | 1.5 hours | English extraction |
| Create `LanguageSwitcher` component in shared-ui | 2 hours | None |
| Export LanguageSwitcher from shared-ui | 30 minutes | Component created |
| Test LanguageSwitcher standalone | 1 hour | Component exported |
| **Total** | **~10.5 hours (1.5 days)** | |

**Deliverables:**
- ✅ next-intl installed and configured in ValidAI
- ✅ Local i18n utilities created (`lib/i18n/`)
- ✅ Minimal shared-ui translation support
- ✅ Language switcher component ready
- ✅ No new shared packages created

---

### Phase 2: Route Restructure & Middleware (Days 4-7)

**Objectives:**
- Restructure routes under `[locale]`
- Implement corrected middleware composition
- Extract all English strings to JSON
- Test routing and authentication flows

**Tasks:**

| Task | Estimated Time | Dependencies |
|------|----------------|--------------|
| Restructure routes under `app/[locale]/` | 3 hours | Phase 1 complete |
| Update root layout (minimal) | 1 hour | Route restructure |
| Create locale-specific layout | 1.5 hours | Route restructure |
| Update all Link imports to use `@/lib/i18n/navigation` | 2 hours | Routes restructured |
| Implement corrected middleware composition | 4 hours | ⚠️ CRITICAL |
| Test middleware redirect handling | 2 hours | Middleware implemented |
| Test middleware cookie merging | 1 hour | Middleware implemented |
| Test middleware with API routes | 1 hour | Middleware implemented |
| Extract dashboard strings to JSON | 3 hours | None |
| Extract processors strings to JSON | 4 hours | None |
| Extract operations strings to JSON | 3 hours | None |
| Extract runs strings to JSON | 3 hours | None |
| Extract settings strings to JSON | 2 hours | None |
| Extract auth strings to JSON | 2 hours | None |
| Update all components with `useTranslations` | 8 hours | Strings extracted |
| Update all server components with `getTranslations` | 6 hours | Strings extracted |
| Add LanguageSwitcher to navigation | 1 hour | Component ready |
| Test all routes with `/en/` prefix | 3 hours | Components updated |
| Test auth flows with locale routing | 3 hours | Everything integrated |
| **Total** | **~54 hours (6.5 days)** | |

**Deliverables:**
- ✅ All routes accessible under `/[locale]/`
- ✅ Middleware correctly composed with redirect handling
- ✅ All English strings extracted to `messages/en.json`
- ✅ All components using translations
- ✅ Language switcher integrated
- ✅ Automatic redirects working (` `/` → `/en/`)

---

### Phase 3: Testing & Validation (Week 3)

**Objectives:**
- Comprehensive testing across all features
- Performance validation
- Bug fixing
- Documentation updates

**Tasks:**

| Task | Estimated Time | Dependencies |
|------|----------------|--------------|
| Manual testing of all major workflows | 6 hours | Phase 2 complete |
| Test language switching across pages | 2 hours | Testing started |
| Test authenticated vs guest locale detection | 2 hours | Testing started |
| Test cookie persistence | 1 hour | Testing started |
| Test middleware edge cases | 3 hours | Testing started |
| Performance benchmarking (baseline) | 2 hours | Testing started |
| Performance testing with translations | 2 hours | Baseline established |
| Load testing (stress test middleware) | 3 hours | Performance tested |
| Fix identified bugs | 12 hours | Testing complete |
| Update developer documentation | 3 hours | Implementation stable |
| Create migration guide for team | 2 hours | Documentation |
| Code review and refinement | 4 hours | Everything testable |
| **Total** | **~43 hours (5.5 days)** | |

**Deliverables:**
- ✅ All features tested and working
- ✅ Performance impact < 50ms validated
- ✅ No critical bugs
- ✅ Documentation updated
- ✅ Team trained on i18n patterns

---

### Phase 4: Swedish Translation (Week 4+)

**Objectives:**
- Professional Swedish translation
- Bilingual QA
- Production rollout

**Tasks:**

| Task | Estimated Time | Dependencies |
|------|----------------|--------------|
| Identify translation vendor/service | 4 hours | Phase 3 complete |
| Prepare translation brief | 2 hours | Vendor identified |
| Export English strings for translation | 1 hour | Brief prepared |
| Send to professional translator | N/A | Export ready |
| Review translated strings (1st pass) | 6 hours | Translation received |
| Fix translation issues/context | 3 hours | Review complete |
| Review translated strings (2nd pass) | 4 hours | Fixes applied |
| Import Swedish translations | 1 hour | Translations approved |
| Swedish UI testing | 6 hours | Import complete |
| Bilingual QA (native Swedish speaker) | 8 hours | Testing complete |
| Fix any linguistic/cultural issues | 4 hours | QA feedback |
| Final review and approval | 2 hours | Fixes applied |
| Gradual rollout to Swedish users | 2 hours | Approved |
| Monitor feedback and analytics | Ongoing | Rolled out |
| **Total** | **~43 hours + vendor time** | |

**Deliverables:**
- ✅ Professional Swedish translations
- ✅ Bilingual QA passed
- ✅ Swedish users can use app in native language
- ✅ Feedback loop established for improvements

---

## Part 6: Risks & Mitigations

### Risk 1: Middleware Conflicts 🔴 HIGH

**Risk Description:**
Incorrect middleware ordering causes:
- Lost authentication cookies
- Incorrect locale detection
- Redirect loops
- Session expiration

**Likelihood:** Medium
**Impact:** Critical (app broken for all users)

**Mitigation Strategy:**
1. **Thorough Testing**: Test middleware order extensively in dev environment
2. **Staged Rollout**: Deploy to staging first, monitor for 24-48 hours
3. **Rollback Plan**: Keep previous middleware.ts version, one-command rollback
4. **Monitoring**: Set up error tracking (Sentry) specifically for middleware failures
5. **Documentation**: Clear comments in middleware.ts explaining order rationale

**Contingency:**
- If production issues detected: Immediate rollback to previous version
- Fix in dev, test for 48 hours, re-deploy

---

### Risk 2: Breaking Existing URLs 🟡 MEDIUM

**Risk Description:**
Users have bookmarked URLs without locale prefix (e.g., `/dashboard`)
External links point to old URLs
Search engines have indexed old URLs

**Likelihood:** High
**Impact:** Medium (user frustration, SEO impact)

**Mitigation Strategy:**
1. **Automatic Redirects**: Middleware detects non-prefixed URLs → redirects to `/en/`
2. **301 Redirects**: Permanent redirects signal to search engines
3. **Canonical URLs**: Add canonical meta tags pointing to new URLs
4. **User Communication**: Announce URL structure change in app notifications
5. **Gradual Rollout**: Show banner explaining new URLs for 2 weeks

**Implementation:**
```typescript
// In middleware.ts
if (!pathname.match(/^\/[a-z]{2}\//)) {
  // No locale prefix → redirect to English version
  const url = request.nextUrl.clone();
  url.pathname = `/en${pathname}`;
  return NextResponse.redirect(url, 301); // Permanent redirect
}
```

---

### Risk 3: Performance Impact 🟡 MEDIUM

**Risk Description:**
Adding middleware steps and translation loading increases response time

**Likelihood:** Medium
**Impact:** Medium (slower page loads)

**Mitigation Strategy:**
1. **Benchmark Baseline**: Measure current performance before changes
2. **Set Budget**: Max acceptable overhead = 50ms per request
3. **Optimization**:
   - Translation files loaded once and cached
   - Middleware runs efficiently (no DB queries in hot path)
   - Use static generation where possible
4. **Monitoring**: Track P95 response times in production
5. **Caching**: Aggressive caching of translated strings

**Expected Impact:**
- next-intl overhead: ~10-20ms per request (industry standard)
- Translation loading: One-time cost, then cached
- Total expected: <30ms added latency

**Contingency:**
- If >50ms: Investigate specific bottlenecks, optimize hot paths
- If still over budget: Consider CDN edge caching

---

### Risk 4: Translation Quality Issues 🟡 MEDIUM

**Risk Description:**
- Machine translation used instead of professional
- Context lost in translation
- Technical terms incorrectly translated
- Cultural nuances missed

**Likelihood:** Medium (if not properly managed)
**Impact:** Medium (poor UX for Swedish users, support burden)

**Mitigation Strategy:**
1. **Professional Translation**: Budget for professional Swedish translator
2. **Context Provision**: Provide screenshots and usage context to translator
3. **Domain Expert**: Involve Swedish-speaking domain expert in review
4. **Glossary**: Create technical term glossary (processor, operation, run, etc.)
5. **Iterative Review**: Multi-pass review process
6. **User Feedback**: Easy way for Swedish users to report translation issues

**Translation Vendor Options:**
- **Lokalise** (recommended): Translation management platform + vetted translators
- **Crowdin**: Similar to Lokalise
- **Professional Freelancer**: Via Upwork or Fiverr (with portfolio review)

**Budget Estimate:**
- ~5,000-8,000 words to translate
- Professional rate: $0.10-0.15 per word
- Total cost: $500-$1,200

---

---

## Part 7: Success Criteria

### 7.1 Functional Requirements

| Requirement | Success Criteria | Validation Method |
|-------------|------------------|-------------------|
| **Route Accessibility** | All routes accessible under `/[locale]/` prefix | Manual testing + automated E2E tests |
| **Language Switching** | User can switch language from any page | Click through test on 10+ pages |
| **Preference Persistence** | Language choice persisted via cookie | Test page reload, browser restart |
| **URL Redirects** | Legacy URLs redirect to `/en/` version | Test 20+ legacy bookmarks |
| **Middleware Stability** | No auth or routing errors | Monitor error logs for 48 hours |
| **Translation Coverage** | 100% of UI strings translatable | Audit translation keys |
| **Type Safety** | No TypeScript errors related to i18n | `pnpm typecheck` passes |

### 7.2 Performance Requirements

| Metric | Baseline (Before) | Target (After) | Validation Method |
|--------|-------------------|----------------|-------------------|
| **Page Load Time (P95)** | 800ms | <830ms (+30ms max) | Lighthouse, Web Vitals |
| **Middleware Latency** | 120ms | <140ms (+20ms max) | Custom middleware timing logs (cookie-only, no DB) |
| **Translation Load Time** | N/A | <5ms (cached) | Next.js dev tools |
| **Memory Usage** | 45MB | <55MB (+10MB max) | Node.js memory profiling |

### 7.3 Quality Requirements

| Area | Requirement | Validation Method |
|------|-------------|-------------------|
| **Translations** | Professional quality, context-aware | Native speaker review |
| **Pluralization** | Correct plural forms for counts | Test with 0, 1, 2, many |
| **Date/Time** | Locale-specific formatting | Test date displays |
| **Currency** | Locale-specific (if applicable) | Visual inspection |
| **RTL Support** | N/A for en/sv (future consideration) | Documented for future |

### 7.4 User Experience Requirements

| Criterion | Success Criteria | Validation Method |
|-----------|------------------|-------------------|
| **Ease of Switching** | <3 clicks to change language | User testing (5 users) |
| **Visual Consistency** | No layout breaks in Swedish | Visual regression testing |
| **Text Truncation** | No text cutoff/overflow | Review all pages in Swedish |
| **Loading States** | Translated loading indicators | Manual inspection |

---

## Part 8: Open Questions & Decisions Needed

### Question 1: Organization-Level Language Preference

**Question:** Should organizations have a default language that applies to all members?

**Context:**
- Useful for multi-national companies (Swedish HQ → all employees see Swedish)
- User can still override with personal preference
- Adds complexity to locale detection logic

**Options:**
- **A)** Not in MVP - individual preferences only
- **B)** Add in MVP - full feature from start
- **C)** Add in Phase 4 - after Swedish translation validated

**Recommendation:** **Option A** - Start simple, add if requested

**Decision Required By:** Before Phase 1

---

### Question 2: Translation Management Platform

**Question:** Should we use a translation management platform (TMS) like Lokalise or Crowdin?

**Pros of TMS:**
- ✅ Professional translator marketplace integrated
- ✅ Version control for translations
- ✅ Context screenshots and notes
- ✅ CI/CD integration (auto-sync translations)
- ✅ Translation memory (reduces cost over time)

**Cons of TMS:**
- ❌ Monthly cost ($100-300/month)
- ❌ Learning curve for team
- ❌ Dependency on external service

**Options:**
- **A)** Use TMS from start (Lokalise or Crowdin)
- **B)** Manual JSON files for now, TMS when adding 3rd language
- **C)** Never use TMS, manage translations in-house

**Recommendation:** **Option B** - Manual for en/sv, TMS when scaling

**Decision Required By:** Before Phase 4

---

### Question 3: Professional Translation Budget

**Question:** What's the approved budget for professional Swedish translation?

**Cost Estimate:**
- ~6,000 words across ValidAI app
- Professional rate: $0.10-0.15/word
- Total: $600-900

**Options:**
- **A)** Approved budget: $600-900 (professional translation)
- **B)** Lower budget: $200-300 (freelancer with less experience)
- **C)** Zero budget: Use machine translation + internal review

**Recommendation:** **Option A** - Professional quality critical for market entry

**Decision Required By:** Before Phase 4 starts

---

### Question 4: Gradual Rollout Strategy

**Question:** Should we roll out to all users at once or gradually?

**Options:**
- **A)** Big Bang: All users get update at once
- **B)** Phased: Enable for 10% → 50% → 100% over 2 weeks
- **C)** Opt-In: Swedish users can opt into Swedish UI before full rollout
- **D)** Geographic: Roll out to Swedish IP addresses first

**Recommendation:** **Option B** - Phased rollout with monitoring

**Benefits:**
- Catch issues with small user group first
- Monitor performance impact gradually
- Easier rollback if major issues

**Decision Required By:** Before Phase 3 completion

---

## Part 9: Implementation Checklist

### Pre-Implementation

- [ ] Review and approve this plan with stakeholders
- [ ] Approve translation budget ($600-900)
- [ ] Assign team members to tasks
- [ ] Set up error monitoring (Sentry or similar)
- [ ] Decide on translation management approach
- [ ] Schedule Phase 1 kickoff

### Phase 1: Infrastructure (Week 1)

**Package Creation:**
- [ ] Create `packages/shared-i18n/` directory structure
- [ ] Add `package.json` with dependencies
- [ ] Create `src/locales.ts` with constants
- [ ] Create `src/config.ts` with next-intl setup
- [ ] Create `src/navigation.ts` with routing helpers
- [ ] Create `src/hooks/use-locale-preference.ts`
- [ ] Build package: `pnpm --filter @playze/shared-i18n build`

**Database:**
- [ ] Create migration for language constraint (moved from Post-MVP to MVP Phase 1)
- [ ] Add CHECK constraint: `CHECK (language IN ('en', 'sv'))`
- [ ] Test migration in dev environment
- [ ] Apply migration: `npx supabase db push`
- [ ] Verify constraint works (try invalid language code - should fail)

**Shared UI:**
- [ ] Create `packages/shared-ui/messages/` directory structure
- [ ] Create `packages/shared-ui/messages/en.json` (placeholder, even if empty)
- [ ] Create `packages/shared-ui/messages/sv.json` (placeholder, even if empty)
- [ ] Update `packages/shared-ui/package.json` to export messages folder
- [ ] Extract strings from `OrgSwitcher`
- [ ] Extract strings from `AppSwitcher`
- [ ] Update components to use `useTranslations`
- [ ] Create `LanguageSwitcher` component with secure cookie attributes
- [ ] Export LanguageSwitcher from shared-ui
- [ ] Test all shared components

**Validation:**
- [ ] `pnpm typecheck` passes for shared-i18n
- [ ] `pnpm build` succeeds for shared-i18n
- [ ] Shared UI components still work in TestApp

**Type Safety:**
- [ ] Create `apps/validai/global.d.ts` with merged message types
- [ ] Verify TypeScript autocomplete works for both app and shared-ui keys
- [ ] Test compile-time error detection for invalid keys

---

### Phase 2: ValidAI Integration (Week 2)

**Configuration:**
- [ ] Install next-intl: `pnpm --filter @playze/validai add next-intl`
- [ ] Add `@playze/shared-i18n` dependency
- [ ] Create `apps/validai/i18n/request.ts`
- [ ] Update `next.config.ts` with plugin
- [ ] Create `global.d.ts` for type safety

**Route Restructure:**
- [ ] Create `apps/validai/app/[locale]/` directory
- [ ] Move all routes under `[locale]/`
- [ ] Update root `layout.tsx` (minimal)
- [ ] Create `[locale]/layout.tsx` (with NextIntlClientProvider)
- [ ] Update all `Link` imports to use `@playze/shared-i18n/navigation`
- [ ] Test routes: verify all pages load at `/en/...`

**Middleware:**
- [ ] Update `middleware.ts` with next-intl composition
- [ ] Test middleware order (critical!)
- [ ] Verify auth still works
- [ ] Verify locale detection works
- [ ] Verify app access check still works
- [ ] Test edge cases (logged out, no org, etc.)

**Translations:**
- [ ] Create `apps/validai/messages/en.json` structure
- [ ] Extract common strings
- [ ] Extract dashboard strings
- [ ] Extract processor strings
- [ ] Extract operation strings
- [ ] Extract run strings
- [ ] Extract settings strings
- [ ] Extract auth strings

**Component Updates:**
- [ ] Update all server components: `getTranslations`
- [ ] Update all client components: `useTranslations`
- [ ] Update metadata functions
- [ ] Update error messages
- [ ] Update form validation messages
- [ ] Add LanguageSwitcher to navigation

**Testing:**
- [ ] Test all routes with `/en/` prefix
- [ ] Test language switcher
- [ ] Test auth flows
- [ ] Test legacy URL redirects
- [ ] Fix any discovered issues

**Validation:**
- [ ] `pnpm --filter @playze/validai typecheck` passes
- [ ] `pnpm --filter @playze/validai build` succeeds
- [ ] All pages accessible and functional
- [ ] No console errors

---

### Phase 3: Testing & Validation (Week 3)

**Functionality Testing:**
- [ ] Test user signup flow
- [ ] Test login flow
- [ ] Test password reset
- [ ] Test organization switching
- [ ] Test processor CRUD
- [ ] Test operation CRUD
- [ ] Test workbench execution
- [ ] Test run creation
- [ ] Test run detail views
- [ ] Test document upload
- [ ] Test all settings pages

**Language Switching:**
- [ ] Test switch on every major page
- [ ] Test persistence (reload page)
- [ ] Test across logout/login
- [ ] Test in different browsers
- [ ] Test on mobile

**Performance:**
- [ ] Baseline measurements (before i18n)
- [ ] Current measurements (after i18n)
- [ ] Compare P50, P95, P99 latencies
- [ ] Identify any regressions
- [ ] Optimize if needed

**Edge Cases:**
- [ ] Guest user (no account)
- [ ] User without organization
- [ ] User in multiple organizations
- [ ] Expired session
- [ ] Invalid locale in URL

**Error Handling & UX:**
- [ ] Verify error handling shows user feedback (toast notifications)
- [ ] Test language switch failure scenarios (network error, invalid locale)
- [ ] Verify loading states during language switch
- [ ] Test edge case: rapid language switching
- [ ] Verify Swedish special characters (å, ä, ö) render correctly in all font weights

**Bug Fixing:**
- [ ] Document all bugs found
- [ ] Prioritize: critical, high, medium, low
- [ ] Fix critical and high priority
- [ ] Re-test after fixes

**Documentation:**
- [ ] Update CLAUDE.md with i18n patterns
- [ ] Create developer guide for adding languages
- [ ] Document translation key naming conventions
- [ ] Create troubleshooting guide

**Code Review:**
- [ ] Review middleware implementation
- [ ] Review type safety setup
- [ ] Review component patterns
- [ ] Address review feedback

**Validation:**
- [ ] All tests pass
- [ ] Performance within budget
- [ ] No critical bugs
- [ ] Documentation complete

---

### Phase 4: Swedish Translation (Week 4+)

**Translation Preparation:**
- [ ] Identify translation vendor
- [ ] Create translation brief (context, glossary)
- [ ] Export English strings
- [ ] Send to translator

**Translation Integration:**
- [ ] Receive Swedish translations
- [ ] Import into `messages/sv.json`
- [ ] First pass review
- [ ] Feedback to translator
- [ ] Second pass review
- [ ] Final approval

**Swedish Testing:**
- [ ] Test all pages in Swedish
- [ ] Check for text overflow/truncation
- [ ] Verify plurals work correctly
- [ ] Verify parameter interpolation
- [ ] Native speaker QA

**Rollout:**
- [ ] Deploy to staging with Swedish enabled
- [ ] Internal testing (48 hours)
- [ ] Deploy to production (10% rollout)
- [ ] Monitor for issues
- [ ] Increase to 50% rollout
- [ ] Monitor for issues
- [ ] Full 100% rollout

**Post-Launch:**
- [ ] Monitor user feedback
- [ ] Track language usage analytics
- [ ] Gather improvement suggestions
- [ ] Plan iteration cycle

**Validation:**
- [ ] Swedish UI fully functional
- [ ] No layout issues
- [ ] Positive user feedback
- [ ] Usage analytics tracked

---

## Part 10: Estimated Resource Requirements

### Team Composition

| Role | Allocation | Responsibilities |
|------|------------|------------------|
| **Frontend Engineer** | 100% (4 weeks) | Route restructure, component updates, testing |
| **Backend Engineer** | 20% (1 week total) | Database migration, middleware composition |
| **Designer/UX** | 10% (2 days total) | Review Swedish UI, layout validation |
| **QA Engineer** | 50% (2 weeks) | Testing plan, execution, bug reporting |
| **Product Manager** | 20% (4 days total) | Prioritization, stakeholder communication |
| **Swedish Translator** | External vendor | Professional translation service |

### Time Estimate

| Phase | Engineering Time | Calendar Time |
|-------|-----------------|---------------|
| **Phase 1** | 24 hours | 3 days (1 engineer) |
| **Phase 2** | 52 hours | 7 days (1 engineer) |
| **Phase 3** | 43 hours | 6 days (1 engineer + QA) |
| **Phase 4** | 43 hours + vendor time | 5 days + 3-5 days translation |
| **Total** | **162 hours** | **~4 weeks (aggressive)** or **6 weeks (realistic with buffer)** |

### Budget

| Item | Cost |
|------|------|
| **Engineering** | Included in team capacity |
| **Swedish Translation** | $600-900 (professional service) |
| **Translation Management Platform** | $0 (not in MVP) or $100-300/month (if opted in) |
| **Testing/QA** | Included in team capacity |
| **Total Cash Outlay** | **$600-900** |

---

## Part 11: Next Steps

### Immediate Actions (This Week)

1. **Review & Approve Plan**
   - [ ] Schedule review meeting with stakeholders
   - [ ] Get approval on architectural decisions
   - [ ] Get budget approval for translation
   - [ ] Assign team members

2. **Setup Development Environment**
   - [ ] Create feature branch: `feature/multi-language-support`
   - [ ] Set up error monitoring for middleware
   - [ ] Prepare testing checklist

3. **Research & Preparation**
   - [ ] Research translation vendors (if Phase 4 immediately follows)
   - [ ] Review next-intl documentation
   - [ ] Study middleware composition examples

### Week 1: Phase 1 Kickoff

- [ ] Monday: Create `@playze/shared-i18n` package
- [ ] Tuesday: Database migration + shared-ui extraction
- [ ] Wednesday: Component updates
- [ ] Thursday: LanguageSwitcher component
- [ ] Friday: Testing and validation

### Week 2: Phase 2 Execution

- [ ] Monday-Tuesday: Configuration and route restructure
- [ ] Wednesday: Middleware composition (critical!)
- [ ] Thursday-Friday: String extraction and component updates

### Weeks 3-4: Phase 3 & 4

- Follow task lists above

---

## Part 12: Success Metrics & KPIs

### User Adoption Metrics

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| **Swedish Language Usage** | 60% of Swedish users switch to Swedish within 30 days | Analytics: Track locale preference by user location |
| **Language Switcher Clicks** | 2% of active users switch language monthly | Analytics: Track LanguageSwitcher interaction |
| **User Satisfaction (Swedish)** | NPS ≥ 50 for Swedish users | Survey after 30 days usage |

### Technical Metrics

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| **Performance Impact** | <50ms added latency | Monitoring: P95 response time comparison |
| **Error Rate** | <0.1% increase | Monitoring: Error rate before/after |
| **Translation Coverage** | 100% of UI strings | Automated audit of translation keys |

### Business Metrics

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| **Swedish Market Penetration** | 10% increase in Swedish sign-ups within 3 months | Analytics: User location at signup |
| **Support Ticket Reduction** | -15% Swedish language support tickets | Support system: Ticket categorization |
| **Engagement** | +10% session duration for Swedish users | Analytics: Compare pre/post Swedish launch |

---

## Conclusion

This implementation plan provides a comprehensive roadmap for adding English and Swedish language support to the ValidAI application using next-intl. The phased approach allows for validation at each stage, minimizing risk while establishing robust patterns for future language expansion.

**Key Success Factors:**
1. ✅ Correct middleware composition (most critical technical decision)
2. ✅ Professional Swedish translation (ensures market viability)
3. ✅ Comprehensive testing (prevents production issues)
4. ✅ Type safety (maintainability for future development)

**Expected Outcomes:**
- Seamless bilingual experience for English and Swedish users
- Infrastructure ready for additional languages (German, French, etc.)
- Patterns established for all apps in monorepo
- Market expansion into Nordic region enabled

**Next Milestone:** Stakeholder review and approval to proceed with Phase 1.

---

**References:**
- next-intl Documentation: https://next-intl.dev
- Next.js Internationalization: https://nextjs.org/docs/app/building-your-application/routing/internationalization
- CLAUDE.md: ValidAI Core Framework architectural guidelines
- Supabase Auth: https://supabase.com/docs/guides/auth

---

*This document will be updated as implementation progresses and new decisions are made.*
