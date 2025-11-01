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
 * - onLocaleChange: Optional callback for additional actions (e.g., update database)
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
