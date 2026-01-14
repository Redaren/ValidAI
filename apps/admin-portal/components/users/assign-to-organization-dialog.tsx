'use client'

import { useState, useMemo, useCallback } from 'react'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Alert,
  Badge,
  DataTable,
} from '@playze/shared-ui'
import type { ColumnDef } from '@playze/shared-ui'
import { Loader2, Building2, CheckCircle2 } from 'lucide-react'
import { assignUserToOrganizationSchema, type AssignUserToOrganizationInput } from '@/lib/validations'
import { useAssignUserToOrganization } from '@/lib/queries/users'
import { useOrganizations } from '@/lib/queries/organizations'
import { useToastStore } from '@/stores'

interface AssignToOrganizationDialogProps {
  userId: string
  userName: string
  isOpen: boolean
  onClose: () => void
}

interface OrgRow {
  id: string
  name: string
  description: string | null
  is_active: boolean
  member_count: number
}

export function AssignToOrganizationDialog({
  userId,
  userName,
  isOpen,
  onClose,
}: AssignToOrganizationDialogProps) {
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null)
  const [selectedRole, setSelectedRole] = useState<'owner' | 'admin' | 'member' | 'viewer'>('member')
  const [showDuplicateWarning, setShowDuplicateWarning] = useState(false)

  const { data: organizations, isLoading: loadingOrgs } = useOrganizations()
  const assignToOrg = useAssignUserToOrganization()
  const addToast = useToastStore((state) => state.addToast)

  const {
    handleSubmit,
    formState: { isSubmitting },
    setValue,
    reset,
  } = useForm<AssignUserToOrganizationInput>({
    resolver: zodResolver(assignUserToOrganizationSchema),
    defaultValues: {
      userId,
      organizationId: '',
      role: 'member',
    },
  })

  const handleSelectOrg = useCallback((orgId: string) => {
    if (selectedOrgId === orgId) {
      setSelectedOrgId(null)
      setValue('organizationId', '')
      setShowDuplicateWarning(false)
    } else {
      setSelectedOrgId(orgId)
      setValue('organizationId', orgId)
      setShowDuplicateWarning(false)
    }
  }, [selectedOrgId, setValue])

  const columns = useMemo<ColumnDef<OrgRow>[]>(
    () => [
      {
        id: 'select',
        header: '',
        cell: ({ row }) => (
          <div className="flex items-center justify-center">
            {selectedOrgId === row.original.id && (
              <CheckCircle2 className="h-5 w-5 text-primary" />
            )}
          </div>
        ),
      },
      {
        accessorKey: 'name',
        header: 'Organization',
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
              <Building2 className="h-4 w-4 text-primary" />
            </div>
            <div>
              <span className="font-medium">{row.original.name}</span>
              {!row.original.is_active && (
                <Badge variant="secondary" className="ml-2 text-xs">Inactive</Badge>
              )}
            </div>
          </div>
        ),
      },
      {
        accessorKey: 'member_count',
        header: 'Members',
        cell: ({ row }) => (
          <Badge variant="outline">
            {row.original.member_count}
          </Badge>
        ),
      },
      {
        id: 'actions',
        cell: ({ row }) => (
          <Button
            size="sm"
            variant={selectedOrgId === row.original.id ? 'default' : 'outline'}
            onClick={() => handleSelectOrg(row.original.id)}
          >
            {selectedOrgId === row.original.id ? 'Selected' : 'Select'}
          </Button>
        ),
      },
    ],
    [selectedOrgId, handleSelectOrg]
  )

  const handleRoleChange = (role: 'owner' | 'admin' | 'member' | 'viewer') => {
    setSelectedRole(role)
    setValue('role', role)
  }

  const onSubmit = async (data: AssignUserToOrganizationInput) => {
    try {
      await assignToOrg.mutateAsync(data)

      addToast({
        title: 'User assigned',
        description: `${userName} has been added to the organization.`,
        variant: 'success',
      })

      handleClose()
    } catch (error) {
      console.error('Error assigning user to organization:', error)

      const errorMessage = error instanceof Error
        ? error.message
        : typeof (error as Record<string, unknown>)?.message === 'string'
          ? (error as { message: string }).message
          : String(error || '')

      if (errorMessage.includes('already a member')) {
        setShowDuplicateWarning(true)
      }
    }
  }

  const handleClose = () => {
    reset()
    setSelectedOrgId(null)
    setSelectedRole('member')
    setShowDuplicateWarning(false)
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Add to Organization</DialogTitle>
          <DialogDescription>
            Select an organization and role to assign <strong>{userName}</strong> to.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6 flex-1 overflow-hidden">
          {/* Role Selection */}
          <div className="space-y-2">
            <Label htmlFor="role">
              Role <span className="text-destructive">*</span>
            </Label>
            <Select
              value={selectedRole}
              onValueChange={handleRoleChange}
              disabled={isSubmitting}
            >
              <SelectTrigger id="role">
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="viewer">Viewer (Read-only access)</SelectItem>
                <SelectItem value="member">Member (Standard access)</SelectItem>
                <SelectItem value="admin">Admin (Manage members and settings)</SelectItem>
                <SelectItem value="owner">Owner (Full control)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              The role determines what actions the user can perform within the organization.
            </p>
          </div>

          {/* Organization Selection Table */}
          <div className="flex-1 overflow-hidden flex flex-col space-y-2">
            <Label>
              Select Organization <span className="text-destructive">*</span>
            </Label>
            <div className="flex-1 overflow-hidden border rounded-md">
              <DataTable
                columns={columns}
                data={organizations || []}
                isLoading={loadingOrgs}
                searchKey="name"
                searchPlaceholder="Search organizations..."
                pageSize={5}
              />
            </div>
          </div>

          {/* Duplicate Warning */}
          {showDuplicateWarning && (
            <Alert variant="destructive">
              <p className="text-sm">
                This user is already a member of the selected organization.
              </p>
            </Alert>
          )}

          {/* Error Alert */}
          {assignToOrg.error && !showDuplicateWarning && (
            <Alert variant="destructive">
              <p className="text-sm">
                {assignToOrg.error instanceof Error
                  ? assignToOrg.error.message
                  : typeof (assignToOrg.error as Record<string, unknown>)?.message === 'string'
                    ? (assignToOrg.error as { message: string }).message
                    : 'An unexpected error occurred'}
              </p>
            </Alert>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !selectedOrgId}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isSubmitting ? 'Assigning...' : 'Add to Organization'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
