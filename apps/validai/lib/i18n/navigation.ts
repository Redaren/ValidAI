/**
 * Type-safe navigation helpers for locale-aware routing.
 *
 * These helpers replace Next.js navigation imports (next/navigation)
 * to automatically handle locale prefixes in URLs.
 *
 * Usage:
 * ```typescript
 * // ❌ OLD: Direct from next/navigation
 * import { Link } from 'next/navigation';
 *
 * // ✅ NEW: Locale-aware navigation
 * import { Link } from '@/lib/i18n/navigation';
 *
 * // Links automatically include locale: /en/dashboard or /sv/dashboard
 * <Link href="/dashboard">Dashboard</Link>
 * ```
 */

import { createNavigation } from 'next-intl/navigation';
import { SUPPORTED_LOCALES } from './locales';

// Type-safe navigation helpers (replaces next/navigation)
export const { Link, redirect, usePathname, useRouter } =
  createNavigation({ locales: SUPPORTED_LOCALES });
