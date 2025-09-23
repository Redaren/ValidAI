'use client'

import { useNotificationStore } from '@/stores'
import { useEffect } from 'react'

export function NotificationDisplay() {
  const { notifications, removeNotification } = useNotificationStore()

  useEffect(() => {
    notifications.forEach((notification) => {
      if (notification.duration) {
        setTimeout(() => {
          removeNotification(notification.id)
        }, notification.duration)
      }
    })
  }, [notifications, removeNotification])

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2">
      {notifications.map((notification) => (
        <div
          key={notification.id}
          className={`p-4 rounded-lg shadow-lg max-w-sm ${
            notification.type === 'error'
              ? 'bg-red-500 text-white'
              : notification.type === 'success'
              ? 'bg-green-500 text-white'
              : notification.type === 'warning'
              ? 'bg-yellow-500 text-black'
              : 'bg-blue-500 text-white'
          }`}
        >
          <div className="flex justify-between items-start">
            <div>
              <h4 className="font-semibold">{notification.title}</h4>
              {notification.message && (
                <p className="text-sm mt-1">{notification.message}</p>
              )}
            </div>
            <button
              onClick={() => removeNotification(notification.id)}
              className="ml-2 text-lg font-bold opacity-70 hover:opacity-100"
            >
              ×
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}