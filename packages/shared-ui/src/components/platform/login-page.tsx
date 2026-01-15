'use client'

import dynamic from 'next/dynamic'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { Loader2 } from 'lucide-react'
import { OrgPickerLogin } from './org-picker-login'

// Dynamically import MagicLinkLoginForm to prevent SSR issues
// Magic link tokens are passed in URL hash, which is only accessible client-side
const MagicLinkLoginForm = dynamic(
  () => import('./magic-link-login-form').then((mod) => ({ default: mod.MagicLinkLoginForm })),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    ),
  }
)

export interface LoginPageProps {
  /** Application name displayed in the header */
  appName: string
  /** Optional icon component for the app */
  appIcon?: React.ReactNode
  /** Path to redirect after org selection (default: '/dashboard') */
  dashboardPath?: string
  /** Whether to show OrgPickerLogin instead of MagicLinkLoginForm */
  selectOrg?: boolean
  /** For OrgPickerLogin: stay on current app after selection (default: true) */
  stayOnCurrentApp?: boolean
  /** Path for the auth callback (default: '/auth/callback') */
  callbackPath?: string
  /** Subtitle text for the login form */
  subtitle?: string
  /** Additional CSS classes */
  className?: string
}

/**
 * Internal component that reads URL search params
 * Must be wrapped in Suspense because useSearchParams requires it
 */
function LoginPageContent({
  appName,
  appIcon,
  dashboardPath = '/dashboard',
  selectOrg,
  stayOnCurrentApp = true,
  callbackPath = '/auth/callback',
  subtitle,
  className,
}: LoginPageProps) {
  const searchParams = useSearchParams()

  // Check if org picker should be shown (from prop or URL param)
  const showOrgPicker = selectOrg ?? searchParams.get('select-org') === 'true'

  if (showOrgPicker) {
    return (
      <OrgPickerLogin
        appName={appName}
        appIcon={appIcon}
        fallbackUrl={dashboardPath}
        stayOnCurrentApp={stayOnCurrentApp}
        className={className}
      />
    )
  }

  return (
    <MagicLinkLoginForm
      appName={appName}
      appIcon={appIcon}
      callbackPath={callbackPath}
      subtitle={subtitle}
      className={className}
    />
  )
}

/**
 * Login Page Component
 *
 * A complete login page that handles two scenarios:
 * 1. Normal login - shows MagicLinkLoginForm for email/magic link entry
 * 2. Org selection - shows OrgPickerLogin when selectOrg=true or ?select-org=true
 *
 * The OrgPickerLogin is shown when a user with multiple organizations
 * completes authentication and needs to select which org to use.
 *
 * @example
 * ```tsx
 * // In apps/myapp/app/login/page.tsx
 * import { LoginPage } from '@playze/shared-ui'
 *
 * export default function Page() {
 *   return <LoginPage appName="MyApp" />
 * }
 * ```
 */
export function LoginPage(props: LoginPageProps) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      }
    >
      <LoginPageContent {...props} />
    </Suspense>
  )
}
