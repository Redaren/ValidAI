/**
 * next-intl configuration for request-time message loading.
 *
 * This file:
 * 1. Validates the requested locale
 * 2. Loads app-specific messages from /messages/{locale}.json
 * 3. Loads shared UI messages from @playze/shared-ui/messages/{locale}.json
 * 4. Merges messages (app-specific can override shared)
 * 5. Configures date/time/number formatting
 *
 * Called automatically by next-intl plugin during SSR.
 */

import { getRequestConfig } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { SUPPORTED_LOCALES } from '@/lib/i18n/locales';

export default getRequestConfig(async ({ locale }) => {
  // Validate locale
  if (!locale || !SUPPORTED_LOCALES.includes(locale as any)) {
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
    locale: locale,
    messages: {
      ...uiMessages,      // Shared UI component strings
      ...appMessages,     // App-specific strings (can override shared)
    },
    timeZone: 'UTC' as const,      // Or detect from user preferences
    now: new Date(),
    // Date/time/number formatting for localization
    formats: {
      dateTime: {
        short: {
          day: 'numeric' as const,
          month: 'short' as const,
          year: 'numeric' as const,
        },
        long: {
          day: 'numeric' as const,
          month: 'long' as const,
          year: 'numeric' as const,
          weekday: 'long' as const,
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
