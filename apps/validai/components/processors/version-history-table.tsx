/**
 * Version History Table Component
 *
 * @module components/processors/version-history-table
 * @description
 * Table displaying all saved versions (snapshots) for a processor.
 * Supports loading versions, publishing/unpublishing, and changing visibility.
 *
 * @since Version Management UI Redesign
 */

'use client'

import * as React from 'react'
import {
  MoreHorizontal,
  Download,
  Eye,
  EyeOff,
  Lock,
  Users,
  Globe,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  History,
} from 'lucide-react'
import {
  ColumnDef,
  SortingState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { formatDistanceToNow } from 'date-fns'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Button,
  Badge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@playze/shared-ui'
import { toast } from 'sonner'
import {
  useProcessorSnapshots,
  useSetPublishedVersion,
  useUpdatePlaybookVisibility,
  type PlaybookSnapshotMeta,
  type PlaybookVisibility,
} from '@/app/queries/playbook-snapshots'
import { logger, extractErrorDetails } from '@/lib/utils/logger'

interface VersionHistoryTableProps {
  processorId: string
  loadedSnapshotId: string | null
  onLoad: (snapshotId: string, versionNumber: number) => void
  isDirty?: boolean
}

export function VersionHistoryTable({
  processorId,
  loadedSnapshotId,
  onLoad,
  isDirty = false,
}: VersionHistoryTableProps) {
  const { data: snapshots, isLoading, error } = useProcessorSnapshots(processorId)
  const setPublishedVersion = useSetPublishedVersion()
  const updateVisibility = useUpdatePlaybookVisibility()
  const [sorting, setSorting] = React.useState<SortingState>([])

  const handlePublish = async (snapshotId: string, versionNumber: number) => {
    try {
      await setPublishedVersion.mutateAsync({
        snapshotId,
        publish: true,
        processorId,
      })
      toast.success(`Version ${versionNumber} published`)
    } catch (error) {
      logger.error('Failed to publish version:', extractErrorDetails(error))
      toast.error('Failed to publish version', {
        description: error instanceof Error ? error.message : 'Unknown error occurred',
      })
    }
  }

  const handleUnpublish = async (snapshotId: string, versionNumber: number) => {
    try {
      await setPublishedVersion.mutateAsync({
        snapshotId,
        publish: false,
        processorId,
      })
      toast.success(`Version ${versionNumber} unpublished`)
    } catch (error) {
      logger.error('Failed to unpublish version:', extractErrorDetails(error))
      toast.error('Failed to unpublish version', {
        description: error instanceof Error ? error.message : 'Unknown error occurred',
      })
    }
  }

  const handleVisibilityChange = async (
    snapshotId: string,
    visibility: PlaybookVisibility,
    versionNumber: number
  ) => {
    try {
      await updateVisibility.mutateAsync({
        snapshotId,
        visibility,
      })
      toast.success(`Version ${versionNumber} visibility changed to ${visibility}`)
    } catch (error) {
      logger.error('Failed to update visibility:', extractErrorDetails(error))
      toast.error('Failed to update visibility', {
        description: error instanceof Error ? error.message : 'Unknown error occurred',
      })
    }
  }

  const getVisibilityIcon = (visibility: PlaybookVisibility) => {
    switch (visibility) {
      case 'private':
        return Lock
      case 'organization':
        return Users
      case 'public':
        return Globe
      default:
        return Lock
    }
  }

  const getVisibilityLabel = (visibility: PlaybookVisibility) => {
    switch (visibility) {
      case 'private':
        return 'Private'
      case 'organization':
        return 'Organization'
      case 'public':
        return 'Public'
      default:
        return visibility
    }
  }

  const columns = React.useMemo<ColumnDef<PlaybookSnapshotMeta>[]>(
    () => [
      {
        accessorKey: 'version_number',
        header: 'Version',
        cell: ({ row }) => {
          const isLoaded = row.original.id === loadedSnapshotId
          return (
            <div className="flex items-center gap-2">
              <span className="font-medium">v{row.original.version_number}</span>
              {isLoaded && (
                <Badge variant="outline" className="text-xs">
                  <ArrowLeft className="h-3 w-3 mr-1" />
                  loaded
                </Badge>
              )}
            </div>
          )
        },
      },
      {
        accessorKey: 'is_published',
        header: 'Status',
        cell: ({ row }) => {
          if (row.original.is_published) {
            return (
              <Badge className="bg-green-500/10 text-green-700 dark:text-green-400">
                Published
              </Badge>
            )
          }
          return <span className="text-muted-foreground">—</span>
        },
      },
      {
        accessorKey: 'visibility',
        header: 'Visibility',
        cell: ({ row }) => {
          const visibility = row.original.visibility as PlaybookVisibility
          const Icon = getVisibilityIcon(visibility)
          return (
            <div className="flex items-center gap-1.5">
              <Icon className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-sm">{getVisibilityLabel(visibility)}</span>
            </div>
          )
        },
      },
      {
        accessorKey: 'operation_count',
        header: 'Operations',
        cell: ({ row }) => (
          <span className="text-sm">{row.original.operation_count} ops</span>
        ),
      },
      {
        accessorKey: 'created_at',
        header: 'Created',
        cell: ({ row }) => {
          const date = new Date(row.original.created_at)
          const relativeTime = formatDistanceToNow(date, { addSuffix: true })
          const creatorName = row.original.created_by_name || 'Unknown'
          return (
            <div className="flex flex-col">
              <span className="text-sm">{relativeTime}</span>
              <span className="text-xs text-muted-foreground">{creatorName}</span>
            </div>
          )
        },
      },
      {
        id: 'actions',
        cell: ({ row }) => {
          const snapshot = row.original
          const isLoaded = snapshot.id === loadedSnapshotId

          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="h-8 w-8 p-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className="sr-only">Open menu</span>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => onLoad(snapshot.id, snapshot.version_number)}
                  disabled={isLoaded}
                >
                  <Download className="mr-2 h-4 w-4" />
                  {isLoaded ? 'Already loaded' : 'Load this version'}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {snapshot.is_published ? (
                  <DropdownMenuItem
                    onClick={() => handleUnpublish(snapshot.id, snapshot.version_number)}
                    disabled={setPublishedVersion.isPending}
                  >
                    <EyeOff className="mr-2 h-4 w-4" />
                    Unpublish
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    onClick={() => handlePublish(snapshot.id, snapshot.version_number)}
                    disabled={setPublishedVersion.isPending}
                  >
                    <Eye className="mr-2 h-4 w-4" />
                    Publish this version
                  </DropdownMenuItem>
                )}
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Lock className="mr-2 h-4 w-4" />
                    Change visibility
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuItem
                      onClick={() =>
                        handleVisibilityChange(snapshot.id, 'private', snapshot.version_number)
                      }
                      disabled={snapshot.visibility === 'private' || updateVisibility.isPending}
                    >
                      <Lock className="mr-2 h-4 w-4" />
                      Private
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() =>
                        handleVisibilityChange(snapshot.id, 'organization', snapshot.version_number)
                      }
                      disabled={snapshot.visibility === 'organization' || updateVisibility.isPending}
                    >
                      <Users className="mr-2 h-4 w-4" />
                      Organization
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </DropdownMenuContent>
            </DropdownMenu>
          )
        },
      },
    ],
    [loadedSnapshotId, onLoad, setPublishedVersion.isPending, updateVisibility.isPending]
  )

  const table = useReactTable({
    data: snapshots || [],
    columns,
    state: {
      sorting,
    },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: {
        pageSize: 10,
      },
    },
  })

  // Empty state
  if (!isLoading && (!snapshots || snapshots.length === 0)) {
    return (
      <div className="flex min-h-[300px] flex-col items-center justify-center rounded-md border border-dashed p-8 text-center">
        <div className="mx-auto flex max-w-[420px] flex-col items-center justify-center text-center">
          <History className="h-10 w-10 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-semibold">No versions yet</h3>
          <p className="mb-4 mt-2 text-sm text-muted-foreground">
            Save your first version to start tracking changes. Use the &quot;Save&quot; button
            in the header to create a version.
          </p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-[300px] flex-col items-center justify-center rounded-md border border-dashed p-8 text-center">
        <div className="text-destructive">Failed to load version history</div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="bg-area-header">
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  Loading versions...
                </TableCell>
              </TableRow>
            ) : table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.original.id === loadedSnapshotId && 'selected'}
                  className={row.original.id === loadedSnapshotId ? 'bg-muted/50' : ''}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  No versions found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {snapshots && snapshots.length > 10 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
