"use client"

import { useEffect, useState } from "react"
import { useTheme } from "next-themes"
import { createBrowserClient } from "@playze/shared-auth/client"
import { useCurrentOrganization } from "@playze/shared-auth"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Avatar,
  AvatarFallback,
  AvatarImage,
  Badge,
  Label,
} from "@playze/shared-ui"
import { Skeleton } from "@/components/ui/skeleton"
import { useTranslations } from 'next-intl'

type User = {
  name: string
  email: string
  avatar?: string
}

export default function AccountPage() {
  const t = useTranslations('account')
  const tCommon = useTranslations('common')
  const [mounted, setMounted] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const { theme, setTheme } = useTheme()
  const { data: currentOrg, isLoading: orgLoading } = useCurrentOrganization()

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    const supabase = createBrowserClient()

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


  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground">
          {t('description')}
        </p>
      </div>

      {/* Profile Section */}
      <Card>
        <CardHeader>
          <CardTitle>{t('profile.title')}</CardTitle>
          <CardDescription>
            {t('profile.description')}
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
                  <Label className="text-muted-foreground">{t('profile.name')}</Label>
                  <p className="text-sm font-medium">{user?.name}</p>
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground">{t('profile.email')}</Label>
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
          <CardTitle>{t('appearance.title')}</CardTitle>
          <CardDescription>
            {t('appearance.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="theme-select">{t('appearance.theme')}</Label>
            <Select value={theme} onValueChange={setTheme}>
              <SelectTrigger id="theme-select" className="w-full sm:w-[300px]">
                <SelectValue placeholder={t('appearance.selectTheme')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">{t('appearance.themeLight')}</SelectItem>
                <SelectItem value="dark">{t('appearance.themeDark')}</SelectItem>
                <SelectItem value="claude-light">{t('appearance.themeClaudeLight')}</SelectItem>
                <SelectItem value="claude-dark">{t('appearance.themeClaudeDark')}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {t('appearance.themeDescription')}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Organization Context Section */}
      <Card>
        <CardHeader>
          <CardTitle>{t('organization.title')}</CardTitle>
          <CardDescription>
            {t('organization.description')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {orgLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-32" />
            </div>
          ) : currentOrg ? (
            <div className="space-y-2">
              <Label className="text-muted-foreground">{t('organization.currentOrg')}</Label>
              <p className="text-sm font-medium">{currentOrg.name}</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t('organization.noOrgSelected')}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
