import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type {
  ResolvedLLMConfig,
  LLMModelConfig,
  AvailableModelsResponse,
  SetOrganizationConfigResponse
} from '@/lib/types/llm-config.types';

/**
 * Hook to get available LLM models for the current organization
 */
export function useAvailableLLMModels() {
  const supabase = createClient();

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
 * Hook to set organization LLM configuration
 */
export function useSetOrganizationLLMConfig() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async (config: {
      api_keys: Record<string, string>;
      available_models: LLMModelConfig[];
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
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ['llm-models-available'] });
      queryClient.invalidateQueries({ queryKey: ['llm-config-resolved'] });
    },
  });
}

/**
 * Hook to get resolved LLM configuration for a processor
 */
export function useResolvedLLMConfig(processorId?: string) {
  const supabase = createClient();

  return useQuery({
    queryKey: ['llm-config-resolved', processorId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_llm_config_for_run', {
        p_processor_id: processorId || null,
      });
      if (error) throw error;
      return data as ResolvedLLMConfig;
    },
    enabled: true, // Always fetch even without processorId
  });
}

/**
 * Hook to get global LLM settings (admin use)
 */
export function useGlobalLLMSettings() {
  const supabase = createClient();

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