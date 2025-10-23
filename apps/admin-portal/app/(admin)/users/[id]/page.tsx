import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { formatDistanceToNow } from 'date-fns'
import { Card, CardHeader, CardTitle, CardContent, Avatar, AvatarImage, AvatarFallback, Badge } from '@playze/shared-ui'
import { UserOrgMemberships } from '@/components/users/user-org-memberships'
import { createServerClient } from '@playze/shared-auth/server'
import { Mail, Calendar, Globe, Bell } from 'lucide-react'

interface UserDetailsPageProps {
  params: Promise<{ id: string }>
}

export async function generateMetadata({
  params,
}: UserDetailsPageProps): Promise<Metadata> {
  const { id } = await params
  const supabase = await createServerClient()

  // Call admin function to get user (bypasses RLS)
  // Note: Using 'any' type assertion because admin RPC functions aren't in generated types yet
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase.rpc as any)('admin_get_user', { user_id: id })
  const user = data?.[0]

  return {
    title: user ? `${user.full_name || user.email} | Admin Portal` : 'User Not Found',
  }
}

export default async function UserDetailsPage({ params }: UserDetailsPageProps) {
  const { id } = await params
  const supabase = await createServerClient()

  // Fetch user profile via admin function
  // Note: Using 'any' type assertion because admin RPC functions aren't in generated types yet
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: userData, error } = await (supabase.rpc as any)('admin_get_user', { user_id: id })
  const user = userData?.[0]

  if (error || !user) {
    notFound()
  }

  // Fetch user preferences via admin function
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: preferencesData } = await (supabase.rpc as any)('admin_get_user_preferences', { user_id: id })
  const preferences = preferencesData?.[0]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-6">
        <Avatar className="h-20 w-20">
          <AvatarImage
            src={user.avatar_url || undefined}
            alt={user.full_name || user.email}
          />
          <AvatarFallback className="text-2xl">
            {user.email[0].toUpperCase()}
          </AvatarFallback>
        </Avatar>

        <div className="flex-1">
          <h1 className="text-3xl font-bold">
            {user.full_name || 'No name provided'}
          </h1>
          <p className="text-lg text-muted-foreground">{user.email}</p>

          <div className="mt-4 flex items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              <span>
                Joined {formatDistanceToNow(new Date(user.created_at), { addSuffix: true })}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Profile Details */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* User Information */}
        <Card>
          <CardHeader>
            <CardTitle>User Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Email</p>
                <p className="text-sm text-muted-foreground">{user.email}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Created</p>
                <p className="text-sm text-muted-foreground">
                  {new Date(user.created_at).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Preferences */}
        <Card>
          <CardHeader>
            <CardTitle>Preferences</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {preferences ? (
              <>
                <div className="flex items-center gap-3">
                  <Globe className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Theme</p>
                    <Badge variant="secondary">{preferences.theme || 'system'}</Badge>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Globe className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Language</p>
                    <Badge variant="secondary">{preferences.language || 'en'}</Badge>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Bell className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Notifications</p>
                    <Badge variant={preferences.email_notifications ? 'default' : 'secondary'} className={preferences.email_notifications ? 'bg-green-600' : ''}>
                      {preferences.email_notifications ? 'Enabled' : 'Disabled'}
                    </Badge>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No preferences set</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Organization Memberships */}
      <div>
        <h2 className="text-2xl font-bold mb-4">Organization Memberships</h2>
        <UserOrgMemberships userId={id} />
      </div>
    </div>
  )
}
