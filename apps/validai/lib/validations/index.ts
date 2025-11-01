/**
 * Central export point for all validation schemas
 * Import from here in your components:
 * import { createProcessorSchema, nameSchema } from '@/lib/validations'
 */

// Processor schemas
export {
  createProcessorSchema,
  updateProcessorSchema,
  updateProcessorSettingsSchema,
  processorNameSchema,
  type CreateProcessorInput,
  type UpdateProcessorInput,
  type UpdateProcessorSettingsInput,
} from './processor-schemas'

// Area schemas
export {
  areaNameSchema,
  createAreaSchema,
  renameAreaSchema,
} from './area-schemas'

// Operation schemas
export {
  createGenericOperationSchema,
  createOperationSchema,
  updateGenericOperationSchema,
  updateOperationSchema,
  operationNameSchema,
  operationDescriptionSchema,
  operationPromptSchema,
  type CreateGenericOperationInput,
  type CreateOperationInput,
  type UpdateGenericOperationInput,
  type UpdateOperationInput,
  type CreateOperationPayload,
} from './operation-schemas'

// Common reusable schemas
export {
  nameSchema,
  descriptionSchema,
  tagsSchema,
  uuidSchema,
  commaSeparatedToArray,
} from './common-schemas'

// Workbench schemas
export {
  thinkingConfigSchema,
  conversationMessageSchema,
  workbenchSettingsSchema,
  workbenchTestSchema,
  workbenchTestResponseSchema,
  workbenchExecutionSchema,
  type ThinkingConfig,
  type ConversationMessage,
  type WorkbenchSettings,
  type WorkbenchTestInput,
  type WorkbenchTestResponse,
  type WorkbenchExecution,
} from './workbench-schemas'

// Bulk operation schemas
export {
  operationTypeEnum,
  bulkOperationRowSchema,
  bulkImportSchema,
  normalizeOperationType,
  type BulkOperationRow,
  type BulkImportPayload,
  type RowValidationResult,
  type BulkValidationResult,
} from './bulk-operation-schemas'
