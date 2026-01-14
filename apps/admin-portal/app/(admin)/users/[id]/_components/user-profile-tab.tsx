'use client'

import { useState, useEffect } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Card,
  Button,
  Input,
  Label,
  Switch,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
} from '@playze/shared-ui'
import { Loader2, Pencil, Mail, Globe, Bell, Trash2 } from 'lucide-react'
import { z } from 'zod'
import { useUpdateUserProfile, useUpdateUserPreferences } from '@/lib/queries'
import { useToastStore } from '@/stores'
import { formatDate } from '@/lib/utils'
import { DeleteUserDialog } from '@/components/users/delete-user-dialog'

interface UserProfileTabProps {
  user: {
    id: string
    email: string
    full_name: string | null
    avatar_url: string | null
    created_at: string
    organization_count: number
  } | null
  preferences: {
    theme: string | null
    language: string | null
    email_notifications: boolean | null
  } | null
  isLoading?: boolean
}

// Combined form schema
const userProfileFormSchema = z.object({
  fullName: z.string().min(1, 'Name is required').max(255).trim(),
  avatarUrl: z.string().url('Invalid URL format').optional().or(z.literal('')),
  theme: z.enum(['light', 'dark', 'system']),
  language: z.string().min(2).max(10),
  emailNotifications: z.boolean(),
})

type UserProfileFormData = z.infer<typeof userProfileFormSchema>

export function UserProfileTab({ user, preferences, isLoading }: UserProfileTabProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const updateProfile = useUpdateUserProfile()
  const updatePreferences = useUpdateUserPreferences()
  const addToast = useToastStore((state) => state.addToast)

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<UserProfileFormData>({
    resolver: zodResolver(userProfileFormSchema),
    defaultValues: {
      fullName: user?.full_name || '',
      avatarUrl: user?.avatar_url || '',
      theme: (preferences?.theme as 'light' | 'dark' | 'system') || 'system',
      language: preferences?.language || 'en',
      emailNotifications: preferences?.email_notifications ?? true,
    },
  })

  // Single subscription to form values - avoids re-render cascade from multiple watch() calls
  const watchedValues = useWatch({ control })

  const languageLabels: Record<string, string> = {
    en: 'English',
    sv: 'Swedish',
    no: 'Norwegian',
    da: 'Danish',
    fi: 'Finnish',
  }

  // Reset form when user/preferences data loads
  useEffect(() => {
    if (user || preferences) {
      reset({
        fullName: user?.full_name || '',
        avatarUrl: user?.avatar_url || '',
        theme: (preferences?.theme as 'light' | 'dark' | 'system') || 'system',
        language: preferences?.language || 'en',
        emailNotifications: preferences?.email_notifications ?? true,
      })
    }
  }, [user, preferences, reset])

  const onSubmit = async (data: UserProfileFormData) => {
    if (!user) return

    try {
      // Update profile (name, avatar)
      await updateProfile.mutateAsync({
        userId: user.id,
        fullName: data.fullName,
        avatarUrl: data.avatarUrl || null,
      })

      // Update preferences
      await updatePreferences.mutateAsync({
        userId: user.id,
        theme: data.theme,
        language: data.language,
        emailNotifications: data.emailNotifications,
      })

      addToast({
        title: 'Profile updated',
        description: 'User profile and preferences have been updated successfully.',
        variant: 'success',
      })

      setIsEditing(false)
    } catch (error) {
      console.error('Error updating user profile:', error)
      addToast({
        title: 'Error updating profile',
        description: error instanceof Error ? error.message : 'An unexpected error occurred',
        variant: 'destructive',
      })
    }
  }

  const handleCancel = () => {
    reset()
    setIsEditing(false)
  }

  const inputClassName = "h-9 text-sm"
  const labelClassName = "text-xs font-medium text-muted-foreground"

  // Show skeleton loading state
  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex justify-end mb-4">
          <Skeleton className="h-9 w-20" />
        </div>
        <Card className="p-4 mb-4">
          <Skeleton className="h-4 w-32 mb-3" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-9 w-full" />
            </div>
            <div className="space-y-1">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-9 w-full" />
            </div>
          </div>
        </Card>
        <Card className="p-4 mb-4">
          <Skeleton className="h-4 w-24 mb-3" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <Skeleton className="h-3 w-12" />
              <Skeleton className="h-9 w-full" />
            </div>
            <div className="space-y-1">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-9 w-full" />
            </div>
            <div className="space-y-1">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-9 w-24" />
            </div>
          </div>
        </Card>
        <Card className="p-4 bg-muted/30">
          <Skeleton className="h-4 w-36 mb-3" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="space-y-1">
                <Skeleton className="h-3 w-12" />
                <Skeleton className="h-4 w-24" />
              </div>
            ))}
          </div>
        </Card>
      </div>
    )
  }

  // Don't render form if no user data
  if (!user) {
    return null
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit(onSubmit)}>
        {/* Edit/Save/Delete Actions */}
        <div className="flex justify-end gap-2 mb-4">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowDeleteDialog(true)}
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </Button>
          {isEditing ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCancel}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isSubmitting ? 'Saving...' : 'Save Changes'}
              </Button>
            </>
          ) : (
            <Button
              type="button"
              size="sm"
              onClick={() => setIsEditing(true)}
            >
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </Button>
          )}
        </div>

        {/* Profile Information Card */}
        <Card className="p-4 mb-4">
          <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">
            Profile Information
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="fullName" className={labelClassName}>Full Name</Label>
              <Input
                id="fullName"
                {...register('fullName')}
                disabled={!isEditing || isSubmitting}
                className={inputClassName}
              />
              {errors.fullName && (
                <p className="text-xs text-destructive">{errors.fullName.message}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="avatarUrl" className={labelClassName}>Avatar URL</Label>
              <Input
                id="avatarUrl"
                {...register('avatarUrl')}
                disabled={!isEditing || isSubmitting}
                placeholder="https://..."
                className={inputClassName}
              />
              {errors.avatarUrl && (
                <p className="text-xs text-destructive">{errors.avatarUrl.message}</p>
              )}
            </div>
          </div>
        </Card>

        {/* Preferences Card */}
        <Card className="p-4 mb-4">
          <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">
            Preferences
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <Label className={labelClassName}>
                <Globe className="inline-block h-3 w-3 mr-1" />
                Theme
              </Label>
              {isEditing ? (
                <Select
                  value={watchedValues.theme}
                  onValueChange={(value: 'light' | 'dark' | 'system') => setValue('theme', value)}
                  disabled={isSubmitting}
                >
                  <SelectTrigger className={inputClassName}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">Light</SelectItem>
                    <SelectItem value="dark">Dark</SelectItem>
                    <SelectItem value="system">System</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <div className="h-9 flex items-center text-sm capitalize">
                  {watchedValues.theme}
                </div>
              )}
            </div>

            <div className="space-y-1">
              <Label className={labelClassName}>
                <Globe className="inline-block h-3 w-3 mr-1" />
                Language
              </Label>
              {isEditing ? (
                <Select
                  value={watchedValues.language}
                  onValueChange={(value) => setValue('language', value)}
                  disabled={isSubmitting}
                >
                  <SelectTrigger className={inputClassName}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="sv">Swedish</SelectItem>
                    <SelectItem value="no">Norwegian</SelectItem>
                    <SelectItem value="da">Danish</SelectItem>
                    <SelectItem value="fi">Finnish</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <div className="h-9 flex items-center text-sm">
                  {watchedValues.language ? (languageLabels[watchedValues.language] || watchedValues.language) : '-'}
                </div>
              )}
            </div>

            <div className="space-y-1">
              <Label className={labelClassName}>
                <Bell className="inline-block h-3 w-3 mr-1" />
                Email Notifications
              </Label>
              <div className="flex items-center h-9 gap-2">
                <Switch
                  id="emailNotifications"
                  checked={watchedValues.emailNotifications}
                  onCheckedChange={(checked) => setValue('emailNotifications', checked)}
                  disabled={!isEditing || isSubmitting}
                />
                <Label htmlFor="emailNotifications" className="text-sm cursor-pointer">
                  {watchedValues.emailNotifications ? 'Enabled' : 'Disabled'}
                </Label>
              </div>
            </div>
          </div>
        </Card>
      </form>

      {/* Metadata Card (Read-only) */}
      <Card className="p-4 bg-muted/30">
        <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">
          Account Information
        </h3>
        <dl className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <dt className={labelClassName}>
              <Mail className="inline-block h-3 w-3 mr-1" />
              Email
            </dt>
            <dd className="truncate" title={user.email}>
              {user.email}
            </dd>
          </div>
          <div>
            <dt className={labelClassName}>User ID</dt>
            <dd className="font-mono text-xs truncate" title={user.id}>
              {user.id.slice(0, 8)}...
            </dd>
          </div>
          <div>
            <dt className={labelClassName}>Created</dt>
            <dd>{formatDate(user.created_at)}</dd>
          </div>
          <div>
            <dt className={labelClassName}>Organizations</dt>
            <dd>{user.organization_count}</dd>
          </div>
        </dl>
      </Card>

      {/* Delete User Dialog */}
      <DeleteUserDialog
        userId={user.id}
        userName={user.full_name || ''}
        userEmail={user.email}
        isOpen={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
      />
    </div>
  )
}
