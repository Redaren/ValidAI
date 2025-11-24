import { Badge } from "@playze/shared-ui"
import { Database } from "@playze/shared-types"

type GalleryStatus = Database['public']['Enums']['gallery_status']

interface GalleryStatusBadgeProps {
  status: GalleryStatus
}

export function GalleryStatusBadge({ status }: GalleryStatusBadgeProps) {
  const variants = {
    published: {
      variant: "default" as const,
      className: "bg-green-100 text-green-800 hover:bg-green-100",
      label: "Published"
    },
    draft: {
      variant: "secondary" as const,
      className: "bg-yellow-100 text-yellow-800 hover:bg-yellow-100",
      label: "Draft"
    },
    archived: {
      variant: "outline" as const,
      className: "text-gray-600",
      label: "Archived"
    }
  }

  const config = variants[status]

  return (
    <Badge
      variant={config.variant}
      className={config.className}
    >
      {config.label}
    </Badge>
  )
}
