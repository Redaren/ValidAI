/**
 * View Switcher Component
 *
 * @module components/runs/views/view-switcher
 * @description
 * UI component for switching between different run visualization views.
 * Updates the URL query parameter to enable shareable view links.
 *
 * **Features:**
 * - Tab-based UI for view selection
 * - URL-based state (shareable links)
 * - Visual indication of current view
 * - Keyboard navigation support
 *
 * @since Phase 1.8
 */

'use client'

// import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { BarChart3, FileText, Scale } from 'lucide-react'
import { Button } from '@playze/shared-ui'
import { cn } from '@/lib/utils'

/**
 * Available view types for processor runs
 */
export type ViewType = 'technical' | 'compliance' | 'contract-comments'

/**
 * View metadata including display information
 */
interface ViewMetadata {
  /** Internal identifier */
  value: ViewType
  /** Display label */
  label: string
  /** Optional icon component */
  icon?: React.ComponentType<{ className?: string }>
  /** Description tooltip (future) */
  description?: string
}

/**
 * Registry of available views with metadata
 */
export const AVAILABLE_VIEWS: ViewMetadata[] = [
  {
    value: 'technical',
    label: 'Technical',
    icon: BarChart3,
    description: 'Detailed execution metrics and structured outputs',
  },
  {
    value: 'compliance',
    label: 'Compliance',
    icon: Scale,
    description: 'Traffic light status and compliance statistics (Coming soon)',
  },
  {
    value: 'contract-comments',
    label: 'Contract Comments',
    icon: FileText,
    description: 'Document viewer with inline operation comments (Coming soon)',
  },
]

/**
 * Props for ViewSwitcher component
 */
interface ViewSwitcherProps {
  /** Currently active view */
  currentView: ViewType
  /** Callback when view changes */
  onViewChange: (view: ViewType) => void
  /** Optional CSS class name */
  className?: string
  /** Views to show (defaults to all available views) */
  availableViews?: ViewType[]
}

/**
 * View Switcher
 *
 * Renders a tab bar for switching between different run visualization views.
 * When a view is selected, triggers the onViewChange callback which should
 * update the URL query parameter.
 *
 * **Behavior:**
 * - Updates URL on view change (enables shareable links)
 * - Shows only implemented views by default
 * - Keyboard accessible (tab navigation)
 * - Icons provide visual distinction
 *
 * @param currentView - The currently active view type
 * @param onViewChange - Callback fired when user selects a different view
 * @param className - Optional CSS class for styling
 * @param availableViews - Subset of views to display (defaults to all)
 * @returns Tab bar component
 *
 * @example
 * ```tsx
 * <ViewSwitcher
 *   currentView="technical"
 *   onViewChange={(view) => router.push(`?view=${view}`)}
 * />
 * ```
 */
export function ViewSwitcher({
  currentView,
  onViewChange,
  className,
  availableViews,
}: ViewSwitcherProps) {
  // Filter views if specific subset requested
  const viewsToShow = availableViews
    ? AVAILABLE_VIEWS.filter((v) => availableViews.includes(v.value))
    : AVAILABLE_VIEWS

  return (
    <div className={cn('flex gap-1 rounded-lg border bg-muted p-1', className)}>
      {viewsToShow.map((view) => {
        const Icon = view.icon
        const isActive = currentView === view.value
        return (
          <Button
            key={view.value}
            variant={isActive ? 'default' : 'ghost'}
            size="sm"
            onClick={() => onViewChange(view.value)}
            className={cn('gap-2', isActive && 'shadow-sm')}
          >
            {Icon && <Icon className="h-4 w-4" />}
            {view.label}
          </Button>
        )
      })}
    </div>
  )
}
