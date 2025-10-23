// Export UI primitives
export * from './components/ui/alert'
export * from './components/ui/avatar'
export * from './components/ui/button'
export * from './components/ui/card'
export * from './components/ui/input'
export * from './components/ui/label'
export * from './components/ui/dropdown-menu'
export * from './components/ui/checkbox'
export * from './components/ui/badge'
export * from './components/ui/table'
export * from './components/ui/dialog'
export * from './components/ui/select'
export * from './components/ui/tabs'
export * from './components/ui/textarea'
export * from './components/ui/switch'

// Export data table component
export * from './components/data-table'

// Export TanStack React Table types for convenience
export type { ColumnDef, Row, Cell } from '@tanstack/react-table'

// Export platform components
export * from './components/platform/app-switcher'
export * from './components/platform/org-switcher'
export * from './components/platform/auth-gate' // Exports both AuthGate and FeatureGate (alias)

// Export utilities
export * from './lib/utils'
