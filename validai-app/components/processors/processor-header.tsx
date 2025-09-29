"use client"

import { ProcessorDetail } from "@/app/queries/processors/use-processor-detail"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Separator } from "@/components/ui/separator"
import { formatDistanceToNow } from "@/lib/utils"
import {
  Archive,
  Eye,
  Lock,
  MoreHorizontal,
  Pencil,
  Play,
  Upload,
  Users
} from "lucide-react"

interface ProcessorHeaderProps {
  processor: ProcessorDetail
}

export function ProcessorHeader({ processor }: ProcessorHeaderProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case "published":
        return "bg-green-500/10 text-green-700 dark:text-green-400"
      case "draft":
        return "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400"
      case "archived":
        return "bg-gray-500/10 text-gray-700 dark:text-gray-400"
      default:
        return "bg-gray-500/10 text-gray-700 dark:text-gray-400"
    }
  }

  const VisibilityIcon = processor.visibility === "personal" ? Lock : Users

  return (
    <Card>
      <CardHeader className="space-y-4">
        {/* Title and Status */}
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">
                {processor.processor_name}
              </h1>
              <Badge className={getStatusColor(processor.status)}>
                {processor.status}
              </Badge>
            </div>
            {processor.processor_description && (
              <p className="text-muted-foreground">
                {processor.processor_description}
              </p>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled>
              <Pencil className="h-4 w-4" />
              <span className="ml-1">Edit</span>
            </Button>
            <Button variant="default" size="sm" disabled>
              <Play className="h-4 w-4" />
              <span className="ml-1">Run</span>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <span className="sr-only">Open menu</span>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem disabled>
                  <Upload className="mr-2 h-4 w-4" />
                  Publish
                </DropdownMenuItem>
                <DropdownMenuItem disabled>
                  <Eye className="mr-2 h-4 w-4" />
                  Preview
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled>
                  <Archive className="mr-2 h-4 w-4" />
                  Archive
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <Separator className="mb-4" />

        {/* Metadata Grid */}
        <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
          {/* Document Type */}
          {processor.document_type && (
            <div>
              <div className="text-muted-foreground">Document Type</div>
              <div className="font-medium">{processor.document_type}</div>
            </div>
          )}

          {/* Visibility */}
          <div>
            <div className="text-muted-foreground">Visibility</div>
            <div className="flex items-center gap-1.5 font-medium">
              <VisibilityIcon className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="capitalize">{processor.visibility}</span>
            </div>
          </div>

          {/* Operations Count */}
          <div>
            <div className="text-muted-foreground">Operations</div>
            <div className="font-medium">{processor.operations.length}</div>
          </div>

          {/* Last Updated */}
          <div>
            <div className="text-muted-foreground">Last Updated</div>
            <div className="font-medium">
              {formatDistanceToNow(new Date(processor.updated_at))}
            </div>
          </div>
        </div>

        {/* Tags */}
        {processor.tags && processor.tags.length > 0 && (
          <>
            <Separator className="my-4" />
            <div className="flex flex-wrap gap-2">
              {processor.tags.map((tag) => (
                <Badge key={tag} variant="secondary">
                  {tag}
                </Badge>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}