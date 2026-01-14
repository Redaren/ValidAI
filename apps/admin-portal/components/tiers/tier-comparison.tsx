'use client'

import { useState, useMemo } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger, Card, Badge, Alert } from '@playze/shared-ui'
import { AlertCircle, Loader2 } from 'lucide-react'
import { useApps, useAllAppTiers } from '@/lib/queries'
import { TierComparisonTable } from './tier-comparison-table'
import { RolePermissionsMatrix } from './role-permissions-matrix'

/**
 * Main tier comparison view component
 * Shows tabs for each app, with side-by-side tier comparison for the selected app
 */
export function TierComparison() {
  const { data: apps, isLoading: appsLoading, error: appsError } = useApps()
  const {
    data: allTiers,
    isLoading: tiersLoading,
    error: tiersError,
  } = useAllAppTiers()

  const [selectedApp, setSelectedApp] = useState<string | undefined>(undefined)

  // Auto-select first app when data loads
  const activeApp = useMemo(() => {
    if (selectedApp) return selectedApp
    if (apps && apps.length > 0) {
      const first = apps[0].id
      setSelectedApp(first)
      return first
    }
    return undefined
  }, [apps, selectedApp])

  // Group tiers by app
  const tiersByApp = useMemo(() => {
    if (!allTiers) return {}

    const grouped: Record<string, typeof allTiers> = {}
    allTiers.forEach((tier) => {
      if (!grouped[tier.app_id]) {
        grouped[tier.app_id] = []
      }
      grouped[tier.app_id].push(tier)
    })

    return grouped
  }, [allTiers])

  // Get tiers for selected app in proper order
  const selectedAppTiers = useMemo(() => {
    if (!activeApp || !tiersByApp[activeApp]) return []

    // Sort tiers: free, pro, enterprise
    const tierOrder = { free: 0, pro: 1, enterprise: 2 }
    return tiersByApp[activeApp].sort((a, b) => {
      const orderA = tierOrder[a.tier_name as keyof typeof tierOrder] ?? 999
      const orderB = tierOrder[b.tier_name as keyof typeof tierOrder] ?? 999
      return orderA - orderB
    })
  }, [activeApp, tiersByApp])

  // Loading state
  if (appsLoading || tiersLoading) {
    return (
      <Card className="p-12">
        <div className="flex items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading tier configurations...</span>
        </div>
      </Card>
    )
  }

  // Error states
  if (appsError || tiersError) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <div>
          <h4 className="font-semibold">Error Loading Data</h4>
          <p className="text-sm mt-1">
            {appsError?.message || tiersError?.message || 'Failed to load tier configurations'}
          </p>
        </div>
      </Alert>
    )
  }

  // No apps state
  if (!apps || apps.length === 0) {
    return (
      <Card className="p-12">
        <div className="text-center text-muted-foreground">
          <p>No apps configured yet.</p>
          <p className="text-sm mt-2">Create apps in the database to see tier configurations.</p>
        </div>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* App Selector Tabs */}
      <Tabs value={activeApp} onValueChange={setSelectedApp}>
        <TabsList className="w-full justify-start overflow-x-auto">
          {apps.map((app) => (
            <TabsTrigger key={app.id} value={app.id} className="gap-2">
              {app.name}
              <Badge variant="secondary" className="text-xs">
                {tiersByApp[app.id]?.length || 0} tiers
              </Badge>
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Tier Comparison Content */}
        {apps.map((app) => (
          <TabsContent key={app.id} value={app.id} className="mt-6">
            <div className="space-y-4">
              {/* App Info Header */}
              <div className="mb-6">
                <h2 className="text-2xl font-bold">{app.name}</h2>
                {app.description && (
                  <p className="text-muted-foreground mt-1">{app.description}</p>
                )}
              </div>

              {/* Tier Comparison Table */}
              <TierComparisonTable tiers={selectedAppTiers} appName={app.name} />
            </div>
          </TabsContent>
        ))}
      </Tabs>

      {/* Role Permissions Matrix - Phase 2 Complete */}
      {activeApp && apps && (
        <RolePermissionsMatrix
          appId={activeApp}
          appName={apps.find((a) => a.id === activeApp)?.name || activeApp}
        />
      )}
    </div>
  )
}
