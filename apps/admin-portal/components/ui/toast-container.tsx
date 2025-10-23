'use client'

import { useToastStore } from '@/stores'
import { Alert } from '@playze/shared-ui'
import { X, CheckCircle2, AlertCircle, Info } from 'lucide-react'

/**
 * ToastContainer Component
 *
 * Displays toast notifications from the global toast store.
 * Toasts appear in the top-right corner and auto-dismiss after their duration.
 */
export function ToastContainer() {
  const toasts = useToastStore((state) => state.toasts)
  const removeToast = useToastStore((state) => state.removeToast)

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 w-full max-w-md pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="pointer-events-auto animate-in slide-in-from-right duration-300"
        >
          <Alert
            variant={toast.variant === 'destructive' ? 'destructive' : 'default'}
            className="relative pr-10 shadow-lg"
          >
            {/* Icon */}
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-0.5">
                {toast.variant === 'success' && (
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                )}
                {toast.variant === 'destructive' && (
                  <AlertCircle className="h-5 w-5 text-red-600" />
                )}
                {toast.variant === 'default' && (
                  <Info className="h-5 w-5 text-blue-600" />
                )}
              </div>

              {/* Content */}
              <div className="flex-1 space-y-1">
                <p className="font-semibold text-sm">{toast.title}</p>
                {toast.description && (
                  <p className="text-sm opacity-90">{toast.description}</p>
                )}
              </div>

              {/* Close button */}
              <button
                onClick={() => removeToast(toast.id)}
                className="absolute top-3 right-3 p-1 rounded-md hover:bg-black/5 transition-colors"
                aria-label="Close notification"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </Alert>
        </div>
      ))}
    </div>
  )
}
