"use client"

import React, { useState } from "react"
import { Card } from "@/components/ui/card"
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
import { Loader2 } from "lucide-react"
import { useWorkbenchStore } from "@/stores/workbench-store"
import { useAvailableLLMModels } from "@/hooks/use-llm-config"
import { useWorkbenchTest } from "@/hooks/use-workbench-test"
import { cn } from "@/lib/utils"

/**
 * Props for WorkbenchInput component
 *
 * @property processor - Current processor data from database
 * @property operations - Operations configured for this processor (future use)
 */
interface WorkbenchInputProps {
  processor: any
  operations: any[]
}

/**
 * Model ID to friendly display name mapping
 *
 * Fallback mapping for model display names when organization
 * config doesn't provide a custom display_name.
 * Used by getModelDisplay() helper function.
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
 * Main input interface with two columns:
 * - Left: Operation selection, file upload, model choice, and feature toggles
 * - Right: System prompt (read-only) and operation prompt (editable)
 */
export function WorkbenchInput({ processor, operations }: WorkbenchInputProps) {
  const [isModelSheetOpen, setIsModelSheetOpen] = useState(false)

  const {
    selectedFile,
    selectedModel,
    systemPrompt,
    operationPrompt,
    mode,
    sendSystemPrompt,
    thinkingMode,
    citations,
    toolUse,
    createCache,
    sendFile,
    isRunning,
    executionStatus,
    conversationHistory,
    advancedSettings,
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

  /**
   * Opens native file picker dialog for document upload
   *
   * Programmatically creates and triggers a file input element.
   * Accepts common document formats for testing operations.
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
   * Execute workbench test with current settings
   *
   * Flow:
   * 1. Validate prompt is not empty
   * 2. Read file content if file is uploaded
   * 3. Call Edge Function with conversation history
   * 4. Subscribe to real-time updates
   * 5. Add messages to conversation history
   * 6. Clear prompt for next turn
   *
   * @throws Error if test execution fails
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
        addToConversation({
          role: 'user',
          content: result.user_content_sent,  // Store exact content structure sent to Anthropic
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
            cachedReadTokens: result.metadata.cachedReadTokens,
            cachedWriteTokens: result.metadata.cachedWriteTokens
          }
        })

        addToConversation({
          role: 'assistant',
          content: result.response,
          timestamp: result.timestamp,
          metadata: result.metadata,
          thinking_blocks: result.thinking_blocks,
          citations: result.citations,
          tokensUsed: result.tokensUsed  // Keep for backward compatibility
        })
      } else {
        // Stateless mode: Still show output but don't add to conversation
        // Output will be cleared on next message (line 171)
        // For now, we could optionally add messages that will be cleared
        // This allows viewing the result before the next test
        addToConversation({
          role: 'user',
          content: result.user_content_sent,  // Store exact content structure sent to Anthropic
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
            cachedReadTokens: result.metadata.cachedReadTokens,
            cachedWriteTokens: result.metadata.cachedWriteTokens
          }
        })

        addToConversation({
          role: 'assistant',
          content: result.response,
          timestamp: result.timestamp,
          metadata: result.metadata,
          thinking_blocks: result.thinking_blocks,
          citations: result.citations,
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
              <span
                className="cursor-pointer hover:underline"
                onClick={() => {/* Future: open operation type selector */}}
              >
                Operation type
              </span>
              <span>Generic</span>
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
          <Label>Processor's system prompt</Label>
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
          <div className="flex items-center justify-end">
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
          </div>
        </div>
      </div>
    </div>
    </>
  )
}