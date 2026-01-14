'use client'

import dynamic from 'next/dynamic'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { Loader2 } from 'lucide-react'
import { OrgPickerLogin } from '@playze/shared-ui'

/**
 * Login Page
 *
 * This page handles two scenarios:
 * 1. Normal login - shows the LoginForm for email/magic link entry
 * 2. Org selection - shows OrgPickerLogin when ?select-org=true
 *
 * The OrgPickerLogin is shown when a user with multiple organizations
 * completes authentication and needs to select which org to use.
 */
const LoginForm = dynamic(() => import('./login-form'), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  ),
})

function LoginContent() {
  const searchParams = useSearchParams()
  const showOrgPicker = searchParams.get('select-org') === 'true'

  if (showOrgPicker) {
    return (
      <OrgPickerLogin
        appName="TestApp"
        fallbackUrl="/dashboard"
      />
    )
  }

  return <LoginForm />
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    }>
      <LoginContent />
    </Suspense>
  )
}
