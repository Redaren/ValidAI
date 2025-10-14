/**
 * @fileoverview Workbench Input Component - Primary interface for configuring and executing LLM tests
 * @module components/workbench/workbench-input
 */

"use client"

import React, { useState } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Loader2, Save } from "lucide-react"
import { useRouter } from "next/navigation"
import { useWorkbenchStore } from "@/stores/workbench-store"
import { useAvailableLLMModels } from "@/hooks/use-llm-config"
import { useWorkbenchTest } from "@/hooks/use-workbench-test"
import { useUpdateOperationFromWorkbench } from "@/app/queries/operations/use-operations"
import { cn } from "@/lib/utils"
import { OperationTypeSheet } from "@/components/workbench/operation-type-sheet"
import { getOperationTypeConfig } from "@/lib/operation-types"

/**
 * Props for WorkbenchInput component
 *
 * @interface WorkbenchInputProps
 * @property processor - Current processor data from database
 */
interface WorkbenchInputProps {
  processor: {
    processor_id: string
    [key: string]: unknown
  }
  operations?: unknown[]
}

/**
 * Model ID to friendly display name mapping
 *
 * @constant
 * @type {Record<string, string>}
 * @description
 * Fallback mapping for model display names when organization
 * config doesn't provide a custom display_name.
 * Used by getModelDisplay() helper function to provide user-friendly names.
 */
const MODEL_DISPLAY_NAMES: Record<string, string> = {
  'claude-3-5-sonnet-20241022': 'Sonnet 3.5',
  'claude-3-5-haiku-20241022': 'Haiku 3.5',
  'claude-sonnet-4-5-20250929': 'Sonnet 4.5',
  'claude-3-opus-20240229': 'Opus 3',
  'claude-3-haiku-20240307': 'Haiku 3',
  'gpt-4-turbo': 'GPT-4 Turbo',
  'mistral-large-latest': 'Mistral Large'
}

/**
 * Workbench Input Component
 *
 * @component
 * @description
 * Primary interface for configuring and executing LLM tests in the ValidAI workbench.
 * Provides comprehensive controls for operation types, model selection, prompt configuration, and feature toggles.
 *
 * ## Features
 * - **Operation Type Selection**: Choose between Generic (text) and True/False (structured validation)
 * - **Mode Selection**: Toggle between stateful (conversation) and stateless (single-shot) modes
 * - **File Upload**: Support for PDF and text documents with automatic format detection
 * - **Model Selection**: Dynamic list of available models based on organization config
 * - **Feature Toggles**: Control prompt caching, thinking mode, citations, and more
 * - **Real-time Validation**: Disabled state management for running tests
 * - **Cache Control**: Manual toggle for creating cache breakpoints (auto-resets after use)
 * - **Structured Outputs**: Automatic schema validation for validation operation type
 *
 * ## Cache Optimization Architecture
 * - **Separate File Messages**: Files are sent as standalone user messages positioned BEFORE
 *   conversation history, ensuring the cache prefix (system + file) remains identical across
 *   all conversation turns for consistent 90% cost savings
 * - **User Control**: Users must keep "Send file" toggle ON for cache hits on subsequent turns
 * - **Message Structure**: `[system, user(file_with_cache), ...history..., user(prompt)]`
 *
 * ## State Management
 * Uses Zustand store for centralized state management across workbench components
 *
 * @param {WorkbenchInputProps} props - Component props
 * @returns {JSX.Element} Rendered workbench input interface
 */
export function WorkbenchInput({ processor }: WorkbenchInputProps) {
  const router = useRouter()
  const [isModelSheetOpen, setIsModelSheetOpen] = useState(false)

  const {
    selectedFile,
    selectedModel,
    selectedOperationType,
    systemPrompt,
    operationPrompt,
    mode,
    sendSystemPrompt,
    thinkingMode,
    citations,
    toolUse,
    createCache,
    sendFile,
    conversationHistory,
    advancedSettings,
    editOperationId,
    setFile,
    setModel,
    updateOperationPrompt,
    setMode,
    toggleSystemPrompt,
    toggleFeature,
    toggleCreateCache,
    resetCacheToggle,
    toggleSendFile,
    addToConversation,
    clearOutput,
    subscribeToExecution,
    unsubscribeFromExecution
  } = useWorkbenchStore()

  const { data: availableModels, isLoading: modelsLoading } = useAvailableLLMModels()
  const workbenchTest = useWorkbenchTest()
  const updateOperationMutation = useUpdateOperationFromWorkbench()

  /**
   * Opens native file picker dialog for document upload
   *
   * @function handleFileSelect
   * @description
   * Programmatically creates and triggers a file input element.
   * Accepts common document formats for testing operations.
   *
   * @supported-formats
   * - PDF (.pdf) - Processed as base64 for Anthropic's native PDF support
   * - Text files (.txt, .md) - Sent as plain text content
   * - Documents (.doc, .docx) - For future processing
   * - Spreadsheets (.xls, .xlsx) - For future processing
   * - HTML (.html) - Sent as text content
   */
  const handleFileSelect = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.pdf,.txt,.html,.md,.doc,.docx,.xls,.xlsx'
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (file) {
        setFile({
          type: 'uploaded',
          file,
          name: file.name,
          size: file.size
        })
      }
    }
    input.click()
  }

  /**
   * Format file size in human-readable format
   *
   * @param bytes - File size in bytes
   * @returns Formatted string (e.g., "1.5 mb", "234 kb", "56 B")
   */
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' kb'
    return (bytes / (1024 * 1024)).toFixed(1) + ' mb'
  }

  /**
   * Get display string for currently selected file
   *
   * @returns "Not selected" or "filename.pdf / 1.5 mb"
   */
  const getFileDisplay = () => {
    if (!selectedFile) return 'Not selected'
    return `${selectedFile.name} / ${formatFileSize(selectedFile.size)}`
  }

  /**
   * Get display name for currently selected model
   *
   * Resolves from:
   * 1. Organization's available_models display_name
   * 2. MODEL_DISPLAY_NAMES fallback mapping
   * 3. Raw model ID as last resort
   *
   * @returns Model display name (e.g., "Claude 3.5 Sonnet")
   */
  const getModelDisplay = () => {
    if (!availableModels) return 'Loading...'
    const model = availableModels.models.find(m => m.model === selectedModel)
    return model?.display_name || MODEL_DISPLAY_NAMES[selectedModel] || selectedModel
  }

  /**
   * Get display name for currently selected operation type
   *
   * Retrieves user-friendly display name from operation type configuration.
   * Used in the settings panel to show current selection.
   *
   * @returns {string} Operation type display name (e.g., "Generic", "True / False")
   * @example
   * // When selectedOperationType is 'validation'
   * getOperationTypeDisplay() // Returns: "True / False"
   */
  const getOperationTypeDisplay = () => {
    const config = getOperationTypeConfig(selectedOperationType)
    return config.displayName
  }

  /**
   * Execute workbench test with current settings
   *
   * Sends test request to Edge Function with selected operation type, model, and configuration.
   * Operation type determines execution mode (generateText vs generateObject) and response structure.
   *
   * @async
   * @function handleRunTest
   * @description
   * Orchestrates the complete test execution flow from UI to Edge Function and back.
   * Handles both stateful and stateless modes with proper conversation management.
   *
   * ## Execution Flow
   * 1. **Validation**: Ensures prompt is not empty
   * 2. **Mode Handling**: Clears output in stateless mode
   * 3. **File Processing**: Reads and encodes files (PDF as base64, text as string)
   * 4. **API Call**: Sends request to Edge Function with all settings
   * 5. **Real-time Subscription**: Subscribes to execution updates via Supabase
   * 6. **Conversation Management**: Adds user and assistant messages to history
   * 7. **UI Updates**: Clears prompt and resets cache toggle
   *
   * ## Stateful Mode
   * - Preserves conversation history with exact content structures
   * - Maintains cache control metadata for 90% cost savings
   * - Stores file blocks with Buffer representations
   *
   * ## Error Handling
   * - Displays errors in UI via TanStack Query
   * - Maintains execution state for debugging
   *
   * @throws {Error} Test execution failures from Edge Function
   */
  const handleRunTest = async () => {
    if (!operationPrompt.trim()) {
      return
    }

    try {
      // In stateless mode: clear output before new test
      if (mode === 'stateless') {
        clearOutput()
      }

      const result = await workbenchTest.mutateAsync({
        processor_id: processor.processor_id,
        mode: mode,
        operation_type: selectedOperationType,
        system_prompt: systemPrompt,
        send_system_prompt: sendSystemPrompt,
        send_file: sendFile,
        file_content: selectedFile?.type === 'uploaded'
          ? await readFileAsText(selectedFile.file)
          : undefined,
        file_type: selectedFile?.type === 'uploaded'
          ? (selectedFile.file.type || 'text/plain') as any
          : undefined,
        conversation_history: mode === 'stateful' ? conversationHistory : [],
        new_prompt: operationPrompt,
        settings: {
          model_id: selectedModel,
          citations_enabled: citations,
          create_cache: createCache,

          // Always send max_tokens (required by API)
          max_tokens: advancedSettings.maxTokens,

          // Thinking (only if thinking mode toggle is ON)
          thinking: thinkingMode ? {
            type: 'enabled',
            budget_tokens: advancedSettings.thinkingBudget
          } : undefined,

          // Optional overrides (only sent when enabled)
          temperature: advancedSettings.temperature.enabled
            ? advancedSettings.temperature.value
            : undefined,

          top_p: advancedSettings.topP.enabled
            ? advancedSettings.topP.value
            : undefined,

          top_k: advancedSettings.topK.enabled
            ? advancedSettings.topK.value
            : undefined,

          stop_sequences: advancedSettings.stopSequences.enabled &&
                          advancedSettings.stopSequences.values.length > 0
            ? advancedSettings.stopSequences.values
            : undefined
        }
      })

      // Subscribe to real-time updates for this execution
      if (result.execution_id) {
        subscribeToExecution(result.execution_id)
      }

      // Add to conversation history with metadata (only in stateful mode)
      if (mode === 'stateful') {
        // Strip file blocks from conversation history to maintain cache position
        // Files should only be sent on first message to keep cache prefix stable
        const contentForHistory = (() => {
          const content = result.user_content_sent
          if (Array.isArray(content)) {
            // Filter out file blocks, keep only text blocks
            const textBlocks = content.filter((block: any) => block.type === 'text')
            // If we have text blocks, return them; otherwise return just the text
            if (textBlocks.length > 0) {
              return textBlocks.length === 1 ? textBlocks[0].text : textBlocks
            }
          }
          return content  // Return as-is if not an array
        })()

        addToConversation({
          role: 'user',
          content: contentForHistory,  // Store only text content, no files
          timestamp: new Date().toISOString(),
          metadata: {
            mode: mode,
            cacheCreated: createCache,
            systemPromptSent: sendSystemPrompt,
            fileSent: sendFile && !!selectedFile,
            thinkingEnabled: thinkingMode,
            citationsEnabled: citations,
            inputTokens: result.metadata.inputTokens,
            outputTokens: 0,
            // Don't store cache statistics here - they're in the assistant message
            // This prevents double-counting in the UI
          },
          // Store original file content when caching is enabled so it can be reconstructed
          ...(createCache && result.metadata.fileSent && result.user_content_sent ? (() => {
            // Extract file content from the result
            if (Array.isArray(result.user_content_sent)) {
              const fileBlock = result.user_content_sent.find((block: any) => block.type === 'file')
              if (fileBlock) {
                return {
                  original_file_content: fileBlock.data,  // This is base64 string
                  original_file_type: fileBlock.mediaType || 'application/pdf'
                }
              }
              // Check for text files sent as text blocks (non-PDF files)
              const firstBlock = result.user_content_sent[0]
              if (firstBlock?.type === 'text' && result.metadata.fileSent) {
                return {
                  original_file_content: firstBlock.text,  // Plain text content
                  original_file_type: 'text/plain'
                }
              }
            }
            return {}
          })() : {})
        })

        addToConversation({
          role: 'assistant',
          content: result.response,
          timestamp: result.timestamp,
          metadata: result.metadata,
          thinking_blocks: result.thinking_blocks,
          citations: result.citations,
          structured_output: result.structured_output,
          tokensUsed: result.tokensUsed  // Keep for backward compatibility
        })
      } else {
        // Stateless mode: Still show output but don't add to conversation
        // Output will be cleared on next message (line 171)
        // For now, we could optionally add messages that will be cleared
        // This allows viewing the result before the next test

        // Strip file blocks from conversation history (same as stateful mode)
        const contentForHistory = (() => {
          const content = result.user_content_sent
          if (Array.isArray(content)) {
            const textBlocks = content.filter((block: any) => block.type === 'text')
            if (textBlocks.length > 0) {
              return textBlocks.length === 1 ? textBlocks[0].text : textBlocks
            }
          }
          return content
        })()

        addToConversation({
          role: 'user',
          content: contentForHistory,  // Store only text content, no files
          timestamp: new Date().toISOString(),
          metadata: {
            mode: mode,
            cacheCreated: createCache,
            systemPromptSent: sendSystemPrompt,
            fileSent: sendFile && !!selectedFile,
            thinkingEnabled: thinkingMode,
            citationsEnabled: citations,
            inputTokens: result.metadata.inputTokens,
            outputTokens: 0,
            // Don't store cache statistics here - they're in the assistant message
            // This prevents double-counting in the UI
          },
          // Store original file content when caching is enabled so it can be reconstructed
          ...(createCache && result.metadata.fileSent && result.user_content_sent ? (() => {
            // Extract file content from the result
            if (Array.isArray(result.user_content_sent)) {
              const fileBlock = result.user_content_sent.find((block: any) => block.type === 'file')
              if (fileBlock) {
                return {
                  original_file_content: fileBlock.data,  // This is base64 string
                  original_file_type: fileBlock.mediaType || 'application/pdf'
                }
              }
              // Check for text files sent as text blocks (non-PDF files)
              const firstBlock = result.user_content_sent[0]
              if (firstBlock?.type === 'text' && result.metadata.fileSent) {
                return {
                  original_file_content: firstBlock.text,  // Plain text content
                  original_file_type: 'text/plain'
                }
              }
            }
            return {}
          })() : {})
        })

        addToConversation({
          role: 'assistant',
          content: result.response,
          timestamp: result.timestamp,
          metadata: result.metadata,
          thinking_blocks: result.thinking_blocks,
          citations: result.citations,
          structured_output: result.structured_output,
          tokensUsed: result.tokensUsed
        })
      }

      // Clear the prompt for next message
      updateOperationPrompt('')

      // Auto-reset "Create cache" toggle to OFF after successful send
      if (createCache) {
        resetCacheToggle()
      }

      // Unsubscribe after getting the result (execution is complete)
      setTimeout(() => {
        unsubscribeFromExecution()
      }, 1000) // Small delay to ensure we receive the final update

    } catch (error) {
      console.error('Test execution failed:', error)
      unsubscribeFromExecution()
    }
  }

  /**
   * Handles saving operation changes back to the database
   * Only available in edit mode (when editOperationId is set)
   *
   * @async
   * @function handleSaveOperation
   * @description
   * Saves the current prompt and operation type to the operation in the database,
   * then redirects back to the processor detail page.
   */
  const handleSaveOperation = async () => {
    if (!editOperationId) return

    try {
      await updateOperationMutation.mutateAsync({
        id: editOperationId,
        processorId: processor.processor_id,
        prompt: operationPrompt,
        operation_type: selectedOperationType
      })

      // Redirect back to processor detail page after successful save
      router.push(`/proc/${processor.processor_id}`)
    } catch (error) {
      console.error('Failed to save operation:', error)
      // Error will be visible in the UI through the mutation state
    }
  }

  /**
   * Read file content using FileReader API
   *
   * Handles both text and binary files:
   * - Text files: Read as plain text
   * - PDF files: Read as base64-encoded data URL, then extract base64 content
   *
   * @param file - File object from file input
   * @returns Promise resolving to file content (text or base64 string)
   * @throws Error if file read fails
   */
  /**
   * Reads uploaded file content and converts to appropriate format
   *
   * @async
   * @function readFileAsText
   * @param {File} file - File object from file input
   * @returns {Promise<string>} Base64 string for PDFs, plain text for other files
   *
   * @description
   * Handles file reading with format-specific processing:
   * - **PDFs**: Read as data URL, extract base64 portion for Anthropic API
   * - **Text files**: Read as plain text string
   *
   * The base64 extraction for PDFs is critical for proper API consumption.
   * Data URL format: `data:application/pdf;base64,<base64content>`
   * We extract only the base64 portion after the comma.
   */
  const readFileAsText = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()

      reader.onload = (e) => {
        const result = e.target?.result as string

        // For PDFs, extract base64 content from data URL
        if (file.type === 'application/pdf') {
          // Data URL format: data:application/pdf;base64,<base64content>
          const base64Content = result.split(',')[1]
          resolve(base64Content)
        } else {
          // For text files, return as-is
          resolve(result)
        }
      }

      reader.onerror = reject

      // Read PDFs as data URL (base64), text files as text
      if (file.type === 'application/pdf') {
        reader.readAsDataURL(file)
      } else {
        reader.readAsText(file)
      }
    })
  }

  return (
    <>
      {/* Model Selector Sheet */}
      <Sheet open={isModelSheetOpen} onOpenChange={setIsModelSheetOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Select Model</SheetTitle>
            <SheetDescription>
              Choose an LLM model for testing operations
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-2">
            {modelsLoading && (
              <p className="text-sm text-muted-foreground">Loading models...</p>
            )}
            {availableModels?.models.map((model) => (
              <button
                key={model.id}
                onClick={() => {
                  setModel(model.model)
                  setIsModelSheetOpen(false)
                }}
                className={cn(
                  "w-full text-left px-4 py-3 rounded-lg border transition-colors",
                  selectedModel === model.model
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-accent"
                )}
              >
                <div className="font-medium">{model.display_name}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {model.provider} • {model.model}
                </div>
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    <div className="grid grid-cols-1 lg:grid-cols-[auto,1fr] gap-6">
      {/* Left Column - Text-based UI */}
      <div className="space-y-4">
        {/* Settings Header */}
        <div className="space-y-3">
          <Label>Settings</Label>
          <div className="space-y-3 text-sm text-muted-foreground">
            {/* Mode Toggle */}
            <div className="grid grid-cols-[140px,auto] gap-4 items-center">
              <span>Mode</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setMode('stateful')}
                  className={cn(
                    "px-3 py-1 text-xs rounded-md transition-colors",
                    mode === 'stateful'
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted hover:bg-muted/80"
                  )}
                >
                  Stateful
                </button>
                <button
                  onClick={() => setMode('stateless')}
                  className={cn(
                    "px-3 py-1 text-xs rounded-md transition-colors",
                    mode === 'stateless'
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted hover:bg-muted/80"
                  )}
                >
                  Stateless
                </button>
              </div>
            </div>

            {/* System Prompt Toggle - only show if system prompt exists */}
            {systemPrompt && (
              <div className="grid grid-cols-[140px,auto] gap-4 items-center">
                <span>Send system prompt</span>
                <Switch
                  checked={sendSystemPrompt}
                  onCheckedChange={toggleSystemPrompt}
                />
              </div>
            )}

            {/* Operation Type */}
            <div className="grid grid-cols-[140px,auto] gap-4 items-center">
              <OperationTypeSheet>
                <span className="cursor-pointer hover:underline">
                  Operation type
                </span>
              </OperationTypeSheet>
              <span>{getOperationTypeDisplay()}</span>
            </div>

            {/* File */}
            <div className="grid grid-cols-[140px,auto] gap-4 items-center">
              <span
                className="cursor-pointer hover:underline"
                onClick={handleFileSelect}
              >
                File
              </span>
              <span>{getFileDisplay()}</span>
            </div>

            {/* Send file - only show if file is selected */}
            {selectedFile && (
              <div className="grid grid-cols-[140px,auto] gap-4 items-center pl-4">
                <span>Send file</span>
                <Switch
                  checked={sendFile}
                  onCheckedChange={toggleSendFile}
                />
              </div>
            )}

            {/* Model */}
            <div className="grid grid-cols-[140px,auto] gap-4 items-center">
              <span
                className="cursor-pointer hover:underline"
                onClick={() => setIsModelSheetOpen(true)}
              >
                Model
              </span>
              <span>{getModelDisplay()}</span>
            </div>

            {/* Create Cache */}
            <div className="grid grid-cols-[140px,auto] gap-4 items-center">
              <span>Create cache</span>
              <Switch
                checked={createCache}
                onCheckedChange={toggleCreateCache}
              />
            </div>

            {/* Thinking Mode */}
            <div className="grid grid-cols-[140px,auto] gap-4 items-center">
              <span>Thinking mode</span>
              <Switch
                checked={thinkingMode}
                onCheckedChange={() => toggleFeature('thinking')}
              />
            </div>

            {/* Citations */}
            <div className="grid grid-cols-[140px,auto] gap-4 items-center">
              <span>Citations</span>
              <Switch
                checked={citations}
                onCheckedChange={() => toggleFeature('citations')}
              />
            </div>

            {/* Tool Use */}
            <div className="grid grid-cols-[140px,auto] gap-4 items-center">
              <span>Tool use</span>
              <Switch
                checked={toolUse}
                onCheckedChange={() => toggleFeature('toolUse')}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Right Column */}
      <div className="space-y-4 lg:pl-8">
        {/* System Prompt */}
        <div className="space-y-2">
          <Label>Processor&apos;s system prompt</Label>
          <div className="text-sm text-muted-foreground">
            {systemPrompt
              ? (systemPrompt.length > 158 ? systemPrompt.substring(0, 158) + '..' : systemPrompt)
              : 'System prompt not set. Can be done in processor settings'}
          </div>
        </div>

        {/* Operation Prompt */}
        <div className="space-y-2">
          <Label>Prompt</Label>
          <Textarea
            placeholder="Type your message here..."
            value={operationPrompt}
            onChange={(e) => updateOperationPrompt(e.target.value)}
            className="min-h-[200px] resize-none"
          />
          <div className="flex items-center justify-end gap-2">
            <Button
              onClick={handleRunTest}
              disabled={workbenchTest.isPending || !operationPrompt}
            >
              {workbenchTest.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Testing...
                </>
              ) : (
                'Test'
              )}
            </Button>

            {/* Save to Operation button - only shown in edit mode */}
            {editOperationId && (
              <Button
                variant="default"
                onClick={handleSaveOperation}
                disabled={updateOperationMutation.isPending || !operationPrompt}
              >
                {updateOperationMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save to Operation
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
    </>
  )
}