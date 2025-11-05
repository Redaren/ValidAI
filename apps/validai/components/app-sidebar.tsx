"use client"

import * as React from "react"
import {
  FileText,
  LifeBuoy,
  Send,
  Settings2,
  SquareTerminal,
} from "lucide-react"

import { NavMain } from "@/components/nav-main"
import { NavProjects } from "@/components/nav-projects"
import { NavSecondary } from "@/components/nav-secondary"
import { NavUser } from "@/components/nav-user"
import { OrganizationSwitcher } from "@/components/organization-switcher"
import { LanguageSwitcher } from "@playze/shared-ui"
import { SUPPORTED_LOCALES, LOCALE_NAMES } from "@/lib/i18n/locales"
import { createBrowserClient } from "@playze/shared-auth/client"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
} from "@/components/ui/sidebar"

// Static navigation configuration - translation keys passed to child components
const navConfig = {
  navMain: [
    {
      titleKey: "dashboard",
      url: "/dashboard",
      icon: SquareTerminal,
      isActive: true,
      items: [],
    },
    {
      titleKey: "processors",
      url: "/proc",
      icon: FileText,
      isActive: false,
      items: [],
    },
  ],
  navSecondary: [
    {
      titleKey: "support",
      url: "#",
      icon: LifeBuoy,
    },
    {
      titleKey: "feedback",
      url: "#",
      icon: Send,
    },
  ],
  projects: [
    {
      name: "Design Engineering",
      url: "#",
      icon: Settings2,
    },
    {
      name: "Sales & Marketing",
      url: "#",
      icon: Settings2,
    },
    {
      name: "Travel",
      url: "#",
      icon: Settings2,
    },
  ],
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {

  // Callback to update database when user explicitly switches language
  const handleLocaleChange = async (locale: string) => {
    try {
      const supabase = createBrowserClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (user) {
        await supabase
          .from('user_preferences')
          .upsert({
            user_id: user.id,
            language: locale,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id' })
      }
    } catch (error) {
      console.error('Failed to update language preference in database:', error)
      // Note: The language switch will still work via cookie even if DB update fails
    }
  }

  return (
    <Sidebar variant="sidebar" {...props}>
      <SidebarHeader>
        <OrganizationSwitcher />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navConfig.navMain} />
        <NavProjects projects={navConfig.projects} />
        <NavSecondary items={navConfig.navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <div className="flex items-center justify-between px-2 py-2">
          <LanguageSwitcher
            supportedLocales={SUPPORTED_LOCALES}
            localeNames={LOCALE_NAMES}
            onLocaleChange={handleLocaleChange}
          />
        </div>
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  )
}