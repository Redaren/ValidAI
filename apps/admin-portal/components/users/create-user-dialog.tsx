'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Button,
  Label,
  Input,
  Alert,
  Checkbox,
} from '@playze/shared-ui'
import { Loader2, Eye, EyeOff } from 'lucide-react'
import { createUserSchema, type CreateUserInput } from '@/lib/validations'
import { useCreateUser } from '@/lib/queries/users'
import { useToastStore } from '@/stores'

interface CreateUserDialogProps {
  isOpen: boolean
  onClose: () => void
}

export function CreateUserDialog({
  isOpen,
  onClose,
}: CreateUserDialogProps) {
  const [showPassword, setShowPassword] = useState(false)
  const [usePassword, setUsePassword] = useState(false)

  const createUser = useCreateUser()
  const addToast = useToastStore((state) => state.addToast)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
    setValue,
  } = useForm<CreateUserInput>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      email: '',
      password: '',
      full_name: '',
      send_email: true,
    },
  })

  const onSubmit = async (data: CreateUserInput) => {
    try {
      // If not using password, ensure we don't send it
      const payload = {
        ...data,
        password: usePassword ? data.password : undefined,
      }

      const result = await createUser.mutateAsync(payload)

      addToast({
        title: 'User created',
        description: result.method === 'direct'
          ? 'User created successfully. They can login immediately with the provided password.'
          : 'Invitation email sent successfully. User will set their password during invitation acceptance.',
        variant: 'success',
      })

      handleClose()
    } catch (error) {
      console.error('Error creating user:', error)

      // Error is handled by the mutation and displayed in the Alert below
      // No need to show toast for errors since Alert is more visible
    }
  }

  const handleClose = () => {
    reset()
    setShowPassword(false)
    setUsePassword(false)
    onClose()
  }

  const handleUsePasswordChange = (checked: boolean) => {
    setUsePassword(checked)
    if (!checked) {
      setValue('password', '')
      setShowPassword(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create User</DialogTitle>
          <DialogDescription>
            Create a new user account. The user will not be assigned to any organization initially.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Email */}
          <div className="space-y-2">
            <Label htmlFor="email">
              Email <span className="text-destructive">*</span>
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="user@example.com"
              {...register('email')}
              disabled={isSubmitting}
              aria-invalid={!!errors.email}
            />
            {errors.email && (
              <p className="text-sm text-destructive">{errors.email.message}</p>
            )}
          </div>

          {/* Full Name */}
          <div className="space-y-2">
            <Label htmlFor="full_name">Full Name (Optional)</Label>
            <Input
              id="full_name"
              type="text"
              placeholder="John Doe"
              {...register('full_name')}
              disabled={isSubmitting}
              aria-invalid={!!errors.full_name}
            />
            {errors.full_name && (
              <p className="text-sm text-destructive">{errors.full_name.message}</p>
            )}
          </div>

          {/* Password Option Toggle */}
          <div className="flex items-start space-x-2 rounded-md border p-4">
            <Checkbox
              id="use-password"
              checked={usePassword}
              onCheckedChange={handleUsePasswordChange}
              disabled={isSubmitting}
            />
            <div className="grid gap-1.5 leading-none">
              <Label
                htmlFor="use-password"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
              >
                Set password directly
              </Label>
              <p className="text-xs text-muted-foreground">
                If unchecked, an invitation email will be sent to the user to set their own password.
              </p>
            </div>
          </div>

          {/* Password Field (conditional) */}
          {usePassword && (
            <div className="space-y-2">
              <Label htmlFor="password">
                Password <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  {...register('password')}
                  disabled={isSubmitting}
                  aria-invalid={!!errors.password}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              {errors.password && (
                <p className="text-sm text-destructive">{errors.password.message}</p>
              )}
              <p className="text-xs text-muted-foreground">
                Password must be at least 8 characters. User can login immediately.
              </p>
            </div>
          )}

          {/* Info Alert */}
          <Alert>
            <p className="text-sm">
              {usePassword ? (
                <>
                  <strong>Direct creation:</strong> User will be created with the provided password
                  and can login immediately. Email will be auto-confirmed.
                </>
              ) : (
                <>
                  <strong>Invitation:</strong> An invitation email will be sent to the user.
                  They will set their own password during invitation acceptance.
                </>
              )}
            </p>
          </Alert>

          {/* Error Alert */}
          {createUser.error && (
            <Alert variant="destructive">
              <p className="text-sm">
                {createUser.error instanceof Error
                  ? createUser.error.message
                  : 'An unexpected error occurred while creating the user'}
              </p>
            </Alert>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isSubmitting ? 'Creating...' : 'Create User'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
