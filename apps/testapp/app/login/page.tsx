'use client'

import dynamic from 'next/dynamic'
import { Loader2 } from 'lucide-react'

/**
 * Login Page
 *
 * This page uses dynamic import with ssr:false to prevent hydration issues.
 * The LoginForm component is only rendered on the client side.
 *
 * Why no SSR?
 * - This is a reference app to help developers understand Playze Core
 * - SSR adds complexity without benefit for a login page
 * - Client-only rendering prevents hydration mismatches
 * - Icons (lucide-react) render consistently
 *
 * The loading state shows a spinner while the client-side JavaScript loads.
 */
const LoginForm = dynamic(() => import('./login-form'), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  ),
})

export default function LoginPage() {
  return <LoginForm />
}
