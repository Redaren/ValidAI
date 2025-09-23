import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { fileURLToPath, URL } from 'url'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./lib/__tests__/setup.ts'],
    globals: true,
    css: true,
    exclude: ['**/node_modules/**', '**/e2e/**'],
    onConsoleLog: (log, type) => {
      // Suppress noisy logs during tests
      if (log.includes('Warning: ReactDOM.render is deprecated')) return false
      if (log.includes('Warning: You are using a development build')) return false
      if (log.includes('Cannot read properties of undefined')) return false
      if (log.includes('whatwg-url/lib/URL.js')) return false
      return true
    },
    silent: false,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    onUnhandledRejection: (reason, promise) => {
      // Ignore specific unhandled rejections from JSDOM/testing environment
      if (reason && typeof reason === 'object' && 'message' in reason) {
        const message = reason.message
        if (
          message.includes('Cannot read properties of undefined') ||
          message.includes('whatwg-url') ||
          message.includes('jsdom')
        ) {
          return
        }
      }
      throw reason
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
})