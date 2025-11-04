'use client'

import { useState } from 'react'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Textarea,
  Label,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Checkbox,
} from '@playze/shared-ui'
import { Copy, Upload, AlertCircle, CheckCircle2, Info } from 'lucide-react'
import { ProcessorDetail } from '@/app/queries/processors/use-processor-detail'
import { useTranslations } from 'next-intl'
import {
  exportOperationsToTSV,
  parseTSVToOperations,
  detectChanges,
  copyToClipboard,
  type ChangeDetectionResult,
} from '@/lib/utils/bulk-operations-utils'
import type { BulkValidationResult } from '@/lib/validations'
import { useBulkImportOperations, type OperationToImport } from '@/app/queries/operations/use-bulk-operations'

type WizardStep = 'export' | 'paste' | 'validate' | 'preview'

interface BulkImportExportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  processor: ProcessorDetail
}

/**
 * Bulk Import/Export Dialog Component
 *
 * Three-step wizard for bulk editing operations via TSV (Excel):
 * 1. Export/Paste: Copy operations to clipboard or paste imported data
 * 2. Validate: Parse and validate TSV data
 * 3. Preview: Show changes and confirm import
 *
 * Features:
 * - Export operations to TSV format for Excel editing
 * - Parse and validate imported TSV data
 * - Detect new vs updated operations
 * - Preview changes before import
 * - Per-operation "update vs create" mode selection
 * - Batch import with progress feedback
 */
export function BulkImportExportDialog({
  open,
  onOpenChange,
  processor,
}: BulkImportExportDialogProps) {
  const t = useTranslations('processors.bulkImport')
  const bulkImport = useBulkImportOperations()

  // Wizard state
  const [currentStep, setCurrentStep] = useState<WizardStep>('export')
  const [pastedContent, setPastedContent] = useState('')
  const [validationResult, setValidationResult] = useState<BulkValidationResult | null>(null)
  const [changeDetection, setChangeDetection] = useState<ChangeDetectionResult | null>(null)
  const [importModes, setImportModes] = useState<Map<string, 'create' | 'update'>>(new Map())

  // Get area display order
  const areaDisplayOrder = processor.area_configuration?.areas?.map(a => a.name) || []

  // Reset state when dialog closes
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setCurrentStep('export')
      setPastedContent('')
      setValidationResult(null)
      setChangeDetection(null)
      setImportModes(new Map())
    }
    onOpenChange(newOpen)
  }

  // Step 1: Export operations to clipboard
  const handleExport = async () => {
    console.log('[handleExport] Starting export...')
    console.log('[handleExport] Operations count:', processor.operations?.length ?? 0)
    console.log('[handleExport] Area display order:', areaDisplayOrder)

    try {
      const tsv = exportOperationsToTSV(processor.operations ?? [], areaDisplayOrder)
      console.log('[handleExport] TSV generated, length:', tsv.length)
      console.log('[handleExport] TSV preview (first 200 chars):', tsv.substring(0, 200))

      await copyToClipboard(tsv)

      console.log(`✓ Copied ${processor.operations?.length ?? 0} operations to clipboard`)
      // Note: Could add a success indicator in the UI here if needed
    } catch (error) {
      console.error('[handleExport] Failed to copy:', error)
      console.error('[handleExport] Error details:', error instanceof Error ? error.message : 'Unknown error')
      alert('Failed to copy operations to clipboard: ' + (error instanceof Error ? error.message : 'Unknown error'))
    }
  }

  // Step 2: Parse and validate pasted content
  const handleParse = () => {
    const result = parseTSVToOperations(pastedContent)
    setValidationResult(result)

    if (result.allValid) {
      // Detect changes
      const changes = detectChanges(
        result.rows.map(r => r.operation!),
        processor.operations ?? [],
        areaDisplayOrder
      )
      setChangeDetection(changes)

      // Initialize import modes (default to 'update' for existing, 'create' for new)
      const modes = new Map<string, 'create' | 'update'>()
      changes.updatedOperations.forEach(({ imported }) => {
        modes.set(imported.name, 'update')
      })
      changes.newOperations.forEach(op => {
        modes.set(op.name, 'create')
      })
      setImportModes(modes)

      setCurrentStep('preview')
    } else {
      setCurrentStep('validate')
    }
  }

  // Step 3: Execute import
  const handleImport = async () => {
    if (!validationResult || !changeDetection) return

    const operationsToImport: OperationToImport[] = validationResult.rows
      .filter(r => r.valid)
      .map(r => ({
        operation: r.operation!,
        mode: importModes.get(r.operation!.name) || 'create',
      }))

    try {
      const result = await bulkImport.mutateAsync({
        processorId: processor.processor_id,
        operations: operationsToImport,
        newAreas: changeDetection.newAreas,
      })

      console.log(`✓ Import completed: Created ${result.operationsCreated} operations, updated ${result.operationsUpdated} operations`)
      handleOpenChange(false)
    } catch (error) {
      console.error('Import failed:', error)
      alert(error instanceof Error ? error.message : 'Failed to import operations')
    }
  }

  // Toggle import mode for a specific operation
  const toggleImportMode = (operationName: string) => {
    const current = importModes.get(operationName) || 'create'
    const newMode = current === 'create' ? 'update' : 'create'
    setImportModes(new Map(importModes).set(operationName, newMode))
  }

  // Toggle all import modes
  const toggleAllModes = (mode: 'create' | 'update') => {
    const newModes = new Map(importModes)
    importModes.forEach((_, name) => {
      newModes.set(name, mode)
    })
    setImportModes(newModes)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        {/* Step 1: Export / Paste */}
        {currentStep === 'export' && (
          <>
            <DialogHeader>
              <DialogTitle>Bulk Import/Export</DialogTitle>
              <DialogDescription>
                Copy all operations to clipboard for editing in Excel, or paste edited operations to import.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6 py-4">
              {/* Export Section */}
              <div className="space-y-3">
                <h3 className="text-sm font-medium">Export Operations</h3>
                <p className="text-sm text-muted-foreground">
                  Copy all {processor.operations?.length ?? 0} operations to clipboard in TSV format.
                  Paste into Excel or Google Sheets to edit.
                </p>
                <Button onClick={handleExport} variant="outline" className="w-full">
                  <Copy className="mr-2 h-4 w-4" />
                  Copy to Clipboard
                </Button>
              </div>

              {/* Import Section */}
              <div className="space-y-3">
                <h3 className="text-sm font-medium">Import Operations</h3>
                <p className="text-sm text-muted-foreground">
                  After editing in Excel, copy the data and paste it here to import.
                </p>
                <div className="space-y-2">
                  <Label htmlFor="paste-content">Paste TSV data</Label>
                  <Textarea
                    id="paste-content"
                    value={pastedContent}
                    onChange={(e) => setPastedContent(e.target.value)}
                    placeholder="Paste TSV data from Excel here..."
                    className="font-mono text-sm min-h-[200px]"
                  />
                </div>
                <div className="rounded-md bg-muted p-3 text-sm">
                  <div className="flex items-start gap-2">
                    <Info className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                    <div className="space-y-1">
                      <p className="font-medium">Format Requirements:</p>
                      <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
                        <li>First row must be headers: area, name, operation_type, prompt, description</li>
                        <li>Valid operation types: extraction, validation, rating, classification, analysis, generic, traffic_light</li>
                        <li>Tab-separated values (TSV format)</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleParse}
                disabled={!pastedContent.trim()}
              >
                <Upload className="mr-2 h-4 w-4" />
                Next: Validate
              </Button>
            </DialogFooter>
          </>
        )}

        {/* Step 2: Validation Errors */}
        {currentStep === 'validate' && validationResult && (
          <>
            <DialogHeader>
              <DialogTitle>Validation Errors</DialogTitle>
              <DialogDescription>
                Please fix the following errors and try again.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="flex items-center gap-2 text-sm">
                <AlertCircle className="h-5 w-5 text-destructive" />
                <span>
                  {validationResult.invalidRows} of {validationResult.totalRows} rows have errors
                </span>
              </div>

              <div className="border rounded-md max-h-[400px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-20">{t('row')}</TableHead>
                      <TableHead>{t('errors')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {validationResult.rows
                      .filter(r => !r.valid)
                      .map(row => (
                        <TableRow key={row.rowNumber}>
                          <TableCell className="font-medium">{row.rowNumber}</TableCell>
                          <TableCell>
                            <ul className="list-disc list-inside text-sm text-destructive">
                              {row.errors?.map((error, idx) => (
                                <li key={idx}>{error}</li>
                              ))}
                            </ul>
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setCurrentStep('export')}>
                Back
              </Button>
              <Button onClick={handleParse}>
                Re-validate
              </Button>
            </DialogFooter>
          </>
        )}

        {/* Step 3: Preview & Confirm */}
        {currentStep === 'preview' && validationResult && changeDetection && (
          <>
            <DialogHeader>
              <DialogTitle>Preview Import</DialogTitle>
              <DialogDescription>
                Review the changes that will be made to your processor.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Impact Summary */}
              <div className="rounded-md bg-muted p-4 space-y-2">
                <h3 className="font-medium text-sm">Import Summary:</h3>
                <ul className="text-sm space-y-1 text-muted-foreground">
                  {changeDetection.newAreas.length > 0 && (
                    <li>
                      {changeDetection.newAreas.length} new area(s) will be created: {changeDetection.newAreas.join(', ')}
                    </li>
                  )}
                  <li>
                    {changeDetection.newOperations.length} new operation(s) will be created
                  </li>
                  <li>
                    {changeDetection.updatedOperations.length} existing operation(s) available for update
                  </li>
                  <li className="font-medium text-foreground">
                    Total: {validationResult.validRows} operation(s)
                  </li>
                </ul>
              </div>

              {/* Mode Toggle Controls */}
              {changeDetection.updatedOperations.length > 0 && (
                <div className="flex gap-2 text-sm">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleAllModes('update')}
                  >
                    Update All Existing
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleAllModes('create')}
                  >
                    Create All as New
                  </Button>
                </div>
              )}

              {/* Operations Preview Table */}
              <div className="border rounded-md max-h-[400px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-32">{t('mode')}</TableHead>
                      <TableHead className="w-32">{t('area')}</TableHead>
                      <TableHead>{t('name')}</TableHead>
                      <TableHead className="w-32">{t('type')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {validationResult.rows
                      .filter(r => r.valid)
                      .map(row => {
                        const op = row.operation!
                        const mode = importModes.get(op.name) || 'create'
                        const isNew = changeDetection.newOperations.some(
                          newOp => newOp.name === op.name
                        )

                        return (
                          <TableRow
                            key={`${op.area}-${op.name}`}
                            className={
                              mode === 'create'
                                ? 'bg-green-50 dark:bg-green-950/20'
                                : 'bg-blue-50 dark:bg-blue-950/20'
                            }
                          >
                            <TableCell>
                              {!isNew && (
                                <div className="flex items-center gap-2">
                                  <Checkbox
                                    checked={mode === 'update'}
                                    onCheckedChange={() => toggleImportMode(op.name)}
                                  />
                                  <span className="text-xs">
                                    {mode === 'update' ? 'Update' : 'Create New'}
                                  </span>
                                </div>
                              )}
                              {isNew && (
                                <span className="text-xs text-muted-foreground">{t('new')}</span>
                              )}
                            </TableCell>
                            <TableCell className="text-sm">{op.area}</TableCell>
                            <TableCell className="text-sm font-medium">{op.name}</TableCell>
                            <TableCell className="text-xs">{op.operation_type}</TableCell>
                          </TableRow>
                        )
                      })}
                  </TableBody>
                </Table>
              </div>

              {/* Legend */}
              <div className="flex gap-4 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-green-50 dark:bg-green-950/20 border rounded" />
                  <span>New operation</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-blue-50 dark:bg-blue-950/20 border rounded" />
                  <span>Updated operation</span>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setCurrentStep('export')}>
                Cancel
              </Button>
              <Button
                onClick={handleImport}
                disabled={bulkImport.isPending}
              >
                <CheckCircle2 className="mr-2 h-4 w-4" />
                {bulkImport.isPending ? 'Importing...' : 'Confirm Import'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
