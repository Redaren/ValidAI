"use client"

import * as React from "react"
import { type LucideIcon } from "lucide-react"
import { useTranslations } from 'next-intl'
import { Link } from "@/lib/i18n/navigation"

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

export function NavSecondary({
  items,
  ...props
}: {
  items: {
    titleKey: string
    url: string
    icon: LucideIcon
  }[]
} & React.ComponentPropsWithoutRef<typeof SidebarGroup>) {
  const t = useTranslations('nav')

  return (
    <SidebarGroup {...props}>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.titleKey}>
              <SidebarMenuButton asChild size="sm">
                <Link href={item.url}>
                  <item.icon />
                  <span>{t(item.titleKey)}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}