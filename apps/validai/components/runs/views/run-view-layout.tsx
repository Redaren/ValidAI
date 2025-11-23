/**
 * RunViewLayout
 *
 * A consistent layout container for all run detail views that provides:
 * - Fixed header section that remains visible while scrolling
 * - Scrollable content section for tables/operations
 * - Consistent right-side spacing for scrollbar
 * - Scrollbar only appears when content exceeds available height
 */

import { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface RunViewLayoutProps {
  /** Content to display in the fixed header section (e.g., metrics cards) */
  header?: ReactNode
  /** Content to display in the scrollable section (e.g., tables, operations) */
  children: ReactNode
  /** Additional CSS classes for the container */
  className?: string
}

export function RunViewLayout({ header, children, className }: RunViewLayoutProps) {
  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Fixed Header Section - stays visible during scroll */}
      {header && (
        <div className="flex-shrink-0 pb-6">
          {header}
        </div>
      )}

      {/* Scrollable Content Section - scrolls when content exceeds height */}
      <div className="flex-1 min-h-0 overflow-y-auto [scrollbar-gutter:stable]">
        <div className="space-y-6">
          {children}
        </div>
      </div>
    </div>
  )
}
