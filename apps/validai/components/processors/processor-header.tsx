"use client"

import { useEffect, useState } from "react"
import { Link } from "@/lib/i18n/navigation"
import { ProcessorDetail } from "@/app/queries/processors/use-processor-detail"
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@playze/shared-ui"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Archive,
  Eye,
  EyeOff,
  History,
  Lock,
  MoreHorizontal,
  Pencil,
  Play,
  RefreshCw,
  Save,
  Upload,
  Users,
} from "lucide-react"
import { useResolvedLLMConfig } from "@/hooks/use-llm-config"
import { RunProcessorDialog } from "@/components/processors/run-processor-dialog"
import { EditProcessorSheet } from "@/components/processors/edit-processor-sheet"
import { PublishPlaybookDialog } from "@/components/processors/publish-playbook-dialog"
import {
  useUnpublishPlaybook,
  usePublishedSnapshot,
  useProcessorSnapshots,
} from "@/app/queries/playbook-snapshots"
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

interface ProcessorHeaderProps {
  processor: ProcessorDetail
  isDirty?: boolean
  hasLoadedVersion?: boolean
  loadedSnapshotId?: string | null
  onOpenSaveDialog?: () => void
}

export function ProcessorHeader({
  processor,
  isDirty = false,
  hasLoadedVersion = false,
  loadedSnapshotId,
  onOpenSaveDialog,
}: ProcessorHeaderProps) {
  const t = useTranslations('processors.header')

  const [isExpanded, setIsExpanded] = useState(false)
  const [isEditSheetOpen, setIsEditSheetOpen] = useState(false)
  const [isPublishDialogOpen, setIsPublishDialogOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const { data: llmConfig, isLoading: llmConfigLoading } = useResolvedLLMConfig(processor.processor_id)
  const { data: publishedSnapshot } = usePublishedSnapshot(processor.processor_id)
  const { data: snapshots } = useProcessorSnapshots(processor.processor_id)
  const unpublishPlaybook = useUnpublishPlaybook()

  // Check if processor has a published snapshot (snapshot table is source of truth)
  const hasPublishedVersionState = !!publishedSnapshot

  // Find the loaded version number
  const loadedVersionNumber = snapshots?.find(s => s.id === loadedSnapshotId)?.version_number

  useEffect(() => {
    setMounted(true)
  }, [])

  const handleUnpublish = async () => {
    if (!publishedSnapshot) return

    try {
      await unpublishPlaybook.mutateAsync(publishedSnapshot.id)
      toast.success('Playbook unpublished', {
        description: `Version ${publishedSnapshot.version_number} is now hidden from galleries.`,
      })
    } catch (error) {
      toast.error('Failed to unpublish playbook', {
        description: error instanceof Error ? error.message : 'Unknown error occurred',
      })
    }
  }

  const handlePublishSuccess = (snapshotId: string, versionNumber: number) => {
    toast.success('Playbook published', {
      description: `Version ${versionNumber} is now available.`,
    })
  }

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

  const formatRelativeTime = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)

    if (diffInSeconds < 60) return "just now"
    if (diffInSeconds < 3600) {
      const mins = Math.floor(diffInSeconds / 60)
      return `${mins} minute${mins !== 1 ? "s" : ""} ago`
    }
    if (diffInSeconds < 86400) {
      const hours = Math.floor(diffInSeconds / 3600)
      return `${hours} hour${hours !== 1 ? "s" : ""} ago`
    }
    if (diffInSeconds < 2592000) {
      const days = Math.floor(diffInSeconds / 86400)
      return `${days} day${days !== 1 ? "s" : ""} ago`
    }
    if (diffInSeconds < 31536000) {
      const months = Math.floor(diffInSeconds / 2592000)
      return `${months} month${months !== 1 ? "s" : ""} ago`
    }
    const years = Math.floor(diffInSeconds / 31536000)
    return `${years} year${years !== 1 ? "s" : ""} ago`
  }

  const VisibilityIcon = processor.visibility === "personal" ? Lock : Users

  // Get version display text
  const getVersionDisplayText = () => {
    if (!hasLoadedVersion && !loadedVersionNumber) {
      return 'Draft'
    }
    if (isDirty && loadedVersionNumber) {
      return `Draft (from v${loadedVersionNumber})`
    }
    if (loadedVersionNumber) {
      return `v${loadedVersionNumber} (loaded)`
    }
    return 'Draft'
  }

  return (
    <Collapsible
      open={isExpanded}
      onOpenChange={setIsExpanded}
      className="space-y-4 rounded-lg border bg-card p-6"
    >
      {/* Title and Description Row */}
      <div className="flex items-center gap-4 flex-1 min-w-0">
        <h1 className="text-2xl font-bold tracking-tight shrink-0">
          {processor.processor_name}
        </h1>
        {processor.processor_description && (
          <p
            className="text-muted-foreground text-sm truncate"
            title={processor.processor_description}
          >
            {processor.processor_description}
          </p>
        )}
      </div>

      {/* Version Selector, Change Indicator, and Action Buttons */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {/* Version Indicator Badge */}
          <Badge variant="outline" className="text-sm font-medium py-1 px-3">
            {getVersionDisplayText()}
          </Badge>

          {/* Change Indicator */}
          <span className={`text-sm ${isDirty ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`}>
            {isDirty ? 'Unsaved changes' : 'No changes'}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Save Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={onOpenSaveDialog}
            disabled={!isDirty || processor.operations?.length === 0}
            title={isDirty ? 'Save as new version' : 'No changes to save'}
          >
            <Save className="h-4 w-4 mr-2" />
            Save
          </Button>

          <RunProcessorDialog
            processorId={processor.processor_id}
            processorName={processor.processor_name}
            defaultView={(processor.configuration as { default_run_view?: 'technical' | 'compliance' | 'contract-comments' })?.default_run_view}
            hasPublishedVersion={hasPublishedVersionState}
            publishedVersion={publishedSnapshot?.version_number}
            trigger={
              <Button variant="default" size="sm" title={t('run')}>
                <Play className="h-4 w-4 mr-2" />
                {t('run')}
              </Button>
            }
          />
          <Button variant="ghost" size="icon" asChild title="View Runs">
            <Link href={`/proc/${processor.processor_id}/runs`}>
              <History className="h-4 w-4" />
              <span className="sr-only">View Runs</span>
            </Link>
          </Button>
          {mounted && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" title="More options">
                  <span className="sr-only">Open menu</span>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setIsEditSheetOpen(true)}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {hasPublishedVersionState ? (
                  <>
                    <DropdownMenuItem onClick={() => setIsPublishDialogOpen(true)}>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Update Version
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={handleUnpublish}
                      disabled={unpublishPlaybook.isPending}
                    >
                      <EyeOff className="mr-2 h-4 w-4" />
                      {unpublishPlaybook.isPending ? 'Unpublishing...' : 'Unpublish'}
                    </DropdownMenuItem>
                  </>
                ) : (
                  <DropdownMenuItem
                    onClick={() => setIsPublishDialogOpen(true)}
                    disabled={processor.operations?.length === 0}
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    Publish
                  </DropdownMenuItem>
                )}
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
          )}
        </div>
      </div>

      {/* Publish Status, Visibility, and Usage Description Row - Entire row clickable */}
      <CollapsibleTrigger asChild>
        <div className="flex gap-8 items-start hover:bg-accent/50 cursor-pointer transition-colors rounded-md p-2 -mx-2">
          {/* Published Version Column */}
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Published</span>
            <div className="flex items-center gap-2">
              {hasPublishedVersionState && publishedSnapshot ? (
                <Badge className="bg-green-500/10 text-green-700 dark:text-green-400">
                  v{publishedSnapshot.version_number}
                </Badge>
              ) : (
                <span className="text-sm text-muted-foreground">None</span>
              )}
              {processor.status === 'archived' && (
                <Badge className="bg-gray-500/10 text-gray-700 dark:text-gray-400">
                  Archived
                </Badge>
              )}
            </div>
          </div>

          {/* Visibility Column */}
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">{t('visibility')}</span>
            <div className="flex items-center gap-1.5 text-sm">
              <VisibilityIcon className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="capitalize">{processor.visibility}</span>
            </div>
          </div>

          {/* Usage Description */}
          {processor.usage_description && (
            <div className="flex-1">
              <p className="text-sm text-muted-foreground">
                {processor.usage_description}
              </p>
            </div>
          )}
        </div>
      </CollapsibleTrigger>

      {/* Expandable Additional Information */}
      <CollapsibleContent className="space-y-4">
        <div className="space-y-4 pt-2 border-t">
          {/* First Row: Tags, Created By, Last Updated, Operations Count */}
          <div className="flex gap-8 items-start">
            {/* Tags */}
            {processor.tags && processor.tags.length > 0 && (
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">{t('tags')}</span>
                <div className="flex flex-wrap gap-1.5">
                  {processor.tags.map((tag, index) => (
                    <Badge
                      key={index}
                      variant="outline"
                      className="text-xs font-normal"
                    >
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Created By */}
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Created by</span>
              <span className="text-sm">
                {processor.created_by_name || "Unknown"}
              </span>
            </div>

            {/* Last Updated */}
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Last updated</span>
              <span className="text-sm">
                {formatRelativeTime(processor.updated_at)}
              </span>
            </div>

            {/* Operations Count */}
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">
                Operations Count
              </span>
              <span className="text-sm">{processor.operations?.length ?? 0}</span>
            </div>
          </div>

          {/* Second Row: LLM Configuration */}
          <div className="flex gap-8 items-start pt-2 border-t">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">LLM Configuration</span>
              {llmConfigLoading ? (
                <span className="text-sm text-muted-foreground">Loading...</span>
              ) : llmConfig ? (
                <div className="space-y-1">
                  <div className="text-sm">
                    <span className="font-medium">{llmConfig.display_name || llmConfig.model}</span>
                    <span className="text-muted-foreground"> • {llmConfig.provider}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {llmConfig.api_key_encrypted
                      ? "Using organization API key"
                      : "Using system API key"}
                  </div>
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">No configuration found</span>
              )}
            </div>
          </div>
        </div>
      </CollapsibleContent>

      <EditProcessorSheet
        open={isEditSheetOpen}
        onOpenChange={setIsEditSheetOpen}
        processor={processor}
      />

      <PublishPlaybookDialog
        open={isPublishDialogOpen}
        onOpenChange={setIsPublishDialogOpen}
        processorId={processor.processor_id}
        processorName={processor.processor_name}
        operationCount={processor.operations?.length ?? 0}
        onSuccess={handlePublishSuccess}
      />
    </Collapsible>
  )
}