'use client'

import dynamic from 'next/dynamic'
import { Loader2 } from 'lucide-react'

/**
 * Dashboard Page
 *
 * This page uses dynamic import with ssr:false to prevent hydration issues.
 * The DashboardContent component is only rendered on the client side.
 *
 * Why no SSR?
 * - This is a reference app to help developers understand Playze Core
 * - SSR adds complexity without benefit for a protected dashboard
 * - Client-only rendering prevents hydration mismatches
 * - Icons (lucide-react) render consistently
 * - Consistent with login page approach
 *
 * The loading state shows a spinner while the client-side JavaScript loads.
 */
const DashboardContent = dynamic(() => import('./dashboard-content'), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  ),
})

export default function DashboardPage() {
  return <DashboardContent />
}
