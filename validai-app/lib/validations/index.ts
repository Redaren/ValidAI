/**
 * Central export point for all validation schemas
 * Import from here in your components:
 * import { createProcessorSchema, nameSchema } from '@/lib/validations'
 */

// Processor schemas
export {
  createProcessorSchema,
  updateProcessorSchema,
  processorNameSchema,
  type CreateProcessorInput,
  type UpdateProcessorInput,
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
