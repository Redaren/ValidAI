'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createBrowserClient } from '@playze/shared-auth/client'
import { useCurrentOrganization } from '@playze/shared-auth'
import { Button, OrgSwitcher, AppSwitcher } from '@playze/shared-ui'
import { ArrowLeft, Users, LogOut, Loader2 } from 'lucide-react'
import { useState } from 'react'

const settingsNavItems = [
  {
    href: '/settings/members',
    label: 'Members',
    icon: Users,
  },
  // Future navigation items can be added here:
  // { href: '/settings/profile', label: 'Profile', icon: UserCircle },
  // { href: '/settings/subscriptions', label: 'Subscriptions', icon: CreditCard },
]

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const { data: currentOrg, isLoading: orgLoading } = useCurrentOrganization()
  const [signingOut, setSigningOut] = useState(false)

  const handleSignOut = async () => {
    setSigningOut(true)
    try {
      const supabase = createBrowserClient()
      await supabase.auth.signOut()
      router.push('/login')
    } catch (error) {
      console.error('Error signing out:', error)
      setSigningOut(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/dashboard">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Dashboard
              </Button>
            </Link>
            <div className="h-6 w-px bg-border" />
            <h1 className="text-xl font-semibold text-foreground">Settings</h1>
            {!orgLoading && currentOrg && (
              <span className="text-sm text-muted-foreground">
                {currentOrg.name}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <OrgSwitcher />
            <AppSwitcher currentApp="testapp" />
            <Button
              onClick={handleSignOut}
              variant="outline"
              size="sm"
              disabled={signingOut}
            >
              {signingOut ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <LogOut className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <div className="flex gap-8">
          {/* Sidebar Navigation */}
          <aside className="w-48 flex-shrink-0">
            <nav className="space-y-1">
              {settingsNavItems.map((item) => {
                const isActive = pathname === item.href
                const Icon = item.icon
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                )
              })}
            </nav>
          </aside>

          {/* Main Content */}
          <main className="flex-1 min-w-0">
            {children}
          </main>
        </div>
      </div>
    </div>
  )
}
