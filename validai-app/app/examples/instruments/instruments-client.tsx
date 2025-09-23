'use client'

import { useInstruments } from '@/app/queries/instruments/use-instruments'
import { useNotificationStore, useUiStore } from '@/stores'

export function InstrumentsClient() {
  const { data: instruments, isLoading, error } = useInstruments()
  const addNotification = useNotificationStore((state) => state.addNotification)
  const { sidebarOpen, setSidebarOpen } = useUiStore()

  if (isLoading) return <div>Loading instruments...</div>

  if (error) {
    addNotification({
      type: 'error',
      title: 'Failed to load instruments',
      message: error.message,
    })
    return <div>Error: {error.message}</div>
  }

  if (!instruments?.length) {
    return <div>No instruments found</div>
  }

  return (
    <div className="space-y-4">
      <div className="mb-6 p-4 bg-blue-50 rounded-lg">
        <h2 className="text-lg font-semibold mb-2">State Management Demo</h2>
        <div className="flex gap-4">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            {sidebarOpen ? 'Close' : 'Open'} Sidebar (Zustand)
          </button>
          <button
            onClick={() => addNotification({
              type: 'success',
              title: 'Test Notification',
              message: 'This is from Zustand store!',
              duration: 3000
            })}
            className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
          >
            Show Notification
          </button>
        </div>
        <p className="text-sm text-gray-600 mt-2">
          Sidebar state: {sidebarOpen ? 'Open' : 'Closed'} |
          Data fetched via TanStack Query with TypeScript types
        </p>
      </div>

      <h3 className="text-lg font-semibold">Instruments from Database:</h3>
      {instruments.map((instrument) => (
        <div key={instrument.id} className="p-4 border rounded-lg">
          <h4 className="font-semibold">{instrument.name}</h4>
          <p className="text-sm text-gray-600">ID: {instrument.id}</p>
        </div>
      ))}
    </div>
  )
}