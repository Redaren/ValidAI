/**
 * LLM Configuration Hooks
 *
 * TanStack Query hooks for LLM configuration management in the Workbench.
 * Provides access to the multi-tier configuration hierarchy:
 * - Global settings (system-wide defaults)
 * - Organization configuration (custom API keys and models)
 * - Processor configuration (model selection per processor)
 *
 * @module hooks/use-llm-config
 * @see {@link /lib/types/llm-config.types.ts} Configuration type definitions
 * @see {@link /docs/architecture/llm-workbench-architecture.md} Architecture documentation
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '@playze/shared-auth/client';
import type {
  ResolvedLLMConfig,
  LLMModelConfig,
  AvailableModelsResponse,
  SetOrganizationConfigResponse
} from '@/lib/types/llm-config.types';

/**
 * Get available LLM models for the current organization
 *
 * Calls `get_available_llm_models()` database function which returns:
 * - Organization's custom models if configured
 * - Global models as fallback
 *
 * Used by model selector in Workbench to show available choices.
 *
 * @returns TanStack Query result with available models
 * @throws Error if database function fails
 *
 * @example
 * ```typescript
 * function ModelSelector() {
 *   const { data: availableModels, isLoading } = useAvailableLLMModels()
 *
 *   if (isLoading) return <div>Loading models...</div>
 *
 *   return (
 *     <select>
 *       {availableModels?.models.map(model => (
 *         <option key={model.id} value={model.model}>
 *           {model.display_name}
 *         </option>
 *       ))}
 *     </select>
 *   )
 * }
 * ```
 */
export function useAvailableLLMModels() {
  const supabase = createBrowserClient();

  return useQuery({
    queryKey: ['llm-models-available'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_available_llm_models');
      if (error) throw error;
      return data as AvailableModelsResponse;
    },
  });
}

/**
 * Set organization LLM configuration (Pro/Enterprise feature)
 *
 * Calls `set_organization_llm_config()` database function to save:
 * - Custom API keys (encrypted using encrypt_api_key())
 * - Available models for the organization
 * - Default model for new processors
 *
 * Automatically invalidates related queries on success.
 *
 * @returns TanStack Query mutation
 * @throws Error if user lacks permission or encryption fails
 *
 * @example
 * ```typescript
 * function OrganizationSettings() {
 *   const setConfig = useSetOrganizationLLMConfig()
 *
 *   const handleSave = () => {
 *     setConfig.mutate({
 *       api_keys: { anthropic: "sk-ant-..." },
 *       available_models: [
 *         { id: "sonnet", provider: "anthropic", model: "claude-3-5-sonnet-20241022", display_name: "Claude 3.5 Sonnet" }
 *       ],
 *       default_model_id: "sonnet"
 *     })
 *   }
 *
 *   return <button onClick={handleSave}>Save Configuration</button>
 * }
 * ```
 */
export function useSetOrganizationLLMConfig() {
  const queryClient = useQueryClient();
  const supabase = createBrowserClient();

  return useMutation({
    mutationFn: async (config: {
      /** Plain-text API keys (will be encrypted server-side) */
      api_keys: Record<string, string>;
      /** Models to make available to this organization */
      available_models: LLMModelConfig[];
      /** Default model ID for new processors (optional) */
      default_model_id?: string;
    }) => {
      const { data, error } = await supabase.rpc('set_organization_llm_config', {
        p_api_keys: config.api_keys,
        p_available_models: config.available_models,
        p_default_model_id: config.default_model_id,
      });
      if (error) throw error;
      return data as SetOrganizationConfigResponse;
    },
    onSuccess: () => {
      // Invalidate related queries to refetch with new configuration
      queryClient.invalidateQueries({ queryKey: ['llm-models-available'] });
      queryClient.invalidateQueries({ queryKey: ['llm-config-resolved'] });
    },
  });
}

/**
 * Get resolved LLM configuration for a processor
 *
 * Calls `get_llm_config_for_run()` database function which resolves configuration
 * from the hierarchy: Processor → Organization → Global
 *
 * Returns complete configuration needed for LLM API calls including:
 * - Model identifier
 * - Encrypted API key (if organization has custom key)
 * - Default settings (temperature, max_tokens, etc.)
 *
 * @param processorId - Processor UUID (optional, uses organization default if not provided)
 * @returns TanStack Query result with resolved configuration
 * @throws Error if processor not found or user lacks permission
 *
 * @example
 * ```typescript
 * function ProcessorWorkbench({ processorId }: { processorId: string }) {
 *   const { data: config, isLoading } = useResolvedLLMConfig(processorId)
 *
 *   if (isLoading) return <div>Loading configuration...</div>
 *
 *   return (
 *     <div>
 *       <p>Model: {config?.display_name}</p>
 *       <p>Using: {config?.api_key_encrypted ? 'Organization API key' : 'Global API key'}</p>
 *     </div>
 *   )
 * }
 * ```
 */
export function useResolvedLLMConfig(processorId?: string) {
  const supabase = createBrowserClient();

  return useQuery({
    queryKey: ['llm-config-resolved', processorId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_llm_config_for_run', {
        p_processor_id: processorId || null,
      });
      if (error) throw error;
      return data as ResolvedLLMConfig;
    },
    enabled: true, // Always fetch even without processorId (uses org default)
  });
}

/**
 * Get global LLM settings (admin use only)
 *
 * Queries `llm_global_settings` table directly.
 * Returns all active models configured system-wide.
 *
 * Used by admin interfaces to manage global model availability.
 *
 * @returns TanStack Query result with global settings
 * @throws Error if user lacks admin permission
 *
 * @example
 * ```typescript
 * function AdminGlobalSettings() {
 *   const { data: globalSettings, isLoading } = useGlobalLLMSettings()
 *
 *   if (isLoading) return <div>Loading settings...</div>
 *
 *   return (
 *     <table>
 *       {globalSettings?.map(setting => (
 *         <tr key={setting.id}>
 *           <td>{setting.display_name}</td>
 *           <td>{setting.provider}</td>
 *           <td>{setting.is_default ? 'Default' : ''}</td>
 *         </tr>
 *       ))}
 *     </table>
 *   )
 * }
 * ```
 */
export function useGlobalLLMSettings() {
  const supabase = createBrowserClient();

  return useQuery({
    queryKey: ['llm-global-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('llm_global_settings')
        .select('*')
        .eq('is_active', true)
        .order('is_default', { ascending: false })
        .order('display_name');

      if (error) throw error;
      return data;
    },
  });
}