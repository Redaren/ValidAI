"use client"

import { useEffect, useState } from "react"
import { User, Session } from "@supabase/supabase-js"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Button } from "@/components/ui/button"
import { ChevronDown, ChevronRight, User as UserIcon, Shield, Clock, Building, Key } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

interface Organization {
  id: string
  name: string
  slug: string
  plan_type: string
}

interface CurrentOrganization {
  organization: Organization
  role: string
}

interface SessionData {
  user: User | null
  session: Session | null
  organizations: Organization[] | null
  currentOrg: CurrentOrganization | null
}

interface CollapsibleSectionProps {
  title: string
  icon: React.ReactNode
  children: React.ReactNode
  defaultOpen?: boolean
}

function CollapsibleSection({ title, icon, children, defaultOpen = false }: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" className="flex w-full justify-between p-0 h-auto font-medium text-left">
          <div className="flex items-center gap-2">
            {icon}
            {title}
          </div>
          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-3">
        {children}
      </CollapsibleContent>
    </Collapsible>
  )
}

function formatTimestamp(timestamp: string | undefined) {
  if (!timestamp) return "Never"
  return new Date(timestamp).toLocaleString()
}

function JsonDisplay({ data, title }: { data: Record<string, unknown>, title: string }) {
  if (!data || Object.keys(data).length === 0) {
    return <p className="text-sm text-muted-foreground">No {title.toLowerCase()}</p>
  }

  return (
    <div className="space-y-2">
      {Object.entries(data).map(([key, value]) => (
        <div key={key} className="flex flex-col space-y-1">
          <div className="flex items-center gap-2">
            <Badge variant="outline">{key}</Badge>
          </div>
          <div className="text-sm font-mono bg-muted/50 p-2 rounded text-muted-foreground break-all">
            {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
          </div>
        </div>
      ))}
    </div>
  )
}

export function SessionInfoCard() {
  const [sessionData, setSessionData] = useState<SessionData>({
    user: null,
    session: null,
    organizations: null,
    currentOrg: null
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchSessionData() {
      try {
        const supabase = createClient()

        // Get user and session
        const [userResponse, sessionResponse] = await Promise.all([
          supabase.auth.getUser(),
          supabase.auth.getSession()
        ])

        const user = userResponse.data?.user || null
        const session = sessionResponse.data?.session || null

        // Get current organization from JWT metadata
        let currentOrg = null

        if (user && user.app_metadata?.organization_id) {
          // Extract organization details from JWT app_metadata
          const orgId = user.app_metadata.organization_id
          const orgName = user.app_metadata.organization_name
          const orgSlug = user.app_metadata.organization_slug
          const orgPlanType = user.app_metadata.organization_plan_type
          const userRole = user.app_metadata.organization_role

          if (orgName) {
            currentOrg = {
              organization: {
                id: orgId,
                name: orgName,
                slug: orgSlug,
                plan_type: orgPlanType || 'free'
              },
              role: userRole || 'member'
            }
          }
        }

        setSessionData({
          user,
          session,
          organizations: null,
          currentOrg
        })
      } catch (error) {
        console.error('Error fetching session data:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchSessionData()
  }, [])

  if (loading) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle>Session Information</CardTitle>
          <CardDescription>Loading session data...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="animate-pulse">
              <div className="h-4 bg-muted rounded w-3/4"></div>
              <div className="h-4 bg-muted rounded w-1/2 mt-2"></div>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  const { user, session, currentOrg } = sessionData

  if (!user || !session) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle>Session Information</CardTitle>
          <CardDescription>No active session</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Please sign in to view session information.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Session Information</CardTitle>
        <CardDescription>Complete session and user data</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Basic User Info */}
        <CollapsibleSection
          title="User Identity"
          icon={<UserIcon className="h-4 w-4" />}
          defaultOpen={true}
        >
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-2 text-sm">
              <div><strong>ID:</strong> <span className="font-mono text-muted-foreground">{user.id}</span></div>
              <div><strong>Email:</strong> {user.email || 'Not set'}</div>
              <div><strong>Phone:</strong> {user.phone || 'Not set'}</div>
              <div className="flex items-center gap-2">
                <strong>Role:</strong>
                <Badge variant="outline">{user.role}</Badge>
              </div>
              <div className="flex items-center gap-2">
                <strong>Anonymous:</strong>
                <Badge variant={user.is_anonymous ? "destructive" : "secondary"}>
                  {user.is_anonymous ? 'Yes' : 'No'}
                </Badge>
              </div>
            </div>
          </div>
        </CollapsibleSection>

        <Separator />

        {/* Session Details */}
        <CollapsibleSection
          title="Session Details"
          icon={<Key className="h-4 w-4" />}
        >
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-2 text-sm">
              <div><strong>Session ID:</strong> <span className="font-mono text-muted-foreground break-all">{session.access_token.split('.')[0]}...</span></div>
              <div><strong>Token Type:</strong> {session.token_type}</div>
              <div><strong>Expires:</strong> {formatTimestamp(new Date(session.expires_at! * 1000).toISOString())}</div>
              <div className="flex items-center gap-2">
                <strong>AAL (Auth Level):</strong>
                <Badge variant="outline">{user.aud}</Badge>
              </div>
            </div>
          </div>
        </CollapsibleSection>

        <Separator />

        {/* Timestamps */}
        <CollapsibleSection
          title="Timestamps"
          icon={<Clock className="h-4 w-4" />}
        >
          <div className="space-y-2 text-sm">
            <div><strong>Created:</strong> {formatTimestamp(user.created_at)}</div>
            <div><strong>Last Updated:</strong> {formatTimestamp(user.updated_at)}</div>
            <div><strong>Email Confirmed:</strong> {formatTimestamp(user.email_confirmed_at)}</div>
            <div><strong>Phone Confirmed:</strong> {formatTimestamp(user.phone_confirmed_at)}</div>
            <div><strong>Last Sign In:</strong> {formatTimestamp(user.last_sign_in_at)}</div>
            <div><strong>Confirmed At:</strong> {formatTimestamp(user.confirmed_at)}</div>
          </div>
        </CollapsibleSection>

        <Separator />

        {/* Current Organization */}
        {currentOrg && (
          <>
            <CollapsibleSection
              title="Current Organization"
              icon={<Building className="h-4 w-4" />}
            >
              <div className="space-y-4">
                <div>
                  <div className="bg-muted/50 p-3 rounded-md">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{currentOrg.organization?.name}</span>
                      <Badge variant="outline">{currentOrg.role}</Badge>
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">
                      Plan: {currentOrg.organization?.plan_type || 'Free'}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Slug: {currentOrg.organization?.slug}
                    </div>
                  </div>
                </div>
              </div>
            </CollapsibleSection>
            <Separator />
          </>
        )}

        {/* Authentication Methods */}
        <CollapsibleSection
          title="Authentication Methods"
          icon={<Shield className="h-4 w-4" />}
        >
          <div className="space-y-3">
            {user.identities && user.identities.length > 0 ? (
              <div>
                <h4 className="font-medium text-sm mb-2">Identity Providers</h4>
                <div className="flex flex-wrap gap-2">
                  {user.identities.map((identity, index) => (
                    <Badge key={index} variant="outline">
                      {identity.provider}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No identities found</p>
            )}
          </div>
        </CollapsibleSection>

        <Separator />

        {/* App Metadata */}
        <CollapsibleSection
          title="App Metadata"
          icon={<Key className="h-4 w-4" />}
        >
          <JsonDisplay data={user.app_metadata} title="App Metadata" />
        </CollapsibleSection>

        <Separator />

        {/* User Metadata */}
        <CollapsibleSection
          title="User Metadata"
          icon={<UserIcon className="h-4 w-4" />}
        >
          <JsonDisplay data={user.user_metadata} title="User Metadata" />
        </CollapsibleSection>
      </CardContent>
    </Card>
  )
}