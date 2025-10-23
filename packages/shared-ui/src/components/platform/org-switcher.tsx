'use client'

import * as React from 'react'
import { useUserOrganizations, useSwitchOrganization, useCurrentOrganization, createBrowserClient } from '@playze/shared-auth'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import { Button } from '../ui/button'
import { ChevronDown, Building2 } from 'lucide-react'

/**
 * OrgSwitcher component allows users to switch between organizations they belong to.
 *
 * Flow:
 * 1. Calls switch-organization Edge Function to update JWT metadata in database
 * 2. Refreshes session to get new JWT with updated organization_id
 * 3. Reloads page to apply new organization context across all queries
 *
 * All subsequent queries will be filtered to the new organization via RLS policies.
 *
 * @example
 * <OrgSwitcher />
 */
export function OrgSwitcher() {
  const { data: currentOrg, isLoading: currentOrgLoading } = useCurrentOrganization()
  const { data: orgs, isLoading: orgsLoading } = useUserOrganizations()
  const switchOrg = useSwitchOrganization()

  const handleOrgSwitch = async (orgId: string) => {
    if (orgId === currentOrg?.id) return

    try {
      // Step 1: Call Edge Function to update JWT metadata in database
      await switchOrg.mutateAsync({ organizationId: orgId })

      // Step 2: Refresh session to get updated JWT with new organization_id
      const supabase = createBrowserClient()
      await supabase.auth.refreshSession()

      // Step 3: Reload page with new session cookies
      window.location.reload()
    } catch (error) {
      console.error('Failed to switch organization:', error)
      alert('Failed to switch organization. Please try again.')
    }
  }

  if (currentOrgLoading || orgsLoading) {
    return <Button variant="outline" disabled>Loading...</Button>
  }

  if (!orgs || orgs.length === 0) {
    return null
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="w-[200px] justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            {currentOrg?.name || 'Select Organization'}
          </div>
          <ChevronDown className="ml-2 h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-[200px]">
        <DropdownMenuLabel>Switch Organization</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {orgs.map((org) => (
          <DropdownMenuItem
            key={org.organization_id}
            onClick={() => handleOrgSwitch(org.organization_id)}
            className={org.organization_id === currentOrg?.id ? 'bg-accent' : ''}
          >
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                {org.organization_name}
                {org.organization_id === currentOrg?.id && ' ✓'}
              </div>
              <div className="text-xs text-muted-foreground">
                Role: {org.user_role}
              </div>
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
