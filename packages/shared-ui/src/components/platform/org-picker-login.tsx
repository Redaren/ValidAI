'use client'

import * as React from 'react'
import { useState, useEffect } from 'react'
import { createBrowserClient } from '@playze/shared-auth/client'
import { Card } from '../ui/card'
import { Loader2, Building2, LogOut } from 'lucide-react'
import { cn } from '../../lib/utils'

interface OrgPickerLoginOrganization {
  organization_id: string
  organization_name: string
  user_role: string
  accessible_apps: string[]
  is_active: boolean
  default_app_url: string | null
}

interface OrgPickerLoginProps {
  /** App name to display in the header */
  appName: string
  /** App icon component (optional) */
  appIcon?: React.ReactNode
  /** URL to redirect to after org selection (defaults to /dashboard) */
  fallbackUrl?: string
  /** Custom class name for the container */
  className?: string
  /**
   * If true (default), stays on current app using fallbackUrl after org selection.
   * If false, redirects to the organization's default app URL.
   */
  stayOnCurrentApp?: boolean
}

/**
 * OrgPickerLogin - Organization picker for the login flow
 *
 * A simplified organization selector that shows only organization names.
 * Users can click any organization to switch to it.
 *
 * This component:
 * - Fetches user's organizations via get_user_organizations_with_apps()
 * - Shows only org names (no roles, no app access badges)
 * - All orgs are clickable (only valid orgs are returned by the function)
 * - Calls switch-organization Edge Function on selection
 * - By default, stays on current app (using fallbackUrl)
 * - Set stayOnCurrentApp={false} to redirect to org's default app
 *
 * @example
 * ```tsx
 * import { OrgPickerLogin } from '@playze/shared-ui'
 *
 * if (showOrgPicker) {
 *   return (
 *     <OrgPickerLogin
 *       appName="InfraCloud"
 *       appIcon={<FolderTree className="w-8 h-8 text-primary-foreground" />}
 *     />
 *   )
 * }
 * ```
 */
export function OrgPickerLogin({
  appName,
  appIcon,
  fallbackUrl = '/dashboard',
  className,
  stayOnCurrentApp = true,
}: OrgPickerLoginProps) {
  const [organizations, setOrganizations] = useState<OrgPickerLoginOrganization[]>([])
  const [loading, setLoading] = useState(true)
  const [switchingOrg, setSwitchingOrg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)

  // Load user organizations on mount
  useEffect(() => {
    const loadOrganizations = async () => {
      try {
        const supabase = createBrowserClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
          setError('Not authenticated')
          setLoading(false)
          return
        }

        setUserEmail(user.email || null)

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: orgs, error: orgsError } = await (supabase as any)
          .rpc('get_user_organizations_with_apps', { p_user_id: user.id })

        if (orgsError) {
          console.error('Error fetching organizations:', orgsError)
          setError('Failed to load organizations')
        } else {
          // Cast to expected type (generated types may not include new columns yet)
          setOrganizations((orgs || []) as OrgPickerLoginOrganization[])
        }
      } catch (err) {
        console.error('Error loading organizations:', err)
        setError('An error occurred')
      } finally {
        setLoading(false)
      }
    }

    loadOrganizations()
  }, [])

  // Handle organization selection
  const handleSelectOrganization = async (org: OrgPickerLoginOrganization) => {
    setSwitchingOrg(org.organization_id)
    setError(null)

    try {
      const supabase = createBrowserClient()

      // Call switch-organization Edge Function
      const { data, error: switchError } = await supabase.functions.invoke('switch-organization', {
        body: { organizationId: org.organization_id }
      })

      if (switchError) {
        console.error('Error switching organization:', switchError)
        setError('Failed to select organization')
        setSwitchingOrg(null)
        return
      }

      // Refresh session to get updated JWT
      await supabase.auth.refreshSession()

      // Determine redirect URL based on stayOnCurrentApp setting
      let redirectUrl: string
      if (stayOnCurrentApp) {
        // Stay on current app - use fallbackUrl (relative path)
        redirectUrl = fallbackUrl
      } else {
        // Redirect to org's default app if available
        redirectUrl = data?.defaultAppUrl || org.default_app_url || fallbackUrl
      }

      // Perform redirect
      if (redirectUrl.startsWith('http')) {
        // External URL - use full redirect with /dashboard path
        window.location.href = `${redirectUrl}/dashboard`
      } else {
        // Relative URL - stay on same domain
        window.location.href = redirectUrl
      }
    } catch (err) {
      console.error('Error selecting organization:', err)
      setError('An error occurred')
      setSwitchingOrg(null)
    }
  }

  // Handle logout
  const handleLogout = async () => {
    const supabase = createBrowserClient()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <div className={cn('min-h-screen flex items-center justify-center bg-background p-4', className)}>
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          {appIcon && (
            <div className="inline-flex items-center justify-center w-16 h-16 bg-primary rounded-xl mb-4">
              {appIcon}
            </div>
          )}
          <h1 className="text-2xl font-bold text-foreground">{appName}</h1>
          <p className="text-muted-foreground mt-1">Select an organization to continue</p>
        </div>

        {/* Card */}
        <Card className="p-6">
          {loading ? (
            <div className="text-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
              <p className="text-muted-foreground mt-4">Loading organizations...</p>
            </div>
          ) : organizations.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No organizations available.</p>
              <p className="text-sm text-muted-foreground mt-2">
                Please contact your administrator.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                You belong to multiple organizations. Please select which one to use:
              </p>

              <div className="space-y-2">
                {organizations.map((org) => {
                  const isSwitching = switchingOrg === org.organization_id

                  return (
                    <button
                      key={org.organization_id}
                      onClick={() => handleSelectOrganization(org)}
                      disabled={!!switchingOrg}
                      className={cn(
                        'w-full text-left p-4 rounded-lg border transition-all',
                        'border-border hover:border-primary hover:bg-primary/5',
                        isSwitching && 'border-primary bg-primary/5',
                        switchingOrg && !isSwitching && 'opacity-50'
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Building2 className="w-5 h-5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="font-medium text-foreground truncate block">
                            {org.organization_name}
                          </span>
                        </div>
                        {isSwitching && (
                          <Loader2 className="w-4 h-4 animate-spin text-primary flex-shrink-0" />
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>

              {/* Error */}
              {error && (
                <div className="p-3 rounded-lg text-sm bg-destructive/10 text-destructive border border-destructive/20">
                  {error}
                </div>
              )}
            </div>
          )}

          {/* User info and logout */}
          <div className="mt-6 pt-4 border-t border-border">
            {userEmail && (
              <p className="text-sm text-muted-foreground text-center mb-3">
                Signed in as {userEmail}
              </p>
            )}
            <button
              onClick={handleLogout}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </button>
          </div>
        </Card>

        {/* Footer */}
        <p className="text-center text-sm text-muted-foreground mt-6">
          Part of the Playze platform
        </p>
      </div>
    </div>
  )
}
