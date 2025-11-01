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
  params: Promise<{ locale: string }>;
};

/**
 * Generate static params for all supported locales.
 * This enables static generation at build time for each locale.
 */
export function generateStaticParams() {
  return SUPPORTED_LOCALES.map((locale) => ({ locale }));
}

/**
 * Locale-specific layout that wraps all localized routes.
 * Provides:
 * - next-intl client provider with messages
 * - Theme provider
 * - Query provider (TanStack Query)
 * - Notification displays (toast, sonner)
 */
export default async function LocaleLayout({
  children,
  params,
}: Props) {
  // Await params (Next.js 15+ requirement)
  const { locale } = await params;

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
        defaultTheme="light"
        themes={['light', 'dark', 'claude-light', 'claude-dark']}
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
