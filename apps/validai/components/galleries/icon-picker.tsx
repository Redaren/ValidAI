'use client'

import { useState } from 'react'
import { Check, Search } from 'lucide-react'
import * as LucideIcons from 'lucide-react'
import { Input } from '@playze/shared-ui'
import { cn } from '@/lib/utils'

// Popular Lucide icons for galleries and areas
const POPULAR_ICONS = [
  'briefcase',
  'building',
  'building-2',
  'users',
  'user-check',
  'user-cog',
  'clipboard-list',
  'file-text',
  'folder',
  'folder-open',
  'home',
  'layout-dashboard',
  'layers',
  'package',
  'shopping-cart',
  'trending-up',
  'bar-chart',
  'pie-chart',
  'calendar',
  'clock',
  'check-circle',
  'shield-check',
  'alert-circle',
  'info',
  'settings',
  'tool',
  'wrench',
  'hammer',
  'star',
  'heart',
  'bookmark',
  'tag',
  'inbox',
  'mail',
  'message-square',
  'phone',
  'map-pin',
  'globe',
  'truck',
  'box',
  'archive',
  'award',
  'trophy',
  'target',
  'zap',
  'activity',
  'radio',
  'wifi',
  'database',
  'server',
  'cloud',
  'git-branch',
  'code',
  'terminal',
  'cpu',
  'hard-drive',
  'key',
  'lock',
  'unlock',
  'eye',
  'dollar-sign',
  'credit-card',
  'receipt',
  'scale',
  'gavel',
  'book',
  'book-open',
  'graduation-cap',
  'lightbulb',
  'rocket',
  'flag',
  'map',
  'compass',
]

// Convert icon name to PascalCase for importing from lucide-react
function toPascalCase(str: string): string {
  return str
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('')
}

// Get icon component by name
function getIconComponent(iconName: string) {
  const pascalName = toPascalCase(iconName)
  return (LucideIcons as any)[pascalName] || null
}

interface IconPickerProps {
  value?: string | null
  onChange: (iconName: string) => void
  className?: string
}

export function IconPicker({ value, onChange, className }: IconPickerProps) {
  const [search, setSearch] = useState('')

  // Filter icons based on search
  const filteredIcons = POPULAR_ICONS.filter((icon) =>
    icon.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className={cn('space-y-3', className)}>
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search icons..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Icon Grid */}
      <div className="max-h-[300px] overflow-y-auto rounded-md border">
        {filteredIcons.length === 0 ? (
          <div className="flex h-[100px] items-center justify-center text-sm text-muted-foreground">
            No icons found
          </div>
        ) : (
          <div className="grid grid-cols-8 gap-1 p-2">
            {filteredIcons.map((iconName) => {
              const IconComponent = getIconComponent(iconName)
              const isSelected = value === iconName

              if (!IconComponent) return null

              return (
                <button
                  key={iconName}
                  type="button"
                  onClick={() => onChange(iconName)}
                  className={cn(
                    'relative flex h-12 w-12 items-center justify-center rounded-md border transition-colors hover:bg-accent',
                    isSelected && 'border-primary bg-primary/10'
                  )}
                  title={iconName}
                >
                  <IconComponent className="h-5 w-5" />
                  {isSelected && (
                    <div className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary">
                      <Check className="h-3 w-3 text-primary-foreground" />
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Selected icon preview */}
      {value && (
        <div className="flex items-center gap-2 rounded-md border p-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted">
            {(() => {
              const IconComponent = getIconComponent(value)
              return IconComponent ? <IconComponent className="h-6 w-6" /> : null
            })()}
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium">Selected: {value}</p>
            <p className="text-xs text-muted-foreground">
              This icon will represent your {value.includes('folder') ? 'gallery or area' : 'item'}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
