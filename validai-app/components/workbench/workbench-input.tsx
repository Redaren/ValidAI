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

interface WorkbenchInputProps {
  processor: any
  operations: any[]
}

// Model ID to friendly name mapping
const MODEL_DISPLAY_NAMES: Record<string, string> = {
  'claude-3-5-sonnet-20241022': 'Sonnet 3.5',
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
    thinkingMode,
    citations,
    toolUse,
    cacheEnabled,
    isRunning,
    executionStatus,
    conversationHistory,
    setFile,
    setModel,
    updateOperationPrompt,
    toggleFeature,
    toggleCaching,
    addToConversation,
    subscribeToExecution,
    unsubscribeFromExecution
  } = useWorkbenchStore()

  const { data: availableModels, isLoading: modelsLoading } = useAvailableLLMModels()
  const workbenchTest = useWorkbenchTest()

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

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' kb'
    return (bytes / (1024 * 1024)).toFixed(1) + ' mb'
  }

  const getFileDisplay = () => {
    if (!selectedFile) return 'Not selected'
    return `${selectedFile.name} / ${formatFileSize(selectedFile.size)}`
  }

  const getModelDisplay = () => {
    if (!availableModels) return 'Loading...'
    const model = availableModels.models.find(m => m.model === selectedModel)
    return model?.display_name || MODEL_DISPLAY_NAMES[selectedModel] || selectedModel
  }

  const handleRunTest = async () => {
    if (!operationPrompt.trim()) {
      return
    }

    try {
      const result = await workbenchTest.mutateAsync({
        processor_id: processor.processor_id,
        system_prompt: systemPrompt,
        file_content: selectedFile?.type === 'uploaded'
          ? await readFileAsText(selectedFile.file)
          : undefined,
        file_type: selectedFile?.type === 'uploaded'
          ? (selectedFile.file.type || 'text/plain') as any
          : undefined,
        conversation_history: conversationHistory,
        new_prompt: operationPrompt,
        settings: {
          model_id: selectedModel,
          citations_enabled: citations,
          caching_enabled: cacheEnabled,
          thinking: thinkingMode ? { type: 'enabled', budget_tokens: 10000 } : undefined
        }
      })

      // Subscribe to real-time updates for this execution
      if (result.execution_id) {
        subscribeToExecution(result.execution_id)
      }

      // Add to conversation history
      addToConversation({
        role: 'user',
        content: operationPrompt,
        timestamp: new Date().toISOString()
      })

      addToConversation({
        role: 'assistant',
        content: result.response,
        timestamp: result.timestamp,
        tokensUsed: result.tokensUsed
      })

      // Clear the prompt for next message
      updateOperationPrompt('')

      // Unsubscribe after getting the result (execution is complete)
      setTimeout(() => {
        unsubscribeFromExecution()
      }, 1000) // Small delay to ensure we receive the final update

    } catch (error) {
      console.error('Test execution failed:', error)
      unsubscribeFromExecution()
    }
  }

  const readFileAsText = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => resolve(e.target?.result as string)
      reader.onerror = reject
      reader.readAsText(file)
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

            {/* Caching */}
            <div className="grid grid-cols-[140px,auto] gap-4 items-center">
              <span>Caching</span>
              <Switch
                checked={cacheEnabled}
                onCheckedChange={toggleCaching}
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