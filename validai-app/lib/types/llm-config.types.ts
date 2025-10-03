/**
 * LLM Configuration Types
 *
 * Type definitions for the LLM Workbench multi-tier configuration system.
 * Supports the hierarchy: Global Settings → Organization Config → Processor Config → Workbench State
 *
 * @see {@link https://docs.claude.com/en/api/messages} Anthropic API Documentation
 * @see {@link /docs/architecture/llm-workbench-architecture.md} Workbench Architecture
 */

/**
 * Supported LLM providers in the system
 *
 * @property provider - The LLM provider identifier
 */
export interface LLMProvider {
  /** Provider identifier (anthropic, mistral, openai, google, meta) */
  provider: 'anthropic' | 'mistral' | 'openai' | 'google' | 'meta';
}

/**
 * Global LLM setting (system-wide model configuration)
 *
 * Stored in `llm_global_settings` table. Defines available models for all organizations.
 * Admins configure these settings to control which models are available system-wide.
 *
 * @example
 * ```typescript
 * const sonnetSetting: LLMGlobalSetting = {
 *   id: "uuid",
 *   provider: "anthropic",
 *   model_name: "claude-3-5-sonnet-20241022",
 *   display_name: "Claude 3.5 Sonnet",
 *   is_default: true,
 *   is_active: true,
 *   configuration: { default_temperature: 1.0, default_max_tokens: 4096 },
 *   created_at: "2025-01-01T00:00:00Z",
 *   updated_at: "2025-01-01T00:00:00Z"
 * }
 * ```
 */
export interface LLMGlobalSetting {
  /** Unique identifier for this global setting */
  id: string;
  /** LLM provider (anthropic, mistral, openai, etc.) */
  provider: LLMProvider['provider'];
  /** Model identifier (e.g., "claude-3-5-sonnet-20241022") */
  model_name: string;
  /** Human-readable model name for UI display */
  display_name: string;
  /** Whether this is the default model for new organizations */
  is_default: boolean;
  /** Whether this model is currently available for use */
  is_active: boolean;
  /** Default settings (temperature, max_tokens, etc.) */
  configuration: Record<string, any>;
  /** Timestamp when this setting was created */
  created_at: string;
  /** Timestamp when this setting was last updated */
  updated_at: string;
}

/**
 * Model configuration for organization or processor
 *
 * Represents a specific model choice with display metadata.
 * Used in organization's `available_models` array and processor selection.
 *
 * @example
 * ```typescript
 * const model: LLMModelConfig = {
 *   id: "sonnet",
 *   provider: "anthropic",
 *   model: "claude-3-5-sonnet-20241022",
 *   display_name: "Claude 3.5 Sonnet"
 * }
 * ```
 */
export interface LLMModelConfig {
  /** Short identifier for this model (e.g., "sonnet", "haiku") */
  id: string;
  /** Provider name (anthropic, mistral, etc.) */
  provider: string;
  /** Full model identifier for API calls */
  model: string;
  /** Human-readable name for UI display */
  display_name: string;
}

/**
 * Organization-level LLM configuration
 *
 * Stored in `organizations.llm_configuration` JSONB column.
 * Contains encrypted API keys and model selection for the organization.
 *
 * @property api_keys_encrypted - Encrypted API keys per provider (use encrypt_api_key() function)
 * @property available_models - Models available to this organization
 * @property default_model_id - Default model ID for new processors
 *
 * @example
 * ```typescript
 * const orgConfig: OrganizationLLMConfig = {
 *   api_keys_encrypted: {
 *     anthropic: "encrypted_base64_string",
 *     mistral: "encrypted_base64_string"
 *   },
 *   available_models: [
 *     { id: "sonnet", provider: "anthropic", model: "claude-3-5-sonnet-20241022", display_name: "Claude 3.5 Sonnet" },
 *     { id: "haiku", provider: "anthropic", model: "claude-3-5-haiku-20241022", display_name: "Claude 3.5 Haiku" }
 *   ],
 *   default_model_id: "sonnet"
 * }
 * ```
 */
export interface OrganizationLLMConfig {
  /** Encrypted API keys by provider (encrypted using encrypt_api_key() with org_id) */
  api_keys_encrypted: Record<string, string>;
  /** Models available to this organization (subset of global settings or custom) */
  available_models: LLMModelConfig[];
  /** Default model ID for new processors in this organization */
  default_model_id?: string;
}

/**
 * Processor-level LLM configuration
 *
 * Stored in `processors.configuration` JSONB column.
 * Specifies which model a processor should use and optional setting overrides.
 *
 * @property selected_model_id - Model ID from organization's available_models
 * @property settings_override - Override default settings (temperature, max_tokens, etc.)
 *
 * @example
 * ```typescript
 * const processorConfig: ProcessorLLMConfig = {
 *   selected_model_id: "opus",
 *   settings_override: {
 *     temperature: 0.2,
 *     max_tokens: 8192
 *   }
 * }
 * ```
 */
export interface ProcessorLLMConfig {
  /** Selected model ID (must exist in organization's available_models) */
  selected_model_id?: string;
  /** Override default model settings */
  settings_override?: Record<string, any>;
}

/**
 * Resolved LLM configuration for execution
 *
 * Result of `get_llm_config_for_run()` database function.
 * Contains the complete resolved configuration for making an LLM API call.
 *
 * Resolution order: Processor → Organization → Global
 *
 * @property provider - Resolved provider name
 * @property model - Resolved model identifier for API
 * @property display_name - Human-readable model name
 * @property api_key_encrypted - Encrypted API key (if organization has custom key)
 * @property organization_id - Organization context
 * @property settings - Merged settings from all levels
 * @property error - Error message if resolution failed
 *
 * @example
 * ```typescript
 * const config: ResolvedLLMConfig = {
 *   provider: "anthropic",
 *   model: "claude-3-5-sonnet-20241022",
 *   display_name: "Claude 3.5 Sonnet",
 *   api_key_encrypted: "encrypted_key" // or null if using global key,
 *   organization_id: "org-uuid",
 *   settings: { default_temperature: 1.0, default_max_tokens: 4096 }
 * }
 * ```
 */
export interface ResolvedLLMConfig {
  /** Resolved provider name */
  provider: string;
  /** Resolved model identifier */
  model: string;
  /** Human-readable model name */
  display_name?: string;
  /** Encrypted organization API key (null if using global key) */
  api_key_encrypted?: string | null;
  /** Organization ID for context */
  organization_id: string;
  /** Merged default settings from global/org/processor configs */
  settings: Record<string, any>;
  /** Error message if configuration resolution failed */
  error?: string;
}

/**
 * Available models response from get_available_llm_models()
 *
 * Returns models available to the current organization.
 * Source indicates whether models come from organization config or global fallback.
 *
 * @property source - Where models are defined (organization config or global settings)
 * @property models - List of available models
 * @property default_model_id - Default model for this organization
 *
 * @example
 * ```typescript
 * const response: AvailableModelsResponse = {
 *   source: "organization",
 *   models: [
 *     { id: "sonnet", provider: "anthropic", model: "claude-3-5-sonnet-20241022", display_name: "Claude 3.5 Sonnet" }
 *   ],
 *   default_model_id: "sonnet"
 * }
 * ```
 */
export interface AvailableModelsResponse {
  /** Source of models (organization custom or global fallback) */
  source: 'organization' | 'global';
  /** Available models for this organization */
  models: LLMModelConfig[];
  /** Default model ID (null if none specified) */
  default_model_id?: string | null;
}

/**
 * Response from set_organization_llm_config()
 *
 * Confirms successful update of organization LLM configuration.
 *
 * @property success - Whether the configuration was successfully saved
 * @property organization_id - Organization that was updated
 * @property models_configured - Number of models configured
 *
 * @example
 * ```typescript
 * const response: SetOrganizationConfigResponse = {
 *   success: true,
 *   organization_id: "org-uuid",
 *   models_configured: 2
 * }
 * ```
 */
export interface SetOrganizationConfigResponse {
  /** Whether configuration was successfully saved */
  success: boolean;
  /** Organization ID that was updated */
  organization_id: string;
  /** Number of models configured */
  models_configured: number;
}