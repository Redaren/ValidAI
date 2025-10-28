"use client"

import React, { useState } from "react"
import { Button, Input, Label } from "@playze/shared-ui"
import { Switch } from "@/components/ui/switch"
import { Slider } from "@/components/ui/slider"
import { useWorkbenchStore } from "@/stores/workbench-store"
import { X } from "lucide-react"

/**
 * Advanced Settings Component for Workbench
 *
 * Two-column layout for efficient space usage.
 * Allows users to override optional API parameters with explicit toggles.
 *
 * Key Behaviors:
 * - Only sends parameters to API when override toggle is enabled
 * - Max tokens always sent (required by API)
 * - Thinking budget always visible (only sent when thinking mode is ON)
 * - Temperature disabled when thinking mode is ON (incompatible)
 * - Auto-adjusts thinking budget when max tokens changes
 */
export function WorkbenchAdvancedSettings() {
  const [newStopSequence, setNewStopSequence] = useState("")

  const {
    advancedSettings,
    thinkingMode,
    autoParseStructuredData,
    setMaxTokens,
    setThinkingBudgetValue,
    toggleTemperature,
    setTemperatureValue,
    toggleTopP,
    setTopPValue,
    toggleTopK,
    setTopKValue,
    toggleStopSequences,
    addStopSequence,
    removeStopSequence,
    clearStopSequences,
    resetAdvancedSettings,
    toggleAutoParseStructuredData
  } = useWorkbenchStore()

  const handleAddStopSequence = () => {
    if (newStopSequence.trim()) {
      addStopSequence(newStopSequence.trim())
      setNewStopSequence("")
    }
  }

  return (
    <div className="space-y-6">

      {/* Section Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Advanced Settings</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={resetAdvancedSettings}
        >
          Reset All
        </Button>
      </div>

      {/* Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-12 gap-y-6">

        {/* LEFT COLUMN */}
        <div className="space-y-6">

          {/* Token Settings */}
          <div className="space-y-3">
            <Label className="text-xs text-muted-foreground uppercase">
              Token Settings
            </Label>

            {/* Max Tokens */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span>Max tokens</span>
                <Input
                  type="text"
                  inputMode="numeric"
                  value={advancedSettings.maxTokens}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '')
                    setMaxTokens(parseInt(val) || 1)
                  }}
                  className="w-20 text-sm"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Always sent (required by API)
              </p>
            </div>

            {/* Thinking Budget */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span>Thinking budget</span>
                <Input
                  type="text"
                  inputMode="numeric"
                  value={advancedSettings.thinkingBudget}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '')
                    setThinkingBudgetValue(parseInt(val) || 1024)
                  }}
                  className="w-20 text-sm"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {thinkingMode
                  ? `Min: 1024, Must be < max tokens`
                  : "Only sent when Thinking mode is ON"
                }
              </p>
              {advancedSettings.thinkingBudget >= advancedSettings.maxTokens && (
                <p className="text-xs text-destructive">
                  ⚠️ Must be less than max tokens
                </p>
              )}
            </div>
          </div>

          {/* Output Processing */}
          <div className="space-y-3">
            <Label className="text-xs text-muted-foreground uppercase">
              Output Processing
            </Label>

            {/* Auto-parse Structured Data */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span>Auto-parse structured data</span>
                <Switch
                  checked={autoParseStructuredData}
                  onCheckedChange={toggleAutoParseStructuredData}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {autoParseStructuredData
                  ? "Automatically detect and visualize JSON/XML in responses"
                  : "Manually trigger parsing with 'Parse to structured data' button"
                }
              </p>
            </div>
          </div>

        </div>

        {/* RIGHT COLUMN */}
        <div className="space-y-6">

          {/* Sampling Settings */}
          <div className="space-y-3">
            <Label className="text-xs text-muted-foreground uppercase">
              Sampling Settings
            </Label>

            {/* Temperature */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span>Override temperature</span>
                <Switch
                  checked={advancedSettings.temperature.enabled}
                  onCheckedChange={toggleTemperature}
                  disabled={thinkingMode}
                />
              </div>
              {advancedSettings.temperature.enabled ? (
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <Slider
                      value={[advancedSettings.temperature.value]}
                      min={0}
                      max={1}
                      step={0.1}
                      onValueChange={([value]) => setTemperatureValue(value)}
                      className="flex-1"
                    />
                    <span className="text-xs w-8">
                      {advancedSettings.temperature.value}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Default: 1.0 → Sending: {advancedSettings.temperature.value}
                  </p>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {thinkingMode
                    ? "Disabled (incompatible with thinking mode)"
                    : "LLM will use its default: 1.0"
                  }
                </p>
              )}
            </div>

            {/* Top P */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span>Override top P</span>
                <Switch
                  checked={advancedSettings.topP.enabled}
                  onCheckedChange={toggleTopP}
                />
              </div>
              {advancedSettings.topP.enabled ? (
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <Slider
                      value={[advancedSettings.topP.value]}
                      min={0}
                      max={1}
                      step={0.01}
                      onValueChange={([value]) => setTopPValue(value)}
                      className="flex-1"
                    />
                    <span className="text-xs w-12">
                      {advancedSettings.topP.value.toFixed(2)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Default: 1.0 → Sending: {advancedSettings.topP.value.toFixed(2)}
                  </p>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  LLM will use its default: 1.0
                </p>
              )}
            </div>

            {/* Top K */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span>Override top K</span>
                <Switch
                  checked={advancedSettings.topK.enabled}
                  onCheckedChange={toggleTopK}
                />
              </div>
              {advancedSettings.topK.enabled ? (
                <div className="space-y-1">
                  <Input
                    type="number"
                    value={advancedSettings.topK.value}
                    onChange={(e) => setTopKValue(parseInt(e.target.value) || 0)}
                    min={0}
                    className="w-20 text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    Sending: {advancedSettings.topK.value}
                  </p>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  LLM will use its default
                </p>
              )}
            </div>
          </div>

          {/* Stop Sequences */}
          <div className="space-y-3">
            <Label className="text-xs text-muted-foreground uppercase">
              Stop Sequences
            </Label>

            <div className="flex items-center justify-between text-sm">
              <span>Use stop sequences</span>
              <Switch
                checked={advancedSettings.stopSequences.enabled}
                onCheckedChange={toggleStopSequences}
              />
            </div>

            {advancedSettings.stopSequences.enabled ? (
              <div className="space-y-3">
                {/* Existing sequences */}
                {advancedSettings.stopSequences.values.length > 0 && (
                  <div className="space-y-2">
                    {advancedSettings.stopSequences.values.map((seq, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <Input
                          value={seq}
                          readOnly
                          className="flex-1 text-sm"
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeStopSequence(index)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add new sequence */}
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Enter stop sequence..."
                    value={newStopSequence}
                    onChange={(e) => setNewStopSequence(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleAddStopSequence()
                      }
                    }}
                    className="flex-1 text-sm"
                    disabled={advancedSettings.stopSequences.values.length >= 4}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleAddStopSequence}
                    disabled={
                      !newStopSequence.trim() ||
                      advancedSettings.stopSequences.values.length >= 4
                    }
                  >
                    + Add
                  </Button>
                </div>

                {advancedSettings.stopSequences.values.length >= 4 && (
                  <p className="text-xs text-muted-foreground">
                    Maximum 4 stop sequences allowed
                  </p>
                )}

                {advancedSettings.stopSequences.values.length > 0 && (
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                      Will send: {JSON.stringify(advancedSettings.stopSequences.values)}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={clearStopSequences}
                    >
                      Clear
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                No custom stop sequences
              </p>
            )}
          </div>

        </div>

      </div>

    </div>
  )
}
