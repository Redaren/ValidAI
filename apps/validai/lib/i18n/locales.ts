/**
 * Supported locales for ValidAI application.
 *
 * Used by:
 * - middleware.ts: Locale detection and routing
 * - i18n/request.ts: Message loading configuration
 * - LanguageSwitcher component: UI for switching languages
 */

export const SUPPORTED_LOCALES = ['en', 'sv', 'uk'] as const;
export type Locale = typeof SUPPORTED_LOCALES[number];

export const DEFAULT_LOCALE: Locale = 'en';

export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  sv: 'Svenska',
  uk: 'Українська',
};
