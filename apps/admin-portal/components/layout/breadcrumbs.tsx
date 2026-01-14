"use client"

import { ChevronRight } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { createBrowserClient } from "@playze/shared-auth/client"

interface BreadcrumbSegment {
  label: string
  href: string
  isLoading?: boolean
}

export function Breadcrumbs() {
  const pathname = usePathname()
  const segments = pathname.split("/").filter(Boolean)

  // Parse the path segments
  const mainSegment = segments[0] || ""
  const secondSegment = segments[1] || ""
  const mainLabel = formatSegmentLabel(mainSegment)

  // Fetch entity name for detail pages (always call hooks unconditionally)
  const shouldFetchEntity =
    segments.length > 1 &&
    secondSegment !== "new" &&
    isValidUUID(secondSegment)

  const { data: entityName, isLoading: isLoadingEntity } = useEntityName(
    mainSegment,
    secondSegment,
    shouldFetchEntity
  )

  // Don't show breadcrumbs on the root or login pages
  if (segments.length === 0 || pathname === "/login") {
    return null
  }

  // Build breadcrumb array
  const breadcrumbs: BreadcrumbSegment[] = []

  // First segment is always the main section
  breadcrumbs.push({
    label: mainLabel,
    href: `/${mainSegment}`,
  })

  // Handle second segment (detail page or action)
  if (segments.length > 1) {
    if (secondSegment === "new") {
      breadcrumbs.push({
        label: `New ${mainLabel.slice(0, -1)}`, // Remove trailing 's'
        href: `/${mainSegment}/new`,
      })
    } else {
      // It's a detail page
      breadcrumbs.push({
        label: entityName || secondSegment,
        href: `/${mainSegment}/${secondSegment}`,
        isLoading: isLoadingEntity,
      })
    }
  }

  return (
    <nav className="flex items-center space-x-1 text-sm text-muted-foreground">
      {breadcrumbs.map((segment, index) => {
        const isLast = index === breadcrumbs.length - 1

        return (
          <div key={segment.href} className="flex items-center">
            {index > 0 && (
              <ChevronRight className="mx-1 h-4 w-4 flex-shrink-0" />
            )}
            {isLast ? (
              <span className="font-medium text-foreground">
                {segment.isLoading ? "Loading..." : segment.label}
              </span>
            ) : (
              <Link
                href={segment.href}
                className="hover:text-foreground transition-colors"
              >
                {segment.isLoading ? "Loading..." : segment.label}
              </Link>
            )}
          </div>
        )
      })}
    </nav>
  )
}

function formatSegmentLabel(segment: string): string {
  // Capitalize first letter and format
  return segment.charAt(0).toUpperCase() + segment.slice(1)
}

function isValidUUID(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    str
  )
}

function useEntityName(
  entityType: string,
  entityId: string,
  enabled: boolean
) {
  const supabase = createBrowserClient()

  return useQuery({
    queryKey: ["breadcrumb", entityType, entityId],
    queryFn: async () => {
      switch (entityType) {
        case "organizations": {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data } = await (supabase as any).rpc(
            "admin_get_organization",
            {
              org_id: entityId,
            }
          )
          return data?.[0]?.name || null
        }

        case "users": {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data } = await (supabase as any).rpc("admin_get_user", {
            p_user_id: entityId,
          })
          return data?.[0]?.full_name || data?.[0]?.email || "User"
        }

        default:
          return null
      }
    },
    enabled: enabled && !!entityId,
    staleTime: 60000, // Cache for 1 minute
  })
}
