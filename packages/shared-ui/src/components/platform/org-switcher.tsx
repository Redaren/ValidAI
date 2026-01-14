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
import { ChevronDown, Building2, Loader2 } from 'lucide-react'
import { cn } from '../../lib/utils'

interface OrgSwitcherProps {
  /** Display mode: 'default' (button), 'sidebar' (inline text with hover chevron), or 'external' (opens org's default app in new tab) */
  mode?: 'default' | 'sidebar' | 'external'
  /** Custom class names for the root element */
  className?: string
  /** Custom class names for the dropdown content */
  dropdownClassName?: string
}

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
 * // Default mode (button with icon)
 * <OrgSwitcher />
 *
 * @example
 * // Sidebar mode (text with hover chevron)
 * <OrgSwitcher mode="sidebar" className="text-sm text-gray-500" />
 */
export function OrgSwitcher({
  mode = 'default',
  className,
  dropdownClassName,
}: OrgSwitcherProps) {
  const { data: currentOrg, isLoading: currentOrgLoading } = useCurrentOrganization()
  const { data: orgs, isLoading: orgsLoading } = useUserOrganizations()
  const switchOrg = useSwitchOrganization()

  const handleOrgSwitch = async (orgId: string) => {
    // In external mode, don't skip if same org (user might want to open it)
    if (mode !== 'external' && orgId === currentOrg?.id) return

    try {
      // Call Edge Function to update JWT metadata in database
      const result = await switchOrg.mutateAsync({ organizationId: orgId })

      if (mode === 'external') {
        // Open default app in new window
        const defaultAppUrl = result?.data?.defaultAppUrl
        if (defaultAppUrl) {
          // Refresh session to get updated JWT cookie BEFORE opening new tab
          const supabase = createBrowserClient()
          await supabase.auth.refreshSession()
          window.open(defaultAppUrl, '_blank')
        } else {
          alert('No default app configured for this organization')
        }
      } else {
        // Refresh session to get updated JWT with new organization_id
        const supabase = createBrowserClient()
        await supabase.auth.refreshSession()

        // Reload page with new session cookies
        window.location.reload()
      }
    } catch (error) {
      console.error('Failed to switch organization:', error)
      alert('Failed to switch organization. Please try again.')
    }
  }

  const isLoading = currentOrgLoading || orgsLoading
  const hasMultipleOrgs = orgs && orgs.length > 1

  // Loading state
  if (isLoading) {
    if (mode === 'sidebar') {
      return (
        <span className={cn('font-medium opacity-50', className)}>
          <Loader2 className="h-3 w-3 animate-spin inline mr-1" />
          Loading...
        </span>
      )
    }
    return <Button variant="outline" disabled>Loading...</Button>
  }

  // No organizations
  if (!orgs || orgs.length === 0) {
    return null
  }

  // Sidebar mode with single org: plain text, not interactive
  if (mode === 'sidebar' && !hasMultipleOrgs) {
    return (
      <span className={cn('font-medium', className)}>
        {currentOrg?.name || 'No Organization'}
      </span>
    )
  }

  // Sidebar mode with multiple orgs: dropdown with hover chevron
  if (mode === 'sidebar') {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className={cn(
              'group h-auto p-0 font-medium',
              'hover:bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0',
              className
            )}
          >
            {currentOrg?.name || 'Select Organization'}
            <ChevronDown
              className="ml-1 h-3 w-3 opacity-0 group-hover:opacity-50 transition-opacity"
            />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className={dropdownClassName} align="start">
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

  // External mode: opens org's default app in new tab
  if (mode === 'external') {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className={cn('w-[220px] justify-between', className)}>
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Switch to Organization
            </div>
            <ChevronDown className="ml-2 h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className={cn('w-[220px]', dropdownClassName)}>
          <DropdownMenuLabel>Open Organization</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {orgs.map((org) => (
            <DropdownMenuItem
              key={org.organization_id}
              onClick={() => handleOrgSwitch(org.organization_id)}
            >
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  {org.organization_name}
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

  // Default mode: full button with icon
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className={cn('w-[200px] justify-between', className)}>
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            {currentOrg?.name || 'Select Organization'}
          </div>
          <ChevronDown className="ml-2 h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className={cn('w-[200px]', dropdownClassName)}>
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
