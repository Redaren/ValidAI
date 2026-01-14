'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@playze/shared-auth/client'
import { useCurrentOrganization, useUserOrganizations, useAuthorization } from '@playze/shared-auth'
import { Button, Card, AppSwitcher, OrgSwitcher, AuthGate } from '@playze/shared-ui'
import { LogOut, User, Loader2, Building2, Grid3x3, Crown, Shield, Edit3 } from 'lucide-react'
import type { User as SupabaseUser } from '@supabase/supabase-js'

/**
 * Dashboard Content Component
 *
 * This component contains all dashboard functionality and is dynamically
 * imported with ssr:false to prevent hydration issues.
 *
 * Features:
 * - User authentication display
 * - Sign-out functionality
 * - Protected content display
 * - Session management
 * - Authorization context via useAuthorization hook
 */
export default function DashboardContent() {
  const [user, setUser] = useState<SupabaseUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [signingOut, setSigningOut] = useState(false)
  const router = useRouter()

  // Organization context from shared-auth hooks
  const { data: currentOrg } = useCurrentOrganization()
  const { data: userOrgs } = useUserOrganizations()

  // Use the new useAuthorization hook for complete auth context in one query
  const { data: auth } = useAuthorization('testapp')

  useEffect(() => {
    const supabase = createBrowserClient()

    // Get initial user
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
      setLoading(false)
    }

    getUser()

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null)
      }
    )

    return () => {
      subscription.unsubscribe()
    }
  }, [])

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

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-foreground">TestApp</h1>
            <span className="text-sm text-muted-foreground">
              Phase 2 - New Auth Flows
            </span>
          </div>
          <div className="flex items-center gap-3">
            {/* Organization Switcher */}
            <OrgSwitcher />

            {/* App Switcher */}
            <AppSwitcher currentApp="testapp" />

            {/* Sign Out */}
            <Button
              onClick={handleSignOut}
              variant="outline"
              disabled={signingOut}
            >
              {signingOut ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing out...
                </>
              ) : (
                <>
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign Out
                </>
              )}
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Welcome Card */}
          <Card className="p-6">
            <div className="flex items-start gap-4">
              <div className="rounded-full bg-primary/10 p-3">
                <User className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-semibold text-foreground mb-2">
                  Welcome to TestApp!
                </h2>
                <p className="text-muted-foreground mb-4">
                  You are successfully authenticated and viewing the dashboard.
                </p>
                <div className="bg-muted rounded-lg p-4 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-foreground">Email:</span>
                    <span className="text-sm text-muted-foreground">{user?.email}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-foreground">User ID:</span>
                    <span className="text-sm text-muted-foreground font-mono text-xs">
                      {user?.id}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* Organization Context Card */}
          <Card className="p-6">
            <div className="flex items-start gap-4">
              <div className="rounded-full bg-green-100 dark:bg-green-900 p-3">
                <Building2 className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-semibold text-foreground mb-2">
                  Organization Context
                </h2>
                <p className="text-muted-foreground mb-4">
                  Multi-tenancy is a core feature of ValidAI Core. You can switch between organizations using the switcher in the header.
                </p>
                <div className="bg-muted rounded-lg p-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-foreground">Current Organization:</span>
                    <span className="text-sm text-muted-foreground">
                      {auth?.organization_name || currentOrg?.name || 'Loading...'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-foreground">Organization ID:</span>
                    <span className="text-sm text-muted-foreground font-mono text-xs">
                      {auth?.organization_id || currentOrg?.id || 'Loading...'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-foreground">Your Role:</span>
                    <span className="text-sm text-muted-foreground capitalize">
                      {auth?.user_role || 'Loading...'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-foreground">Current App:</span>
                    <span className="text-sm text-muted-foreground">
                      {auth?.app_name || 'Loading...'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-foreground">Subscription Tier:</span>
                    <span className="text-sm text-muted-foreground capitalize">
                      {auth?.tier_display_name || 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-foreground">Your Organizations:</span>
                    <span className="text-sm text-muted-foreground">
                      {userOrgs?.length || 0} total
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* App Access Card */}
          <Card className="p-6">
            <div className="flex items-start gap-4">
              <div className="rounded-full bg-purple-100 dark:bg-purple-900 p-3">
                <Grid3x3 className="h-6 w-6 text-purple-600 dark:text-purple-400" />
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-semibold text-foreground mb-2">
                  App Switcher Demo
                </h2>
                <p className="text-muted-foreground mb-4">
                  The app switcher in the header shows all apps your organization has access to. It reads from your JWT accessible_apps claim.
                </p>
                <div className="bg-muted rounded-lg p-4 space-y-2 text-sm text-muted-foreground">
                  <p><strong className="text-foreground">TestApp:</strong> You are here (reference implementation)</p>
                  <p><strong className="text-foreground">ValidAI:</strong> Document processing and AI validation</p>
                  <p><strong className="text-foreground">Admin Portal:</strong> Platform administration (admins only)</p>
                  <p className="text-xs pt-2 italic">
                    Note: App switching navigates to the app&apos;s configured URL from the database.
                  </p>
                </div>
              </div>
            </div>
          </Card>

          {/* Professional Tier Feature Demo - Feature Gated */}
          <AuthGate appId="testapp" feature="professional_demo">
            <Card className="p-6 bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-950 dark:to-yellow-950 border-amber-200 dark:border-amber-800">
              <div className="flex items-start gap-4">
                <div className="rounded-full bg-amber-100 dark:bg-amber-900 p-3">
                  <Crown className="h-6 w-6 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="flex-1">
                  <h2 className="text-xl font-semibold text-foreground mb-2">
                    Professional Tier Feature
                  </h2>
                  <p className="text-muted-foreground mb-4">
                    This is a feature that you see because you have the Professional tier.
                  </p>
                  <div className="bg-amber-100/50 dark:bg-amber-900/30 rounded-lg p-4 space-y-2">
                    <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                      Feature Gating Demo
                    </p>
                    <p className="text-sm text-amber-800 dark:text-amber-200">
                      This card demonstrates the ValidAI Core feature gating system in action:
                    </p>
                    <ul className="list-disc list-inside space-y-1 ml-2 text-sm text-amber-800 dark:text-amber-200">
                      <li>Uses <code className="bg-amber-200/50 dark:bg-amber-800/50 px-1 rounded">AuthGate</code> component from @playze/shared-ui</li>
                      <li>Checks <code className="bg-amber-200/50 dark:bg-amber-800/50 px-1 rounded">professional_demo</code> feature via get_user_authorization()</li>
                      <li>Free tier users see an upgrade prompt instead</li>
                      <li>Switch organizations to test different tier behaviors</li>
                    </ul>
                    <p className="text-xs text-amber-700 dark:text-amber-300 pt-2 italic">
                      Try switching to a Free tier organization to see the upgrade prompt!
                    </p>
                  </div>
                </div>
              </div>
            </Card>
          </AuthGate>

          {/* Role-Based Permission Demo - Permission Gated */}
          <AuthGate appId="testapp" permission="can_edit">
            <Card className="p-6 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950 dark:to-emerald-950 border-green-200 dark:border-green-800">
              <div className="flex items-start gap-4">
                <div className="rounded-full bg-green-100 dark:bg-green-900 p-3">
                  <Edit3 className="h-6 w-6 text-green-600 dark:text-green-400" />
                </div>
                <div className="flex-1">
                  <h2 className="text-xl font-semibold text-foreground mb-2">
                    Edit Permission Feature
                  </h2>
                  <p className="text-muted-foreground mb-4">
                    This is a feature you see because you have edit permissions (your role: {auth?.user_role}).
                  </p>
                  <div className="bg-green-100/50 dark:bg-green-900/30 rounded-lg p-4 space-y-2">
                    <p className="text-sm font-medium text-green-900 dark:text-green-100">
                      Role-Based Permission Demo
                    </p>
                    <p className="text-sm text-green-800 dark:text-green-200">
                      This demonstrates role-based permissions:
                    </p>
                    <ul className="list-disc list-inside space-y-1 ml-2 text-sm text-green-800 dark:text-green-200">
                      <li>Uses <code className="bg-green-200/50 dark:bg-green-800/50 px-1 rounded">AuthGate</code> with <code className="bg-green-200/50 dark:bg-green-800/50 px-1 rounded">permission=&quot;can_edit&quot;</code></li>
                      <li>Checks user&apos;s role permissions (owner/admin/member have edit, viewer does not)</li>
                      <li>Separate from subscription tier - based purely on your role</li>
                      <li>Viewers see a permission denied message instead</li>
                    </ul>
                    <div className="text-xs text-green-700 dark:text-green-300 pt-2 space-y-1">
                      <p><strong>Role Permissions for TestApp:</strong></p>
                      <p>• Owner/Admin/Member: can_edit = true</p>
                      <p>• Viewer: can_edit = false</p>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </AuthGate>

          {/* Combined Authorization Demo - Feature AND Permission */}
          <AuthGate appId="testapp" feature="professional_demo" permission="can_export" requireAll>
            <Card className="p-6 bg-gradient-to-br from-purple-50 to-violet-50 dark:from-purple-950 dark:to-violet-950 border-purple-200 dark:border-purple-800">
              <div className="flex items-start gap-4">
                <div className="rounded-full bg-purple-100 dark:bg-purple-900 p-3">
                  <Shield className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                </div>
                <div className="flex-1">
                  <h2 className="text-xl font-semibold text-foreground mb-2">
                    Combined Authorization Feature
                  </h2>
                  <p className="text-muted-foreground mb-4">
                    You see this because you have BOTH Professional tier AND export permission.
                  </p>
                  <div className="bg-purple-100/50 dark:bg-purple-900/30 rounded-lg p-4 space-y-2">
                    <p className="text-sm font-medium text-purple-900 dark:text-purple-100">
                      Combined Authorization Demo
                    </p>
                    <p className="text-sm text-purple-800 dark:text-purple-200">
                      This demonstrates combined tier + role authorization:
                    </p>
                    <ul className="list-disc list-inside space-y-1 ml-2 text-sm text-purple-800 dark:text-purple-200">
                      <li>Requires <code className="bg-purple-200/50 dark:bg-purple-800/50 px-1 rounded">feature=&quot;professional_demo&quot;</code> (Pro tier)</li>
                      <li>AND <code className="bg-purple-200/50 dark:bg-purple-800/50 px-1 rounded">permission=&quot;can_export&quot;</code> (Owner/Admin role)</li>
                      <li>Both conditions must be met (requireAll=true)</li>
                      <li>Free tier users OR members/viewers won&apos;t see this</li>
                    </ul>
                    <div className="text-xs text-purple-700 dark:text-purple-300 pt-2 space-y-1">
                      <p><strong>Requirements:</strong></p>
                      <p>• Tier: Professional (has professional_demo feature)</p>
                      <p>• Role: Owner/Admin (has can_export permission)</p>
                      <p>• Current: {auth?.tier_display_name} + {auth?.user_role}</p>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </AuthGate>

          {/* Info Card */}
          <Card className="p-6 bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
            <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-100 mb-3">
              TestApp - New Auth Flows Complete
            </h3>
            <div className="space-y-2 text-sm text-blue-800 dark:text-blue-200">
              <p className="font-medium">What&apos;s working:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Magic link authentication via Supabase</li>
                <li>Shared middleware factory (createAppMiddleware)</li>
                <li>Shared callback handler (handleAuthCallback)</li>
                <li>Multi-org login flow with org picker</li>
                <li>Invitation processing via Edge Functions</li>
                <li>App access check via JWT accessible_apps</li>
                <li>Organization switcher with default app navigation</li>
                <li>App switcher with real app URLs</li>
                <li>useAuthorization hook for complete auth context</li>
                <li>Feature and permission gating via AuthGate</li>
              </ul>
            </div>
          </Card>

          {/* Architecture Note */}
          <Card className="p-6 bg-muted/50">
            <h3 className="text-sm font-semibold text-foreground mb-3">
              Architecture Pattern
            </h3>
            <div className="space-y-2 text-xs text-muted-foreground">
              <p>
                <strong className="text-foreground">Pattern:</strong> Shared Auth Infrastructure
              </p>
              <p>
                <strong className="text-foreground">Middleware:</strong> createAppMiddleware from @playze/shared-auth/middleware
              </p>
              <p>
                <strong className="text-foreground">Callback:</strong> handleAuthCallback from @playze/shared-auth/lib
              </p>
              <p>
                <strong className="text-foreground">Authorization:</strong> useAuthorization hook (single RPC call)
              </p>
              <p className="pt-2">
                This app demonstrates the recommended patterns for apps built on ValidAI Core Framework.
              </p>
            </div>
          </Card>
        </div>
      </main>
    </div>
  )
}
