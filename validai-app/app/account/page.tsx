"use client"

import { useEffect, useState } from "react"
import { useTheme } from "next-themes"
import { createClient } from "@/lib/supabase/client"
import { useCurrentOrganization } from "@/app/queries/organizations/use-organizations"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Label } from "@/components/ui/label"

type User = {
  name: string
  email: string
  avatar?: string
}

export default function AccountPage() {
  const [mounted, setMounted] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const { theme, setTheme } = useTheme()
  const { data: orgData, isLoading: orgLoading } = useCurrentOrganization()

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    const supabase = createClient()

    const getUser = async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (authUser) {
        setUser({
          name: authUser.user_metadata?.name || authUser.email?.split('@')[0] || 'User',
          email: authUser.email || '',
          avatar: authUser.user_metadata?.avatar_url
        })
      }
      setLoading(false)
    }

    getUser()
  }, [])

  if (!mounted) {
    return null
  }

  const initials = user?.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'U'

  const getRoleBadgeVariant = (role: string | null) => {
    switch (role) {
      case 'owner':
        return 'default'
      case 'admin':
        return 'secondary'
      case 'member':
        return 'outline'
      case 'viewer':
        return 'outline'
      default:
        return 'outline'
    }
  }

  const getRoleLabel = (role: string | null) => {
    if (!role) return 'No Role'
    return role.charAt(0).toUpperCase() + role.slice(1)
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Account Settings</h1>
        <p className="text-muted-foreground">
          Manage your personal preferences and account information
        </p>
      </div>

      {/* Profile Section */}
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>
            Your personal information from authentication provider
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {loading ? (
            <div className="flex items-center gap-4">
              <Skeleton className="h-16 w-16 rounded-lg" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-64" />
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16 rounded-lg">
                  <AvatarImage src={user?.avatar} alt={user?.name} />
                  <AvatarFallback className="rounded-lg text-lg">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="space-y-1">
                  <p className="text-sm font-medium leading-none">{user?.name}</p>
                  <p className="text-sm text-muted-foreground">{user?.email}</p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Name</Label>
                  <p className="text-sm font-medium">{user?.name}</p>
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Email</Label>
                  <p className="text-sm font-medium">{user?.email}</p>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Appearance Section */}
      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>
            Customize how the application looks for you
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="theme-select">Theme</Label>
            <Select value={theme} onValueChange={setTheme}>
              <SelectTrigger id="theme-select" className="w-full sm:w-[300px]">
                <SelectValue placeholder="Select a theme" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="dark">Dark</SelectItem>
                <SelectItem value="system">System</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Choose how the application appears. System matches your operating system setting.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Organization Context Section */}
      <Card>
        <CardHeader>
          <CardTitle>Organization Context</CardTitle>
          <CardDescription>
            Your role and access level in the current organization
          </CardDescription>
        </CardHeader>
        <CardContent>
          {orgLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-32" />
            </div>
          ) : orgData?.organization ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-muted-foreground">Current Organization</Label>
                <p className="text-sm font-medium">{orgData.organization.name}</p>
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground">Your Role</Label>
                <div>
                  <Badge variant={getRoleBadgeVariant(orgData.role)}>
                    {getRoleLabel(orgData.role)}
                  </Badge>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No organization selected
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
