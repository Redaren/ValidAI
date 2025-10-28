'use client'

import {
  Building2,
  ChevronsUpDown,
  Plus,
  Settings,
} from "lucide-react"
import { useRouter } from "next/navigation"

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

  // Queries (shared hooks return data directly, not wrapped in objects)
  const { data: currentOrg, isLoading: currentLoading } = useCurrentOrganization()
  const { data: userOrgs = [], isLoading: orgsLoading } = useUserOrganizations()
  const switchOrgMutation = useSwitchOrganization()

  const isLoading = currentLoading || orgsLoading || switchOrgMutation.isPending

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
      console.error('Failed to switch organization:', error)
      // TODO: Show error notification
    }
  }

  const handleCreateOrganization = () => {
    router.push('/dashboard/organizations/new')
  }

  const handleManageOrganization = () => {
    if (currentOrg) {
      // Use organization ID instead of slug for settings route
      router.push(`/dashboard/organizations/${currentOrg.id}/settings`)
    }
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
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleCreateOrganization}
              className="gap-2 p-2"
            >
              <div className="flex size-6 items-center justify-center rounded-md border border-dashed">
                <Plus className="size-4" />
              </div>
              <span>Create Organization</span>
            </DropdownMenuItem>
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