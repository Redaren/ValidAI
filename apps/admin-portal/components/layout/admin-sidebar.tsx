"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@playze/shared-ui"

interface NavItem {
  title: string
  href: string
  description: string
}

const navItems: NavItem[] = [
  {
    title: "Organizations",
    href: "/organizations",
    description: "Manage organizations and members"
  },
  {
    title: "Users",
    href: "/users",
    description: "View all platform users"
  },
  {
    title: "Subscriptions",
    href: "/subscriptions",
    description: "Manage app subscriptions"
  }
]

export function AdminSidebar() {
  const pathname = usePathname()

  return (
    <aside className="hidden md:flex w-64 flex-col border-r bg-background">
      <div className="flex-1 overflow-auto py-6">
        <nav className="grid gap-1 px-4">
          {navItems.map((item) => {
            const isActive = pathname?.startsWith(item.href)

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-col gap-1 rounded-lg px-3 py-2 text-sm transition-all hover:bg-accent",
                  isActive
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <span className="font-medium">{item.title}</span>
                <span className="text-xs text-muted-foreground">
                  {item.description}
                </span>
              </Link>
            )
          })}
        </nav>
      </div>

      <div className="border-t p-4">
        <p className="text-xs text-muted-foreground">
          Playze Admin Portal v0.0.0
        </p>
      </div>
    </aside>
  )
}
