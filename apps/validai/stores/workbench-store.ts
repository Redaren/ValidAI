/**
 * @fileoverview Workbench Store - Centralized state management for the ValidAI workbench
 * @module stores/workbench-store
 */

import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { ConversationMessage, WorkbenchExecution } from '@/lib/validations'
import { createBrowserClient } from '@playze/shared-auth/client'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { OperationType } from '@/lib/operation-types'

/**
 * Test result from running an operation test
 *
 * @interface TestResult
 * @property {string} response - AI-generated response text
 * @property {any[]} [thinking_blocks] - Extended thinking/reasoning blocks from Claude
 * @property {any[]} [citations] - Citation references from processed documents
 * @property {Object} tokensUsed - Token consumption metrics
 * @property {number} tokensUsed.input - Input/prompt tokens consumed
 * @property {number} tokensUsed.output - Output/completion tokens generated
 * @property {number} [tokensUsed.cached_read] - Tokens read from cache (90% cost savings)
 * @property {number} [tokensUsed.cached_write] - Tokens written to cache (25% extra cost)
 * @property {number} tokensUsed.total - Total tokens (input + output)
 * @property {number} executionTime - Response generation time in milliseconds
 * @property {string} timestamp - ISO timestamp of response
 * @property {string} [error] - Error message if test failed
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
 * OCR result from Mistral OCR processing
 *
 * @interface OCRResult
 * @property {'ocr'} type - Result type identifier
 * @property {string} markdown - Full markdown content from OCR
 * @property {any} [annotations] - Structured annotations (if annotation format was specified)
 * @property {Object} metadata - Execution metadata
 * @property {string} metadata.model - Model used for OCR
 * @property {number} metadata.executionTime - Processing time in milliseconds
 * @property {string} metadata.annotationFormat - Selected annotation format
 * @property {string} metadata.fileType - MIME type of processed file
 * @property {string} metadata.timestamp - ISO timestamp of processing
 */
export interface OCRResult {
  type: 'ocr'
  markdown: string
  annotations: any | null
  metadata: {
    model: string
    executionTime: number
    annotationFormat: string
    fileType: string
    timestamp: string
  }
}

/**
 * Advanced LLM settings with override controls
 *
 * @interface AdvancedSettings
 * @description
 * Fine-grained control over model parameters with selective override capability.
 * Each optional parameter has an "enabled" flag to control whether it's sent to the API.
 * When enabled=false, the LLM uses its default value.
 *
 * @property {number} maxTokens - Maximum response length (always sent)
 * @property {number} thinkingBudget - Token budget for reasoning mode (when enabled)
 * @property {Object} temperature - Creativity control (0.0-2.0)
 * @property {Object} topP - Nucleus sampling threshold
 * @property {Object} topK - Top-K sampling limit
 * @property {Object} stopSequences - Custom stop strings
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
 *
 * @type {SelectedFile}
 * @description
 * Union type for file selection in the workbench.
 * Supports both direct file uploads and reference to stored documents.
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
 * Workbench Store Interface
 *
 * @interface WorkbenchStore
 * @description
 * Complete state management for the ValidAI workbench testing interface.
 * Handles all aspects of LLM test configuration, execution, and result display.
 *
 * ## Core Responsibilities
 * - **File Management**: Upload and selection of documents for testing
 * - **LLM Configuration**: Model and operation type selection, parameters, and feature toggles
 * - **Operation Types**: Structured output control (Generic text vs. Validation boolean)
 * - **Mode Management**: Stateful (conversation) vs stateless (single-shot) modes
 * - **Conversation History**: Multi-turn dialogue with message preservation
 * - **Cache Control**: Prompt caching for 90% cost reduction on repeated content
 * - **Real-time Updates**: WebSocket subscriptions for execution status
 * - **Advanced Settings**: Fine-grained control over model parameters
 *
 * ## State Synchronization
 * - Uses Zustand for reactive state management
 * - Integrates with Supabase Realtime for execution updates
 * - Preserves exact content structures for cache consistency
 *
 * ## Performance Features
 * - Maintains cached document content for repeated use
 * - Tracks token usage for cost optimization
 * - Supports cache hit/miss analytics
 */
export interface WorkbenchStore {
  // Core State
  selectedFile: SelectedFile
  selectedModel: string
  /**
   * Selected operation type determining output structure and execution mode
   * - 'generic': Free-form text via generateText()
   * - 'validation': Structured boolean+comment via generateObject()
   * - Future types: extraction, rating, classification, analysis
   * @default 'generic'
   */
  selectedOperationType: OperationType
  systemPrompt: string
  operationPrompt: string

  // Edit Mode State (for operation editing via workbench)
  editOperationId: string | null
  editOperationName: string | null

  // Mode Management
  mode: 'stateful' | 'stateless'
  sendSystemPrompt: boolean

  // Feature Flags
  thinkingMode: boolean
  citations: boolean
  toolUse: boolean
  advancedMode: boolean
  autoParseStructuredData: boolean  // Auto-parse JSON/XML in responses (default: true)

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

  // OCR State
  ocrAnnotationFormat: 'none' | 'chapters' | 'dates' | 'items' | 'custom'
  ocrResults: OCRResult | null

  // Actions
  setFile: (file: SelectedFile) => void
  setModel: (modelId: string) => void
  /**
   * Set the operation type for the next test execution
   * Determines whether Edge Function uses generateText (generic) or generateObject (validation)
   * @param operationType - The operation type enum value
   */
  setOperationType: (operationType: OperationType) => void
  setSystemPrompt: (prompt: string) => void
  updateOperationPrompt: (prompt: string) => void
  /**
   * Enter edit mode for a specific operation
   * @param operationId - The operation UUID being edited
   * @param operationName - The operation name for display in header
   */
  setEditOperation: (operationId: string, operationName: string) => void
  /**
   * Exit edit mode and return to standalone workbench mode
   */
  clearEditOperation: () => void
  setMode: (mode: 'stateful' | 'stateless') => void
  toggleSystemPrompt: () => void
  toggleFeature: (feature: 'thinking' | 'citations' | 'toolUse') => void
  toggleAdvancedMode: () => void
  toggleAutoParseStructuredData: () => void
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
  clearStopSequences: () => void
  resetAdvancedSettings: () => void

  // OCR Actions
  setOCRAnnotationFormat: (format: 'none' | 'chapters' | 'dates' | 'items' | 'custom') => void
  setOCRResults: (results: OCRResult) => void
  clearOCRResults: () => void
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
      selectedModel: '',  // Will be set from database default on mount
      selectedOperationType: 'generic',  // Default to generic (backward compatible)
      systemPrompt: '',
      operationPrompt: '',
      editOperationId: null,
      editOperationName: null,
      mode: 'stateful',  // Default to stateful mode
      sendSystemPrompt: true,  // Default to sending system prompt
      thinkingMode: false,
      citations: false,
      toolUse: false,
      advancedMode: false,  // Default to simple mode
      autoParseStructuredData: true,  // Default to auto-parsing for backward compatibility
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

      // OCR initial state
      ocrAnnotationFormat: 'none',
      ocrResults: null,

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

      setOperationType: (operationType) => {
        set({ selectedOperationType: operationType })
      },

      setSystemPrompt: (prompt) => {
        set({ systemPrompt: prompt })
      },

      updateOperationPrompt: (prompt) => {
        set({ operationPrompt: prompt })
      },

      setEditOperation: (operationId, operationName) => {
        set({
          editOperationId: operationId,
          editOperationName: operationName
        })
      },

      clearEditOperation: () => {
        set({
          editOperationId: null,
          editOperationName: null
        })
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

      toggleAdvancedMode: () => {
        set({ advancedMode: !get().advancedMode })
      },

      toggleAutoParseStructuredData: () => {
        set({ autoParseStructuredData: !get().autoParseStructuredData })
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

        const supabase = createBrowserClient()

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

      clearStopSequences: () => {
        set({
          advancedSettings: {
            ...get().advancedSettings,
            stopSequences: {
              ...get().advancedSettings.stopSequences,
              values: []
            }
          }
        })
      },

      resetAdvancedSettings: () => {
        set({ advancedSettings: defaultAdvancedSettings })
      },

      // OCR Actions

      setOCRAnnotationFormat: (format) => {
        set({ ocrAnnotationFormat: format })
      },

      setOCRResults: (results) => {
        set({ ocrResults: results })
      },

      clearOCRResults: () => {
        set({ ocrResults: null })
      },

      reset: () => {
        // Unsubscribe before resetting
        get().unsubscribeFromExecution()

        set({
          selectedFile: null,
          selectedModel: '',  // Will be set from database default on mount
          selectedOperationType: 'generic',
          systemPrompt: '',
          operationPrompt: '',
          editOperationId: null,
          editOperationName: null,
          mode: 'stateful',
          sendSystemPrompt: true,
          thinkingMode: false,
          citations: false,
          toolUse: false,
          advancedMode: false,
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
          error: null,
          ocrAnnotationFormat: 'none',
          ocrResults: null
        })
      }
    }),
    {
      name: 'workbench-store'
    }
  )
)