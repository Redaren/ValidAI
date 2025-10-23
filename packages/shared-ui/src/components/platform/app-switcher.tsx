'use client'

import * as React from 'react'
import { useCurrentOrganization } from '@playze/shared-auth'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import { Button } from '../ui/button'
import { ChevronDown } from 'lucide-react'

interface AppSwitcherProps {
  currentApp: string
}

/**
 * AppSwitcher component allows users to navigate between apps their organization subscribes to.
 *
 * Shows:
 * - Current app (highlighted)
 * - Other subscribed apps (clickable)
 * - Apps without subscription (locked/grayed)
 *
 * @example
 * <AppSwitcher currentApp="roadcloud" />
 */
export function AppSwitcher({ currentApp }: AppSwitcherProps) {
  const { data: org } = useCurrentOrganization()

  // TODO: Fetch organization's app subscriptions from database
  // For now, hardcoded example
  const apps = [
    { id: 'admin', name: 'Admin Portal', url: 'http://localhost:3001', hasAccess: true },
    { id: 'projectx', name: 'ProjectX', url: 'http://localhost:3002', hasAccess: true },
    { id: 'testapp', name: 'TestApp', url: 'http://localhost:3003', hasAccess: true },
    { id: 'roadcloud', name: 'RoadCloud', url: 'http://localhost:3004', hasAccess: true },
  ]

  const currentAppData = apps.find(app => app.id === currentApp)

  const handleAppSwitch = (appId: string) => {
    const app = apps.find(a => a.id === appId)
    if (app?.hasAccess && app.url) {
      window.location.href = app.url
    }
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
