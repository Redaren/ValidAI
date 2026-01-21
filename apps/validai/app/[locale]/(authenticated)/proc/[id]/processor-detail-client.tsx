"use client"

import { useState, useMemo, useCallback } from "react"
import { useProcessorDetail, useCreateArea } from "@/app/queries/processors/use-processor-detail"
import { ProcessorHeader } from "@/components/processors/processor-header"
import { OperationsByArea } from "@/components/processors/operations-by-area"
import { CreateAreaDialog } from "@/components/processors/create-area-dialog"
import { BulkImportExportDialog } from "@/components/processors/bulk-import-export-dialog"
import { VersionHistoryTable } from "@/components/processors/version-history-table"
import { LoadVersionDialog } from "@/components/processors/load-version-dialog"
import { SaveVersionDialog } from "@/components/processors/save-version-dialog"
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@playze/shared-ui"
import { ArrowLeft, MoreHorizontal, FolderPlus, Settings, FlaskConical, FileSpreadsheet, Save, Play, History } from "lucide-react"
import { Link } from "@/lib/i18n/navigation"
import { ProcessorSettingsSheet } from "@/components/processors/processor-settings-sheet"
import { RunProcessorDialog } from "@/components/processors/run-processor-dialog"
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import {
  useSnapshotForComparison,
  useLoadSnapshot,
  useSaveAsVersion,
  usePublishedSnapshot,
  useProcessorSnapshots,
} from '@/app/queries/playbook-snapshots'
import { useDirtyState } from '@/hooks/use-dirty-state'
import { logger, extractErrorDetails } from '@/lib/utils/logger'

/**
 * Props for the ProcessorDetailClient component.
 */
interface ProcessorDetailClientProps {
  /** The UUID of the processor to display */
  processorId: string
}

/**
 * Client Component: Processor Detail View
 *
 * This is the main interactive component for viewing and managing a processor.
 * It displays the processor header, operations organized by areas, and provides
 * area management functionality.
 *
 * **Features:**
 * - Displays processor metadata (name, description, status, etc.)
 * - Shows operations grouped and organized by areas
 * - Allows creating new areas via dropdown menu
 * - Supports drag-and-drop for operations and areas (delegated to OperationsByArea)
 *
 * **Component Architecture:**
 * ```
 * ProcessorDetailClient
 * ├── ProcessorHeader (metadata display)
 * ├── Operations Section
 * │   ├── Dropdown Menu (area management)
 * │   └── OperationsByArea (drag-and-drop interface)
 * └── CreateAreaDialog (modal)
 * ```
 *
 * **State Management:**
 * - Uses TanStack Query for server state (processor data)
 * - Uses React state for UI state (dialog visibility)
 * - Rehydrates from server-prefetched data (see page.tsx)
 *
 * **Data Flow:**
 * 1. Component receives processorId from parent
 * 2. useProcessorDetail hook fetches/rehydrates processor data
 * 3. existingAreaNames computed for validation
 * 4. Changes propagate through mutation hooks to server
 * 5. Cache automatically invalidates and refetches
 *
 * @param processorId - UUID of the processor to display
 * @returns The interactive processor detail view
 */
export function ProcessorDetailClient({
  processorId,
}: ProcessorDetailClientProps) {
  const t = useTranslations('processors')
  const tCommon = useTranslations('common')
  const { data: processor, isLoading, error } = useProcessorDetail(processorId)
  const createArea = useCreateArea()

  // Dialog states
  const [isCreateAreaDialogOpen, setIsCreateAreaDialogOpen] = useState(false)
  const [isSettingsSheetOpen, setIsSettingsSheetOpen] = useState(false)
  const [isBulkImportExportOpen, setIsBulkImportExportOpen] = useState(false)
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false)
  const [isLoadDialogOpen, setIsLoadDialogOpen] = useState(false)

  // Tab state
  const [activeTab, setActiveTab] = useState<string>('editor')

  // Pending load state (for confirmation dialog)
  const [pendingLoad, setPendingLoad] = useState<{
    snapshotId: string
    versionNumber: number
  } | null>(null)

  // Fetch the loaded snapshot for dirty state comparison
  // Use useSnapshotForComparison instead of usePlaybookSnapshot
  // because usePlaybookSnapshot only returns published snapshots
  const { data: loadedSnapshot } = useSnapshotForComparison(
    processor?.loaded_snapshot_id || undefined
  )

  // Dirty state detection - pass loaded_snapshot_id as source of truth
  const { isDirty, hasLoadedVersion, isComparisonLoading } = useDirtyState(
    processor,
    loadedSnapshot,
    processor?.loaded_snapshot_id
  )

  // Mutations
  const loadSnapshot = useLoadSnapshot()
  const saveAsVersion = useSaveAsVersion()

  // Published snapshot and version info
  const { data: publishedSnapshot } = usePublishedSnapshot(processorId)
  const { data: snapshots } = useProcessorSnapshots(processorId)

  // Find the loaded version number
  const loadedVersionNumber = snapshots?.find(s => s.id === processor?.loaded_snapshot_id)?.version_number

  // Check if loaded version is the published version
  const isLoadedVersionPublished = publishedSnapshot?.id === processor?.loaded_snapshot_id

  // Check if processor has a published snapshot (snapshot table is source of truth)
  const hasPublishedVersionState = !!publishedSnapshot

  /**
   * Computed list of existing area names for uniqueness validation.
   * Used by CreateAreaDialog to prevent duplicate area names.
   */
  const existingAreaNames = useMemo(() => {
    return processor?.area_configuration?.areas?.map(a => a.name) || []
  }, [processor?.area_configuration])

  /**
   * Handle loading a version - checks for dirty state first
   */
  const handleLoadVersion = useCallback((snapshotId: string, versionNumber: number) => {
    if (isDirty) {
      // Show confirmation dialog
      setPendingLoad({ snapshotId, versionNumber })
      setIsLoadDialogOpen(true)
    } else {
      // Load directly
      performLoad(snapshotId, versionNumber)
    }
  }, [isDirty])

  /**
   * Perform the actual load operation
   */
  const performLoad = async (snapshotId: string, versionNumber: number) => {
    try {
      await loadSnapshot.mutateAsync({
        processorId,
        snapshotId,
      })
      toast.success(`Loaded version ${versionNumber}`)
      setIsLoadDialogOpen(false)
      setPendingLoad(null)
      setActiveTab('editor') // Switch to editor tab after load
    } catch (error) {
      logger.error('Failed to load version:', extractErrorDetails(error))
      toast.error('Failed to load version', {
        description: error instanceof Error ? error.message : 'Unknown error occurred',
      })
    }
  }

  /**
   * Save current state, then load the pending version
   */
  const handleSaveAndLoad = async () => {
    if (!pendingLoad || !processor) return

    try {
      // First save current state
      await saveAsVersion.mutateAsync({
        processorId,
        visibility: 'private',
      })
      toast.success('Current changes saved')

      // Then load the pending version
      await performLoad(pendingLoad.snapshotId, pendingLoad.versionNumber)
    } catch (error) {
      logger.error('Failed to save and load:', extractErrorDetails(error))
      toast.error('Failed to save changes', {
        description: error instanceof Error ? error.message : 'Unknown error occurred',
      })
    }
  }

  /**
   * Discard changes and load the pending version
   */
  const handleDiscardAndLoad = async () => {
    if (!pendingLoad) return
    await performLoad(pendingLoad.snapshotId, pendingLoad.versionNumber)
  }

  /**
   * Handle save version success
   */
  const handleSaveSuccess = (snapshotId: string, versionNumber: number) => {
    toast.success(`Saved as version ${versionNumber}`)
  }

  /**
   * Handle opening save dialog from header
   */
  const handleOpenSaveDialog = useCallback(() => {
    setIsSaveDialogOpen(true)
  }, [])

  /**
   * Get the version text to display in the editor tab
   */
  const getEditorVersionText = () => {
    // If comparison is loading, show the version number while waiting
    if (isComparisonLoading && loadedVersionNumber) {
      return isLoadedVersionPublished
        ? `v${loadedVersionNumber} - (Live)`
        : `v${loadedVersionNumber}`
    }
    if (isDirty) {
      return 'Draft'
    }
    if (loadedVersionNumber) {
      return isLoadedVersionPublished
        ? `v${loadedVersionNumber} - (Live)`
        : `v${loadedVersionNumber}`
    }
    return 'Draft'
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="text-muted-foreground">{t('loading')}</div>
      </div>
    )
  }

  if (error || !processor) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center gap-4">
        <div className="text-destructive">{t('failed')}</div>
        <Button asChild variant="outline">
          <Link href="/proc">
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t('backToList')}
          </Link>
        </Button>
      </div>
    )
  }

  /**
   * Handles creating a new area.
   * Mutations are handled by TanStack Query with automatic cache invalidation.
   *
   * @param areaName - The name of the new area to create
   */
  const handleCreateArea = (areaName: string) => {
    createArea.mutate(
      {
        processorId: processor.processor_id,
        areaName,
      },
      {
        onSuccess: () => {
          setIsCreateAreaDialogOpen(false)
        },
      }
    )
  }

  return (
    <div className="container mx-auto space-y-6 py-6">
      {/* Processor Header with version management */}
      <ProcessorHeader
        processor={processor}
        isDirty={isDirty}
        hasLoadedVersion={hasLoadedVersion}
        loadedSnapshotId={processor.loaded_snapshot_id}
        isComparisonLoading={isComparisonLoading}
      />

      {/* Tabs: Editor / Versions */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="editor">Editor</TabsTrigger>
          <TabsTrigger value="versions">Versions</TabsTrigger>
        </TabsList>

        {/* Editor Tab */}
        <TabsContent value="editor" className="space-y-4">
          <div className="space-y-4 rounded-lg border bg-card p-6">
            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Version</span>
                <span className={`text-sm ${isDirty || !loadedVersionNumber ? 'text-amber-600 dark:text-amber-400' : ''}`}>{getEditorVersionText()}</span>
              </div>
              <div className="flex items-center gap-2">
                {/* Save Button - only shown when there are unsaved changes */}
                {isDirty && (
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleOpenSaveDialog}
                    disabled={processor.operations?.length === 0}
                    title={t('detail.saveAsNewVersion')}
                  >
                    <Save className="h-4 w-4" />
                    <span className="sr-only">{tCommon('save')}</span>
                  </Button>
                )}

                {/* Run Button */}
                <RunProcessorDialog
                  processorId={processor.processor_id}
                  processorName={processor.processor_name}
                  defaultView={(processor.configuration as { default_run_view?: 'technical' | 'compliance' | 'contract-comments' })?.default_run_view}
                  hasPublishedVersion={hasPublishedVersionState}
                  publishedVersion={publishedSnapshot?.version_number}
                  trigger={
                    <Button variant="default" size="icon" title={t('run')}>
                      <Play className="h-4 w-4" />
                      <span className="sr-only">{t('run')}</span>
                    </Button>
                  }
                />

                {/* View Runs Button */}
                <Button variant="ghost" size="icon" asChild title={t('detail.viewRuns')}>
                  <Link href={`/proc/${processor.processor_id}/runs`}>
                    <History className="h-4 w-4" />
                    <span className="sr-only">{t('detail.viewRuns')}</span>
                  </Link>
                </Button>

                {/* More Options Dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" title={tCommon('moreOptions')}>
                      <span className="sr-only">{tCommon('openMenu')}</span>
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setIsSettingsSheetOpen(true)}>
                      <Settings className="mr-2 h-4 w-4" />
                      {t('detail.settings')}
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href={`/proc/${processor.processor_id}/workbench`}>
                        <FlaskConical className="mr-2 h-4 w-4" />
                        {t('detail.workbench')}
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setIsCreateAreaDialogOpen(true)}>
                      <FolderPlus className="mr-2 h-4 w-4" />
                      {t('detail.newArea')}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setIsBulkImportExportOpen(true)}>
                      <FileSpreadsheet className="mr-2 h-4 w-4" />
                      {t('detail.bulkImportExport')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
            <OperationsByArea processor={processor} />
          </div>
        </TabsContent>

        {/* Versions Tab */}
        <TabsContent value="versions" className="space-y-4">
          <div className="space-y-4 rounded-lg border bg-card p-6">
            <h2 className="text-xl font-semibold">Version History</h2>
            <VersionHistoryTable
              processorId={processor.processor_id}
              loadedSnapshotId={processor.loaded_snapshot_id}
              onLoad={handleLoadVersion}
              isDirty={isDirty}
            />
          </div>
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <CreateAreaDialog
        open={isCreateAreaDialogOpen}
        onOpenChange={setIsCreateAreaDialogOpen}
        existingNames={existingAreaNames}
        onCreate={handleCreateArea}
        isLoading={createArea.isPending}
      />

      <ProcessorSettingsSheet
        open={isSettingsSheetOpen}
        onOpenChange={setIsSettingsSheetOpen}
        processor={processor}
      />

      <BulkImportExportDialog
        open={isBulkImportExportOpen}
        onOpenChange={setIsBulkImportExportOpen}
        processor={processor}
      />

      <SaveVersionDialog
        open={isSaveDialogOpen}
        onOpenChange={setIsSaveDialogOpen}
        processorId={processor.processor_id}
        processorName={processor.processor_name}
        operationCount={processor.operations?.length ?? 0}
        onSuccess={handleSaveSuccess}
      />

      {pendingLoad && (
        <LoadVersionDialog
          open={isLoadDialogOpen}
          onOpenChange={(open) => {
            setIsLoadDialogOpen(open)
            if (!open) setPendingLoad(null)
          }}
          versionNumber={pendingLoad.versionNumber}
          onSaveAndLoad={handleSaveAndLoad}
          onDiscardAndLoad={handleDiscardAndLoad}
          isSaving={saveAsVersion.isPending}
          isLoading={loadSnapshot.isPending}
        />
      )}
    </div>
  )
}