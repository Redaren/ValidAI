'use client'

import * as React from 'react'
import { useUserAppsWithAdmin, type UserApp } from '@playze/shared-auth'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import { Button, type ButtonProps } from '../ui/button'
import { ChevronDown, Loader2 } from 'lucide-react'
import { cn } from '../../lib/utils'

interface AppSwitcherProps {
  currentApp: string
  variant?: ButtonProps['variant']
  className?: string
  dropdownClassName?: string
  mode?: 'default' | 'sidebar'
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
 * <AppSwitcher currentApp="roadcloud" />
 */
export function AppSwitcher({
  currentApp,
  variant = 'outline',
  className,
  dropdownClassName,
  mode = 'default',
}: AppSwitcherProps) {
  const { data: userApps, isLoading } = useUserAppsWithAdmin()

  const apps = (userApps || []).map((app) => ({
    id: app.app_id,
    name: app.app_name,
    url: app.app_url || '#',  // Use app_url from database, fallback to # if null
    hasAccess: app.status === 'active',
    isPlatformApp: app.is_platform_app,
  }))

  const currentAppData = apps.find((app) => app.id === currentApp)

  const handleAppSwitch = (appId: string) => {
    const app = apps.find((a) => a.id === appId)
    if (app?.hasAccess && app.url) {
      window.location.href = app.url
    }
  }

  if (isLoading) {
    if (mode === 'sidebar') {
      return (
        <span className={cn('font-semibold opacity-50', className)}>
          <Loader2 className="h-4 w-4 animate-spin inline" />
        </span>
      )
    }
    return (
      <Button variant={variant} className={`w-[200px] justify-between ${className || ''}`} disabled>
        <Loader2 className="h-4 w-4 animate-spin" />
        <ChevronDown className="ml-2 h-4 w-4" />
      </Button>
    )
  }

  // Sidebar mode: compact display for sidebar navigation
  if (mode === 'sidebar') {
    const hasOtherApps = apps.filter((a) => a.hasAccess && a.id !== currentApp).length > 0
    const currentAppName = currentAppData?.name || currentApp

    // If only one app (or no other accessible apps), render as plain text
    if (!hasOtherApps) {
      return <span className={cn('font-semibold', className)}>{currentAppName}</span>
    }

    // Multiple apps: render as dropdown
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className={cn(
              'h-auto p-0 font-semibold hover:bg-transparent focus-visible:ring-0',
              className
            )}
          >
            {currentAppName}
            <ChevronDown className="ml-1 h-3 w-3 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className={dropdownClassName} align="start">
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

  // Default mode: full button with "Switch App" label
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} className={`w-[200px] justify-between ${className || ''}`}>
          Switch App
          <ChevronDown className="ml-2 h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className={`w-[200px] ${dropdownClassName || ''}`}>
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
