'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { DataTable, type ColumnDef } from '@playze/shared-ui'
import { Badge, Avatar, AvatarImage, AvatarFallback, Input } from '@playze/shared-ui'
import { useUsers } from '@/lib/queries'
import { Search } from 'lucide-react'

interface UserWithCount {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  created_at: string
  organization_count: number
}

export function UsersTable() {
  const [search, setSearch] = useState('')
  const { data: users, isLoading } = useUsers({ search, limit: 50 }) as {
    data: UserWithCount[] | undefined
    isLoading: boolean
  }

  const columns: ColumnDef<UserWithCount>[] = useMemo(
    () => [
      {
        id: 'user',
        header: 'User',
        cell: ({ row }) => (
          <Link
            href={`/users/${row.original.id}`}
            className="flex items-center gap-3 hover:underline"
          >
            <Avatar>
              <AvatarImage
                src={row.original.avatar_url || undefined}
                alt={row.original.full_name || row.original.email}
              />
              <AvatarFallback>
                {row.original.email[0].toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <div className="font-medium">
                {row.original.full_name || 'No name'}
              </div>
              <div className="text-sm text-muted-foreground">
                {row.original.email}
              </div>
            </div>
          </Link>
        ),
      },
      {
        accessorKey: 'organization_count',
        header: 'Organizations',
        cell: ({ row }) => (
          <Badge variant="secondary">
            {row.original.organization_count} {row.original.organization_count === 1 ? 'org' : 'orgs'}
          </Badge>
        ),
      },
      {
        accessorKey: 'created_at',
        header: 'Joined',
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {formatDistanceToNow(new Date(row.original.created_at), {
              addSuffix: true,
            })}
          </span>
        ),
      },
    ],
    []
  )

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search users by name or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Data table */}
      <DataTable
        columns={columns}
        data={users || []}
        isLoading={isLoading}
      />
    </div>
  )
}
