"use client"

import React from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Loader2 } from "lucide-react"
import { useWorkbenchStore } from "@/stores/workbench-store"
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
  const {
    selectedFile,
    selectedModel,
    systemPrompt,
    operationPrompt,
    thinkingMode,
    citations,
    toolUse,
    isRunning,
    setFile,
    setModel,
    updateOperationPrompt,
    toggleFeature,
    runTest
  } = useWorkbenchStore()

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
    return MODEL_DISPLAY_NAMES[selectedModel] || selectedModel
  }

  return (
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
                onClick={() => {/* Future: open model selector */}}
              >
                Model
              </span>
              <span>{getModelDisplay()}</span>
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
              onClick={runTest}
              disabled={isRunning || !operationPrompt}
            >
              {isRunning ? (
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
  )
}