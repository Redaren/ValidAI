import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

export interface Toast {
  id: string
  title: string
  description?: string
  variant: 'default' | 'destructive' | 'success'
  duration?: number
}

interface ToastStore {
  toasts: Toast[]
  addToast: (toast: Omit<Toast, 'id'>) => void
  removeToast: (id: string) => void
  clearAll: () => void
}

export const useToastStore = create<ToastStore>()(
  devtools(
    (set) => ({
      toasts: [],

      addToast: (toast) => {
        const id = Math.random().toString(36).slice(2, 11)
        const newToast: Toast = { ...toast, id }

        set((state) => ({
          toasts: [...state.toasts, newToast],
        }))

        // Auto-remove toast after duration
        const duration = toast.duration || 5000
        setTimeout(() => {
          set((state) => ({
            toasts: state.toasts.filter((t) => t.id !== id),
          }))
        }, duration)
      },

      removeToast: (id) => {
        set((state) => ({
          toasts: state.toasts.filter((t) => t.id !== id),
        }))
      },

      clearAll: () => {
        set({ toasts: [] })
      },
    }),
    { name: 'toast-store' }
  )
)
