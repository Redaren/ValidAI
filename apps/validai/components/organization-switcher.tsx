'use client'

import {
  Building2,
  ChevronsUpDown,
  Settings,
} from "lucide-react"
import { useRouter } from "@/lib/i18n/navigation"
import { logger, extractErrorDetails } from '@/lib/utils/logger'
import { useEffect, useState } from "react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@playze/shared-ui"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { useCurrentOrganization, useUserOrganizations, useSwitchOrganization } from "@playze/shared-auth"

export function OrganizationSwitcher() {
  const { isMobile } = useSidebar()
  const router = useRouter()
  const [mounted, setMounted] = useState(false)

  // Queries (shared hooks return data directly, not wrapped in objects)
  const { data: currentOrg, isLoading: currentLoading } = useCurrentOrganization()
  const { data: userOrgs = [], isLoading: orgsLoading } = useUserOrganizations()
  const switchOrgMutation = useSwitchOrganization()

  const isLoading = currentLoading || orgsLoading || switchOrgMutation.isPending

  useEffect(() => {
    setMounted(true)
  }, [])

  if (isLoading) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton size="lg">
            <div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
              <Building2 className="size-4" />
            </div>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-semibold">Loading...</span>
              <span className="truncate text-xs">...</span>
            </div>
            <ChevronsUpDown className="ml-auto size-4" />
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    )
  }

  const handleSwitchOrganization = async (orgId: string) => {
    if (orgId === currentOrg?.id) return

    try {
      // Shared hook expects { organizationId: string }
      await switchOrgMutation.mutateAsync({ organizationId: orgId })

      // Note: The shared hook invalidates queries but doesn't reload the page
      // Reloading ensures all components get the new organization context
      if (typeof window !== 'undefined') {
        window.location.reload()
      }
    } catch (error) {
      logger.error('Failed to switch organization:', extractErrorDetails(error))
      // TODO: Show error notification
    }
  }

  const handleManageOrganization = () => {
    if (currentOrg) {
      // Use organization ID instead of slug for settings route
      router.push(`/dashboard/organizations/${currentOrg.id}/settings`)
    }
  }

  // Render button without dropdown during SSR
  if (!mounted) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            size="lg"
            disabled={isLoading}
          >
            <div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
              <Building2 className="size-4" />
            </div>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-semibold">
                {currentOrg?.name || 'No Organization'}
              </span>
              <span className="truncate text-xs">
                Slogan here
              </span>
            </div>
            <ChevronsUpDown className="ml-auto size-4" />
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    )
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              disabled={isLoading}
            >
              <div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                <Building2 className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">
                  {currentOrg?.name || 'No Organization'}
                </span>
                <span className="truncate text-xs">
                  Slogan here
                </span>
              </div>
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Organizations
            </DropdownMenuLabel>
            {userOrgs.map((org) => (
              <DropdownMenuItem
                key={org.organization_id}
                onClick={() => handleSwitchOrganization(org.organization_id)}
                className="gap-2 p-2"
                disabled={switchOrgMutation.isPending}
              >
                <div className="flex size-6 items-center justify-center rounded-sm border">
                  <Building2 className="size-4 shrink-0" />
                </div>
                <span className="font-medium">{org.organization_name}</span>
                {currentOrg?.id === org.organization_id && (
                  <div className="ml-auto size-2 rounded-full bg-primary" />
                )}
              </DropdownMenuItem>
            ))}
            {currentOrg && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleManageOrganization}
                  className="gap-2 p-2"
                >
                  <Settings className="size-4" />
                  <span>Organization Settings</span>
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
