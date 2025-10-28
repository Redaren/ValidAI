/**
 * View Registry Module
 *
 * @module components/runs/views
 * @description
 * Central registry for all available processor run views.
 * Maps view type identifiers to their corresponding React components.
 *
 * **Purpose:**
 * - Dynamic view component resolution
 * - Single source of truth for available views
 * - Type-safe view selection
 * - Easy extension point for new views
 *
 * **Usage:**
 * ```tsx
 * const ViewComponent = VIEW_REGISTRY[viewType] || VIEW_REGISTRY.technical
 * return <ViewComponent run={run} operationResults={results} />
 * ```
 *
 * @since Phase 1.8
 */

import type { ComponentType } from 'react'
import { TechnicalView } from './technical-view'
import { ComplianceView as ComplianceViewComponent } from './compliance-view'
import type { ViewType } from './view-switcher'
import type { Database } from '@playze/shared-types'

type Run = Database['public']['Tables']['validai_runs']['Row']
type OperationResult = Database['public']['Tables']['validai_operation_results']['Row']

/**
 * Common props interface that all view components must accept
 */
export interface RunViewProps {
  /** The run to display */
  run: Run
  /** Operation results for the run */
  operationResults: OperationResult[]
  /** Whether operation results are still loading */
  isLoadingResults?: boolean
}

/**
 * Type for view components
 */
export type RunViewComponent = ComponentType<RunViewProps>

/**
 * View Registry
 *
 * Maps view type identifiers to their React component implementations.
 * All view components must accept the same props interface (RunViewProps)
 * to enable dynamic switching.
 *
 * **Adding New Views:**
 * 1. Create view component file (e.g., `compliance-view.tsx`)
 * 2. Implement `RunViewProps` interface
 * 3. Import and register here
 * 4. Add to `AVAILABLE_VIEWS` in `view-switcher.tsx`
 *
 * @example
 * ```tsx
 * // Dynamic view resolution
 * const ViewComponent = VIEW_REGISTRY[currentView] || VIEW_REGISTRY.technical
 * return <ViewComponent run={run} operationResults={results} />
 * ```
 */
/**
 * Placeholder view component for upcoming features
 */
const PlaceholderView = ({ title }: { title: string }) => (
  <div className="flex min-h-[400px] items-center justify-center rounded-lg border border-dashed">
    <div className="text-center">
      <p className="text-lg font-medium">{title}</p>
      <p className="text-sm text-muted-foreground">Coming soon</p>
    </div>
  </div>
)

/**
 * Contract comments view placeholder
 */
const ContractCommentsView: RunViewComponent = () => (
  <PlaceholderView title="Contract Comments View" />
)

export const VIEW_REGISTRY: Record<ViewType, RunViewComponent> = {
  technical: TechnicalView,
  compliance: ComplianceViewComponent,
  'contract-comments': ContractCommentsView,
}

/**
 * Get view component by type with fallback
 *
 * @param viewType - The view type to resolve
 * @returns The corresponding view component, or TechnicalView if not found
 *
 * @example
 * ```tsx
 * const ViewComponent = getViewComponent('compliance')
 * ```
 */
export function getViewComponent(viewType: ViewType | string): RunViewComponent {
  return VIEW_REGISTRY[viewType as ViewType] || VIEW_REGISTRY.technical
}

// Re-export common types and components
export { TechnicalView } from './technical-view'
export { ComplianceView as ComplianceViewComponent } from './compliance-view'
export { ViewSwitcher, AVAILABLE_VIEWS, type ViewType } from './view-switcher'
