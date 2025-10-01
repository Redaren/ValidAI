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

// Common reusable schemas
export {
  nameSchema,
  descriptionSchema,
  tagsSchema,
  uuidSchema,
  commaSeparatedToArray,
} from './common-schemas'
