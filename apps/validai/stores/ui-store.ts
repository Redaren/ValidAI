import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

interface UiState {
  sidebarOpen: boolean
  theme: 'light' | 'dark' | 'system'
  setSidebarOpen: (open: boolean) => void
  setTheme: (theme: 'light' | 'dark' | 'system') => void
}

export const useUiStore = create<UiState>()(
  devtools(
    (set) => ({
      sidebarOpen: false,
      theme: 'system',
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      setTheme: (theme) => set({ theme }),
    }),
    { name: 'ui-store' }
  )
)