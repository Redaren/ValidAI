'use client'

import * as React from 'react'
import { useUserAppsWithAdmin } from '@playze/shared-auth'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import { Button } from '../ui/button'
import { ChevronDown, Loader2 } from 'lucide-react'

interface AppSwitcherProps {
  currentApp: string
}

/**
 * Map app IDs to URLs (temporary until app_url added to database)
 */
function getAppUrl(appId: string): string {
  const urlMap: Record<string, string> = {
    'admin': 'http://localhost:3001',
    'validai': 'http://localhost:3000',
    'testapp': 'http://localhost:3002',
  }
  return urlMap[appId] || '#'
}

/**
 * AppSwitcher component - Navigate between accessible apps
 *
 * Shows:
 * - Organization's subscribed apps (from subscriptions)
 * - Admin Portal (only for platform administrators)
 * - Current app (highlighted with checkmark)
 *
 * Security: Server-side verification via get_user_apps_with_admin()
 * - Subscribed apps: Verified via organization_app_subscriptions table
 * - Admin Portal: Verified via admin_users table (cannot be faked)
 *
 * @example
 * <AppSwitcher currentApp="validai" />
 */
export function AppSwitcher({ currentApp }: AppSwitcherProps) {
  const { data: userApps, isLoading } = useUserAppsWithAdmin()

  const apps = (userApps || []).map(app => ({
    id: app.app_id,
    name: app.app_name,
    url: getAppUrl(app.app_id),
    hasAccess: app.status === 'active',
    isPlatformApp: app.is_platform_app,
  }))

  const currentAppData = apps.find(app => app.id === currentApp)

  const handleAppSwitch = (appId: string) => {
    const app = apps.find(a => a.id === appId)
    if (app?.hasAccess && app.url) {
      window.location.href = app.url
    }
  }

  if (isLoading) {
    return (
      <Button variant="outline" className="w-[200px] justify-between" disabled>
        <Loader2 className="h-4 w-4 animate-spin" />
        <ChevronDown className="ml-2 h-4 w-4" />
      </Button>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="w-[200px] justify-between">
          {currentAppData?.name || 'Select App'}
          <ChevronDown className="ml-2 h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-[200px]">
        <DropdownMenuLabel>Switch App</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {apps.map((app) => (
          <DropdownMenuItem
            key={app.id}
            onClick={() => handleAppSwitch(app.id)}
            disabled={!app.hasAccess}
            className={app.id === currentApp ? 'bg-accent' : ''}
          >
            {app.name}
            {!app.hasAccess && ' (No Access)'}
            {app.id === currentApp && ' ✓'}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
