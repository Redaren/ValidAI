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
 * Advanced LLM settings
 */
export interface AdvancedSettings {
  temperature: number
  maxTokens: number
  topP: number
  topK: number
  thinkingBudget: number | null  // null = disabled, min 1024
  stopSequences: string[]
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

  // Feature Flags
  thinkingMode: boolean
  citations: boolean
  toolUse: boolean

  // Advanced Settings
  advancedSettings: AdvancedSettings

  // Conversation & Caching
  conversationHistory: ConversationMessage[]
  cachedDocumentContent: string | null  // Keep exact content for cache consistency
  cacheEnabled: boolean

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
  toggleFeature: (feature: 'thinking' | 'citations' | 'toolUse') => void
  updateAdvancedSettings: (settings: Partial<AdvancedSettings>) => void
  setThinkingBudget: (tokens: number | null) => void
  toggleCaching: () => void
  addToConversation: (message: ConversationMessage) => void
  clearConversation: () => void
  clearOutput: () => void
  subscribeToExecution: (executionId: string) => void
  unsubscribeFromExecution: () => void
  handleExecutionUpdate: (execution: WorkbenchExecution) => void
  reset: () => void
}

/**
 * Default advanced settings for Anthropic Claude API
 *
 * Values match Anthropic's recommended defaults:
 * - temperature: 1.0 (balanced creativity/accuracy)
 * - maxTokens: 4096 (sufficient for most responses)
 * - topP: 1.0 (nucleus sampling disabled)
 * - topK: 40 (sample from top 40 tokens)
 * - thinkingBudget: null (extended thinking disabled)
 * - stopSequences: [] (no custom stop sequences)
 *
 * @see {@link https://docs.claude.com/en/api/messages} Anthropic API parameters
 */
const defaultAdvancedSettings: AdvancedSettings = {
  temperature: 1.0,  // Anthropic default
  maxTokens: 4096,
  topP: 1.0,
  topK: 40,
  thinkingBudget: null,  // Disabled by default
  stopSequences: []
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
      conversationHistory: [],
      cachedDocumentContent: null,
      cacheEnabled: false,
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

      setThinkingBudget: (tokens) => {
        set({
          advancedSettings: {
            ...get().advancedSettings,
            thinkingBudget: tokens
          }
        })
      },

      toggleCaching: () => {
        set({ cacheEnabled: !get().cacheEnabled })
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

      reset: () => {
        // Unsubscribe before resetting
        get().unsubscribeFromExecution()

        set({
          selectedFile: null,
          selectedModel: 'claude-3-5-sonnet-20241022',
          systemPrompt: '',
          operationPrompt: '',
          thinkingMode: false,
          citations: false,
          toolUse: false,
          advancedSettings: defaultAdvancedSettings,
          conversationHistory: [],
          cachedDocumentContent: null,
          cacheEnabled: false,
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