'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { DataTable, type ColumnDef } from '@playze/shared-ui'
import { Badge, Button, Input } from '@playze/shared-ui'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@playze/shared-ui'
import { Search, MoreVertical } from 'lucide-react'
import { useSubscriptions } from '@/lib/queries'
import { UpdateTierDialog } from './update-tier-dialog'
import { CancelSubscriptionDialog } from './cancel-subscription-dialog'
import { AssignSubscriptionDialog } from './assign-subscription-dialog'

interface SubscriptionRow {
  id: string
  organization_id: string
  organization_name: string
  app_id: string
  app_name: string
  app_description: string
  tier_id: string
  tier_name: string
  tier_display_name: string
  tier_features: unknown
  tier_limits: unknown
  status: string
  billing_period_start: string | null
  billing_period_end: string | null
  assigned_at: string
  created_at: string
  updated_at: string
  notes: string | null
}

const STATUS_COLORS = {
  active: 'default',
  past_due: 'outline',
  canceled: 'secondary',
} as const

export function SubscriptionsTable() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('active')

  const [selectedSubscription, setSelectedSubscription] = useState<SubscriptionRow | null>(null)
  const [updateTierOpen, setUpdateTierOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)

  const { data: subscriptions, isLoading } = useSubscriptions({
    status: statusFilter,
    search,
  })

  const columns: ColumnDef<SubscriptionRow>[] = useMemo(
    () => [
      {
        id: 'organization',
        header: 'Organization',
        cell: ({ row }) => (
          <Link
            href={`/organizations/${row.original.organization_id}`}
            className="hover:underline font-medium"
          >
            {row.original.organization_name}
          </Link>
        ),
      },
      {
        id: 'app',
        header: 'App',
        cell: ({ row }) => <span className="font-medium">{row.original.app_name}</span>,
      },
      {
        id: 'tier',
        header: 'Tier',
        cell: ({ row }) => <Badge variant="outline">{row.original.tier_display_name}</Badge>,
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => (
          <Badge
            variant={
              STATUS_COLORS[row.original.status as keyof typeof STATUS_COLORS] || 'secondary'
            }
          >
            {row.original.status}
          </Badge>
        ),
      },
      {
        id: 'billing_period',
        header: 'Billing Period',
        cell: ({ row }) => {
          if (!row.original.billing_period_start)
            return <span className="text-muted-foreground">-</span>
          const start = new Date(row.original.billing_period_start)
          const end = row.original.billing_period_end
            ? new Date(row.original.billing_period_end)
            : null
          return (
            <span className="text-sm">
              {start.toLocaleDateString()}
              {end && ` - ${end.toLocaleDateString()}`}
            </span>
          )
        },
      },
      {
        accessorKey: 'assigned_at',
        header: 'Assigned',
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {formatDistanceToNow(new Date(row.original.assigned_at), { addSuffix: true })}
          </span>
        ),
      },
      {
        id: 'actions',
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/organizations/${row.original.organization_id}`}>
                  View Organization
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  setSelectedSubscription(row.original)
                  setUpdateTierOpen(true)
                }}
                disabled={row.original.status === 'canceled'}
              >
                Update Tier
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  setSelectedSubscription(row.original)
                  setCancelOpen(true)
                }}
                disabled={row.original.status === 'canceled'}
                className="text-destructive"
              >
                Cancel Subscription
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    []
  )

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by organization name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border rounded-md px-3 py-2"
        >
          <option value="all">All Statuses</option>
          <option value="active">Active</option>
          <option value="past_due">Past Due</option>
          <option value="canceled">Canceled</option>
        </select>

        <Button onClick={() => setAssignOpen(true)}>Assign Subscription</Button>
      </div>

      {/* Data table */}
      <DataTable columns={columns} data={subscriptions || []} isLoading={isLoading} />

      {/* Dialogs */}
      {selectedSubscription && (
        <>
          <UpdateTierDialog
            open={updateTierOpen}
            onOpenChange={setUpdateTierOpen}
            subscription={selectedSubscription}
          />

          <CancelSubscriptionDialog
            open={cancelOpen}
            onOpenChange={setCancelOpen}
            subscription={selectedSubscription}
          />
        </>
      )}

      <AssignSubscriptionDialog open={assignOpen} onOpenChange={setAssignOpen} />
    </div>
  )
}
