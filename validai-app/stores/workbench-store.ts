import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { ConversationMessage, WorkbenchExecution } from '@/lib/validations'
import { createClient } from '@/lib/supabase/client'
import type { RealtimeChannel } from '@supabase/supabase-js'

/**
 * Test result from running an operation test
 */
export interface TestResult {
  response: string
  thinking_blocks?: any[]
  citations?: any[]
  tokensUsed: {
    input: number
    output: number
    cached_read?: number
    cached_write?: number
    total: number
  }
  executionTime: number
  timestamp: string
  error?: string
}

/**
 * Advanced LLM settings with override controls
 *
 * Each optional parameter has an "enabled" flag to control whether it's sent to the API.
 * When enabled=false, the LLM uses its default value.
 */
export interface AdvancedSettings {
  // Always sent (required by API)
  maxTokens: number

  // Conditional (sent when thinking mode is ON)
  thinkingBudget: number

  // Optional overrides (only sent when enabled)
  temperature: {
    enabled: boolean
    value: number
  }
  topP: {
    enabled: boolean
    value: number
  }
  topK: {
    enabled: boolean
    value: number
  }
  stopSequences: {
    enabled: boolean
    values: string[]
  }
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
 * - Mode management (stateful vs stateless)
 * - Multi-turn conversations with prompt caching
 * - Test execution and results
 * - Real-time execution tracking via Supabase Realtime
 */
export interface WorkbenchStore {
  // Core State
  selectedFile: SelectedFile
  selectedModel: string
  systemPrompt: string
  operationPrompt: string

  // Mode Management
  mode: 'stateful' | 'stateless'
  sendSystemPrompt: boolean

  // Feature Flags
  thinkingMode: boolean
  citations: boolean
  toolUse: boolean

  // Advanced Settings
  advancedSettings: AdvancedSettings

  // Conversation & Caching
  conversationHistory: ConversationMessage[]
  cachedDocumentContent: string | null  // Keep exact content for cache consistency
  createCache: boolean
  sendFile: boolean

  // Real-time Execution Tracking
  currentExecutionId: string | null
  executionStatus: 'idle' | 'pending' | 'processing' | 'completed' | 'failed'
  realtimeChannel: RealtimeChannel | null

  // Results
  isRunning: boolean
  output: TestResult | null
  error: string | null

  // Actions
  setFile: (file: SelectedFile) => void
  setModel: (modelId: string) => void
  setSystemPrompt: (prompt: string) => void
  updateOperationPrompt: (prompt: string) => void
  setMode: (mode: 'stateful' | 'stateless') => void
  toggleSystemPrompt: () => void
  toggleFeature: (feature: 'thinking' | 'citations' | 'toolUse') => void
  updateAdvancedSettings: (settings: Partial<AdvancedSettings>) => void
  setThinkingBudget: (tokens: number | null) => void
  toggleCreateCache: () => void
  resetCacheToggle: () => void
  toggleSendFile: () => void
  addToConversation: (message: ConversationMessage) => void
  clearConversation: () => void
  clearOutput: () => void
  subscribeToExecution: (executionId: string) => void
  unsubscribeFromExecution: () => void
  handleExecutionUpdate: (execution: WorkbenchExecution) => void
  reset: () => void

  // Advanced Settings Actions
  setMaxTokens: (tokens: number) => void
  setThinkingBudgetValue: (tokens: number) => void
  toggleTemperature: () => void
  setTemperatureValue: (value: number) => void
  toggleTopP: () => void
  setTopPValue: (value: number) => void
  toggleTopK: () => void
  setTopKValue: (value: number) => void
  toggleStopSequences: () => void
  addStopSequence: (sequence: string) => void
  removeStopSequence: (index: number) => void
  resetAdvancedSettings: () => void
}

/**
 * Default advanced settings for Anthropic Claude API
 *
 * Values match Anthropic's recommended defaults:
 * - maxTokens: 4096 (always sent, required by API)
 * - thinkingBudget: 10000 (used when thinking mode is ON)
 * - temperature: 1.0 (override disabled by default)
 * - topP: 1.0 (override disabled by default)
 * - topK: 40 (override disabled by default)
 * - stopSequences: [] (override disabled by default)
 *
 * When override is disabled, the LLM uses its own default values.
 *
 * @see {@link https://docs.claude.com/en/api/messages} Anthropic API parameters
 */
const defaultAdvancedSettings: AdvancedSettings = {
  maxTokens: 4096,
  thinkingBudget: 10000,
  temperature: { enabled: false, value: 1.0 },
  topP: { enabled: false, value: 1.0 },
  topK: { enabled: false, value: 40 },
  stopSequences: { enabled: false, values: [] }
}

export const useWorkbenchStore = create<WorkbenchStore>()(
  devtools(
    (set, get) => ({
      // Initial state
      selectedFile: null,
      selectedModel: 'claude-3-5-haiku-20241022',
      systemPrompt: '',
      operationPrompt: '',
      mode: 'stateful',  // Default to stateful mode
      sendSystemPrompt: true,  // Default to sending system prompt
      thinkingMode: false,
      citations: false,
      toolUse: false,
      advancedSettings: defaultAdvancedSettings,
      conversationHistory: [],
      cachedDocumentContent: null,
      createCache: false,  // Default OFF, user controls when to create cache
      sendFile: true,  // Default ON, send file when selected
      currentExecutionId: null,
      executionStatus: 'idle',
      realtimeChannel: null,
      isRunning: false,
      output: null,
      error: null,

      // Actions

      setFile: (file) => {
        set({
          selectedFile: file,
          // Clear cached content when file changes
          cachedDocumentContent: null
        })
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

      setMode: (mode) => {
        if (mode === 'stateless') {
          // Stateless: clear history and output (but don't touch cache settings)
          set({
            mode: 'stateless',
            conversationHistory: [],
            output: null,
            error: null
          })
        } else {
          // Stateful: just set mode (cache is user-controlled)
          set({ mode: 'stateful' })
        }
      },

      toggleSystemPrompt: () => {
        set({ sendSystemPrompt: !get().sendSystemPrompt })
      },

      toggleFeature: (feature) => {
        const state = get()
        switch (feature) {
          case 'thinking':
            const newThinkingMode = !state.thinkingMode
            const updates: any = { thinkingMode: newThinkingMode }

            if (newThinkingMode) {
              // Thinking mode turned ON - apply smart adjustments
              const currentMaxTokens = state.advancedSettings.maxTokens
              const currentThinkingBudget = state.advancedSettings.thinkingBudget

              // Auto-increase max_tokens ONLY if insufficient (preserve user's higher values)
              if (currentMaxTokens < currentThinkingBudget + 1000) {
                updates.advancedSettings = {
                  ...state.advancedSettings,
                  maxTokens: currentThinkingBudget + 1000  // Minimum needed, not hardcoded 16000
                }
              }

              // Disable temperature override (incompatible with thinking)
              if (state.advancedSettings.temperature.enabled) {
                updates.advancedSettings = {
                  ...updates.advancedSettings || state.advancedSettings,
                  temperature: {
                    ...state.advancedSettings.temperature,
                    enabled: false
                  }
                }
              }
            }

            set(updates)
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

      setThinkingBudget: (tokens) => {
        // Legacy method - now use setThinkingBudgetValue
        if (tokens !== null) {
          set({
            advancedSettings: {
              ...get().advancedSettings,
              thinkingBudget: tokens
            }
          })
        }
      },

      toggleCreateCache: () => {
        set({ createCache: !get().createCache })
      },

      resetCacheToggle: () => {
        set({ createCache: false })
      },

      toggleSendFile: () => {
        set({ sendFile: !get().sendFile })
      },

      addToConversation: (message) => {
        set({
          conversationHistory: [...get().conversationHistory, message]
        })
      },

      clearConversation: () => {
        set({
          conversationHistory: [],
          output: null,
          error: null
        })
      },

      clearOutput: () => {
        set({
          output: null,
          error: null
        })
      },

      subscribeToExecution: (executionId: string) => {
        // Unsubscribe from any existing channel
        get().unsubscribeFromExecution()

        const supabase = createClient()

        // Create channel for this execution
        const channel = supabase
          .channel(`workbench-execution-${executionId}`)
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'workbench_executions',
              filter: `id=eq.${executionId}`
            },
            (payload) => {
              console.log('Realtime update received:', payload)
              const execution = payload.new as WorkbenchExecution
              get().handleExecutionUpdate(execution)
            }
          )
          .subscribe()

        set({
          currentExecutionId: executionId,
          realtimeChannel: channel,
          executionStatus: 'pending'
        })
      },

      unsubscribeFromExecution: () => {
        const channel = get().realtimeChannel
        if (channel) {
          channel.unsubscribe()
        }
        set({
          currentExecutionId: null,
          realtimeChannel: null,
          executionStatus: 'idle'
        })
      },

      handleExecutionUpdate: (execution: WorkbenchExecution) => {
        console.log('Processing execution update:', execution)

        // Update execution status
        set({ executionStatus: execution.status as any })

        // Handle completed execution
        if (execution.status === 'completed' && execution.response) {
          // This will be handled by the mutation success callback
          // Just update the status here
          set({
            isRunning: false,
            executionStatus: 'completed'
          })
        }

        // Handle failed execution
        if (execution.status === 'failed') {
          set({
            isRunning: false,
            executionStatus: 'failed',
            error: execution.error_message || 'Execution failed'
          })
        }

        // Update to processing state
        if (execution.status === 'processing') {
          set({
            isRunning: true,
            executionStatus: 'processing'
          })
        }
      },

      // Advanced Settings Actions

      setMaxTokens: (tokens) => {
        const state = get()
        const newSettings = {
          ...state.advancedSettings,
          maxTokens: tokens
        }

        // Auto-adjust thinking budget if it would exceed new max_tokens
        if (state.thinkingMode && state.advancedSettings.thinkingBudget >= tokens) {
          newSettings.thinkingBudget = Math.max(1024, tokens - 1000)
        }

        set({ advancedSettings: newSettings })
      },

      setThinkingBudgetValue: (tokens) => {
        set({
          advancedSettings: {
            ...get().advancedSettings,
            thinkingBudget: tokens
          }
        })
      },

      toggleTemperature: () => {
        set({
          advancedSettings: {
            ...get().advancedSettings,
            temperature: {
              ...get().advancedSettings.temperature,
              enabled: !get().advancedSettings.temperature.enabled
            }
          }
        })
      },

      setTemperatureValue: (value) => {
        set({
          advancedSettings: {
            ...get().advancedSettings,
            temperature: {
              ...get().advancedSettings.temperature,
              value
            }
          }
        })
      },

      toggleTopP: () => {
        set({
          advancedSettings: {
            ...get().advancedSettings,
            topP: {
              ...get().advancedSettings.topP,
              enabled: !get().advancedSettings.topP.enabled
            }
          }
        })
      },

      setTopPValue: (value) => {
        set({
          advancedSettings: {
            ...get().advancedSettings,
            topP: {
              ...get().advancedSettings.topP,
              value
            }
          }
        })
      },

      toggleTopK: () => {
        set({
          advancedSettings: {
            ...get().advancedSettings,
            topK: {
              ...get().advancedSettings.topK,
              enabled: !get().advancedSettings.topK.enabled
            }
          }
        })
      },

      setTopKValue: (value) => {
        set({
          advancedSettings: {
            ...get().advancedSettings,
            topK: {
              ...get().advancedSettings.topK,
              value
            }
          }
        })
      },

      toggleStopSequences: () => {
        set({
          advancedSettings: {
            ...get().advancedSettings,
            stopSequences: {
              ...get().advancedSettings.stopSequences,
              enabled: !get().advancedSettings.stopSequences.enabled
            }
          }
        })
      },

      addStopSequence: (sequence) => {
        const current = get().advancedSettings.stopSequences.values
        if (current.length < 4 && !current.includes(sequence)) {
          set({
            advancedSettings: {
              ...get().advancedSettings,
              stopSequences: {
                ...get().advancedSettings.stopSequences,
                values: [...current, sequence]
              }
            }
          })
        }
      },

      removeStopSequence: (index) => {
        const current = get().advancedSettings.stopSequences.values
        set({
          advancedSettings: {
            ...get().advancedSettings,
            stopSequences: {
              ...get().advancedSettings.stopSequences,
              values: current.filter((_, i) => i !== index)
            }
          }
        })
      },

      resetAdvancedSettings: () => {
        set({ advancedSettings: defaultAdvancedSettings })
      },

      reset: () => {
        // Unsubscribe before resetting
        get().unsubscribeFromExecution()

        set({
          selectedFile: null,
          selectedModel: 'claude-3-5-haiku-20241022',
          systemPrompt: '',
          operationPrompt: '',
          mode: 'stateful',
          sendSystemPrompt: true,
          thinkingMode: false,
          citations: false,
          toolUse: false,
          advancedSettings: defaultAdvancedSettings,
          conversationHistory: [],
          cachedDocumentContent: null,
          createCache: false,
          sendFile: true,
          currentExecutionId: null,
          executionStatus: 'idle',
          realtimeChannel: null,
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