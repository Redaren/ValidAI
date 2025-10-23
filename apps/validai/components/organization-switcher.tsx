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
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { useCurrentOrganization, useUserOrganizations, useSwitchOrganization } from "@/app/queries/organizations/use-organizations"
import { useOrganizationStore } from "@/stores"

export function OrganizationSwitcher() {
  const { isMobile } = useSidebar()
  const router = useRouter()

  // Queries
  const { data: currentOrgData, isLoading: currentLoading } = useCurrentOrganization()
  const { data: userOrgsData, isLoading: orgsLoading } = useUserOrganizations()
  const switchOrgMutation = useSwitchOrganization()

  // Store
  const { isSwitching } = useOrganizationStore()

  const currentOrg = currentOrgData?.organization
  const userOrgs = userOrgsData?.organizations || []

  const isLoading = currentLoading || orgsLoading || isSwitching

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
      await switchOrgMutation.mutateAsync(orgId)
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
      router.push(`/dashboard/organizations/${currentOrg.slug}/settings`)
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
            {userOrgs.map((org: { id: string; name: string; plan_type: string }) => (
              <DropdownMenuItem
                key={org.id}
                onClick={() => handleSwitchOrganization(org.id)}
                className="gap-2 p-2"
                disabled={switchOrgMutation.isPending}
              >
                <div className="flex size-6 items-center justify-center rounded-sm border">
                  <Building2 className="size-4 shrink-0" />
                </div>
                <span className="font-medium">{org.name}</span>
                {currentOrg?.id === org.id && (
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