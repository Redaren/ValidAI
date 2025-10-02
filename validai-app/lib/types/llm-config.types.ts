// LLM Configuration Types
export interface LLMProvider {
  provider: 'anthropic' | 'mistral' | 'openai' | 'google' | 'meta';
}

export interface LLMGlobalSetting {
  id: string;
  provider: LLMProvider['provider'];
  model_name: string;
  display_name: string;
  is_default: boolean;
  is_active: boolean;
  configuration: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface LLMModelConfig {
  id: string;
  provider: string;
  model: string;
  display_name: string;
}

export interface OrganizationLLMConfig {
  api_keys_encrypted: Record<string, string>;
  available_models: LLMModelConfig[];
  default_model_id?: string;
}

export interface ProcessorLLMConfig {
  selected_model_id?: string;
  settings_override?: Record<string, any>;
}

export interface ResolvedLLMConfig {
  provider: string;
  model: string;
  display_name?: string;
  api_key_encrypted?: string | null;
  organization_id: string;
  settings: Record<string, any>;
  error?: string;
}

export interface AvailableModelsResponse {
  source: 'organization' | 'global';
  models: LLMModelConfig[];
  default_model_id?: string | null;
}

export interface SetOrganizationConfigResponse {
  success: boolean;
  organization_id: string;
  models_configured: number;
}