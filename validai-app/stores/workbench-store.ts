import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

/**
 * Test result from running an operation test
 */
export interface TestResult {
  response: string
  parsedValue?: any
  tokensUsed: {
    input: number
    output: number
    total: number
  }
  executionTime: number
  timestamp: string
  error?: string
}

/**
 * Advanced LLM settings (in collapsible section)
 */
export interface AdvancedSettings {
  temperature: number
  maxTokens: number
  topP: number
  topK: number
}

/**
 * Selected file can be either an uploaded File or existing Document
 */
export type SelectedFile = {
  type: 'uploaded'
  file: File
  name: string
  size: number
} | {
  type: 'document'
  id: string
  name: string
  size: number
} | null

/**
 * Workbench Store
 *
 * Manages all state for the testbench interface including:
 * - File management
 * - LLM configuration
 * - Test execution and results
 */
export interface WorkbenchStore {
  // Core State
  selectedFile: SelectedFile
  selectedModel: string
  systemPrompt: string
  operationPrompt: string

  // Feature Flags
  thinkingMode: boolean
  citations: boolean
  toolUse: boolean

  // Advanced Settings
  advancedSettings: AdvancedSettings

  // Results
  isRunning: boolean
  output: TestResult | null
  error: string | null

  // Actions
  setFile: (file: SelectedFile) => void
  setModel: (modelId: string) => void
  setSystemPrompt: (prompt: string) => void
  updateOperationPrompt: (prompt: string) => void
  toggleFeature: (feature: 'thinking' | 'citations' | 'toolUse') => void
  updateAdvancedSettings: (settings: Partial<AdvancedSettings>) => void
  runTest: () => Promise<void>
  clearOutput: () => void
  reset: () => void
}

const defaultAdvancedSettings: AdvancedSettings = {
  temperature: 0.7,
  maxTokens: 4096,
  topP: 1.0,
  topK: 40
}

export const useWorkbenchStore = create<WorkbenchStore>()(
  devtools(
    (set, get) => ({
      // Initial state
      selectedFile: null,
      selectedModel: 'claude-3-5-sonnet-20241022',
      systemPrompt: '',
      operationPrompt: '',
      thinkingMode: false,
      citations: false,
      toolUse: false,
      advancedSettings: defaultAdvancedSettings,
      isRunning: false,
      output: null,
      error: null,

      // Actions

      setFile: (file) => {
        set({ selectedFile: file })
      },

      setModel: (modelId) => {
        set({ selectedModel: modelId })
      },

      setSystemPrompt: (prompt) => {
        set({ systemPrompt: prompt })
      },

      updateOperationPrompt: (prompt) => {
        set({ operationPrompt: prompt })
      },

      toggleFeature: (feature) => {
        const state = get()
        switch (feature) {
          case 'thinking':
            set({ thinkingMode: !state.thinkingMode })
            break
          case 'citations':
            set({ citations: !state.citations })
            break
          case 'toolUse':
            set({ toolUse: !state.toolUse })
            break
        }
      },

      updateAdvancedSettings: (settings) => {
        set({
          advancedSettings: {
            ...get().advancedSettings,
            ...settings
          }
        })
      },

      runTest: async () => {
        const state = get()

        // Validate required fields
        if (!state.operationPrompt) {
          set({ error: 'Please enter a prompt' })
          return
        }

        set({
          isRunning: true,
          error: null,
          output: null
        })

        try {
          // TODO: Replace with actual Edge Function call
          // Simulate API call for now
          await new Promise(resolve => setTimeout(resolve, 2000))

          // Mock response
          const mockResult: TestResult = {
            response: `This is a mock response for testing the operation prompt:\n\n"${state.operationPrompt.slice(0, 100)}..."\n\nModel: ${state.selectedModel}\nFile: ${state.selectedFile?.name || 'No file selected'}\nThinking Mode: ${state.thinkingMode}\nCitations: ${state.citations}\nTool Use: ${state.toolUse}`,
            parsedValue: {
              example: "parsed data",
              confidence: 0.95
            },
            tokensUsed: {
              input: 245,
              output: 178,
              total: 423
            },
            executionTime: 1842,
            timestamp: new Date().toISOString()
          }

          set({
            output: mockResult,
            isRunning: false
          })
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'An error occurred',
            isRunning: false
          })
        }
      },

      clearOutput: () => {
        set({
          output: null,
          error: null
        })
      },

      reset: () => {
        set({
          selectedFile: null,
          selectedModel: 'claude-3-5-sonnet-20241022',
          systemPrompt: '',
          operationPrompt: '',
          thinkingMode: false,
          citations: false,
          toolUse: false,
          advancedSettings: defaultAdvancedSettings,
          isRunning: false,
          output: null,
          error: null
        })
      }
    }),
    {
      name: 'workbench-store'
    }
  )
)