'use client'

import { useParams } from 'next/navigation'
import { formatDistanceToNow } from 'date-fns'
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Avatar,
  AvatarFallback,
  Skeleton,
} from '@playze/shared-ui'
import { Calendar } from 'lucide-react'
import { useUser, useUserPreferences } from '@/lib/queries'
import { UserProfileTab } from './_components/user-profile-tab'
import { UserOrganizationsTab } from './_components/user-organizations-tab'

interface User {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  created_at: string
  organization_count: number
}

interface Preferences {
  theme: string | null
  language: string | null
  email_notifications: boolean | null
}

export default function UserDetailsPage() {
  const params = useParams()
  const userId = params.id as string

  const { data: user, isLoading: loadingUser } = useUser(userId) as {
    data: User | null | undefined
    isLoading: boolean
  }

  const { data: preferences, isLoading: loadingPreferences } = useUserPreferences(userId) as {
    data: Preferences | null | undefined
    isLoading: boolean
  }

  // Show "not found" only after loading completes with no data
  if (!loadingUser && !user) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">User Not Found</h1>
          <p className="text-muted-foreground">
            The user you&apos;re looking for doesn&apos;t exist or you don&apos;t have permission to view it.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Compact Header - Show skeleton while loading */}
      <div className="flex items-center gap-6">
        {loadingUser ? (
          <>
            <Skeleton className="h-16 w-16 rounded-full" />
            <div className="flex-1 min-w-0 space-y-2">
              <Skeleton className="h-7 w-48" />
              <Skeleton className="h-4 w-64" />
            </div>
          </>
        ) : user ? (
          <>
            <Avatar className="h-16 w-16">
              {user.avatar_url && (
                <img
                  src={user.avatar_url}
                  alt={user.full_name || user.email}
                  className="h-full w-full object-cover"
                />
              )}
              <AvatarFallback className="text-xl">
                {user.email[0].toUpperCase()}
              </AvatarFallback>
            </Avatar>

            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold truncate">
                {user.full_name || 'No name provided'}
              </h1>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span className="truncate">{user.email}</span>
                <span className="hidden sm:inline">·</span>
                <span className="hidden sm:flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  Joined {formatDistanceToNow(new Date(user.created_at), { addSuffix: true })}
                </span>
              </div>
            </div>
          </>
        ) : null}
      </div>

      {/* Tabs - Show immediately with loading states inside */}
      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="organizations">
            Organizations {user ? `(${user.organization_count})` : ''}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <UserProfileTab
            user={user || null}
            preferences={preferences || null}
            isLoading={loadingUser || loadingPreferences}
          />
        </TabsContent>

        <TabsContent value="organizations">
          <UserOrganizationsTab
            userId={userId}
            userName={user?.full_name || user?.email || ''}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
