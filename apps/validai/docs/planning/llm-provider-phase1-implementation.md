# LLM Provider Configuration - Phase 1 Implementation Plan

VERSION: 1.0
DATE: 2025-01-02
SCOPE: Basic Configuration Storage and Resolution

## Overview

This document provides the step-by-step implementation plan for Phase 1 of the LLM provider configuration system. This phase establishes the basic storage structure and resolution mechanism without access controls or advanced features.

## Implementation Steps

### Step 1: Create Database Migration for Global Settings Table

**File**: `supabase/migrations/[timestamp]_create_llm_global_settings.sql`

```sql
-- Create the global settings table for LLM models
CREATE TABLE IF NOT EXISTS public.llm_global_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider IN ('anthropic', 'mistral', 'openai', 'google', 'meta')),
  model_name text NOT NULL,
  display_name text NOT NULL,
  is_default boolean DEFAULT false,
  is_active boolean DEFAULT true,
  configuration jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,

  -- Ensure unique provider/model combination
  CONSTRAINT unique_provider_model UNIQUE (provider, model_name)
);

-- Create index for default lookup
CREATE UNIQUE INDEX idx_llm_global_settings_one_default
ON public.llm_global_settings(is_default)
WHERE is_default = true;

-- Create index for active models
CREATE INDEX idx_llm_global_settings_active
ON public.llm_global_settings(is_active)
WHERE is_active = true;

-- Add update trigger for updated_at
CREATE TRIGGER update_llm_global_settings_updated_at
  BEFORE UPDATE ON public.llm_global_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS (but no policies yet - Phase 2)
ALTER TABLE public.llm_global_settings ENABLE ROW LEVEL SECURITY;

-- Grant basic read access
GRANT SELECT ON public.llm_global_settings TO authenticated;
GRANT SELECT ON public.llm_global_settings TO service_role;
```

### Step 2: Add LLM Configuration to Organizations Table

**File**: `supabase/migrations/[timestamp]_add_llm_config_to_organizations.sql`

```sql
-- Add LLM configuration column to organizations
ALTER TABLE public.organizations
ADD COLUMN IF NOT EXISTS llm_configuration jsonb DEFAULT NULL;

-- Create index for organizations with LLM config
CREATE INDEX idx_organizations_has_llm_config
ON public.organizations((llm_configuration IS NOT NULL));

-- Comment for documentation
COMMENT ON COLUMN public.organizations.llm_configuration IS
'LLM provider configuration including encrypted API keys and available models. Structure:
{
  "api_keys_encrypted": { "provider": "encrypted_key" },
  "available_models": [{ "id", "provider", "model", "display_name" }],
  "default_model_id": "model_id"
}';
```

### Step 3: Setup Encryption Functions

**File**: `supabase/migrations/[timestamp]_create_encryption_functions.sql`

```sql
-- Enable pgcrypto extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Function to encrypt API keys
CREATE OR REPLACE FUNCTION public.encrypt_api_key(
  p_plaintext text,
  p_org_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text;
BEGIN
  -- Generate a deterministic key based on org_id and a secret
  -- In production, use environment variable for base secret
  v_key := substring(
    encode(
      digest('validai_secret_' || p_org_id::text, 'sha256'),
      'hex'
    ),
    1, 32
  );

  -- Encrypt using AES
  RETURN encode(
    encrypt(
      p_plaintext::bytea,
      v_key::bytea,
      'aes'
    ),
    'base64'
  );
END;
$$;

-- Function to decrypt API keys (restricted access)
CREATE OR REPLACE FUNCTION public.decrypt_api_key(
  p_ciphertext text,
  p_org_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text;
BEGIN
  -- Generate the same key used for encryption
  v_key := substring(
    encode(
      digest('validai_secret_' || p_org_id::text, 'sha256'),
      'hex'
    ),
    1, 32
  );

  -- Decrypt
  RETURN convert_from(
    decrypt(
      decode(p_ciphertext, 'base64'),
      v_key::bytea,
      'aes'
    ),
    'UTF8'
  );
EXCEPTION
  WHEN OTHERS THEN
    -- Return NULL if decryption fails
    RETURN NULL;
END;
$$;

-- Restrict decrypt function to service role only
REVOKE EXECUTE ON FUNCTION public.decrypt_api_key FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decrypt_api_key TO service_role;

-- Allow authenticated users to encrypt (for saving keys)
GRANT EXECUTE ON FUNCTION public.encrypt_api_key TO authenticated;
```

### Step 4: Create Configuration Resolution Function

**File**: `supabase/migrations/[timestamp]_create_llm_config_resolution.sql`

```sql
-- Function to resolve LLM configuration with 3-tier hierarchy
CREATE OR REPLACE FUNCTION public.get_llm_config_for_run(
  p_processor_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_org_config jsonb;
  v_proc_config jsonb;
  v_selected_model_id text;
  v_selected_model jsonb;
  v_api_key_encrypted text;
  v_result jsonb;
  v_default_settings jsonb;
BEGIN
  -- Get current organization from JWT
  v_org_id := (auth.jwt() -> 'app_metadata' ->> 'organization_id')::uuid;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'No organization context found';
  END IF;

  -- Get organization configuration
  SELECT llm_configuration
  INTO v_org_config
  FROM public.organizations
  WHERE id = v_org_id;

  -- Get processor configuration if provided
  IF p_processor_id IS NOT NULL THEN
    SELECT p.configuration
    INTO v_proc_config
    FROM public.processors p
    WHERE p.id = p_processor_id
      AND p.organization_id = v_org_id;
  END IF;

  -- Determine which model to use (processor override > org default)
  IF v_proc_config IS NOT NULL AND v_proc_config ? 'selected_model_id' THEN
    v_selected_model_id := v_proc_config ->> 'selected_model_id';
  ELSIF v_org_config IS NOT NULL AND v_org_config ? 'default_model_id' THEN
    v_selected_model_id := v_org_config ->> 'default_model_id';
  END IF;

  -- Try to use organization configuration
  IF v_org_config IS NOT NULL AND v_selected_model_id IS NOT NULL THEN
    -- Find the selected model in organization's available models
    SELECT jsonb_array_elements(v_org_config -> 'available_models') AS model
    INTO v_selected_model
    FROM (
      SELECT jsonb_array_elements(v_org_config -> 'available_models') AS model
    ) m
    WHERE model ->> 'id' = v_selected_model_id
    LIMIT 1;

    IF v_selected_model IS NOT NULL THEN
      -- Get encrypted API key for the provider
      v_api_key_encrypted := v_org_config -> 'api_keys_encrypted' ->> (v_selected_model ->> 'provider');

      -- Get default settings from global config if available
      SELECT configuration
      INTO v_default_settings
      FROM public.llm_global_settings
      WHERE provider = (v_selected_model ->> 'provider')
        AND model_name = (v_selected_model ->> 'model')
        AND is_active = true;

      -- Build result with organization config
      v_result := jsonb_build_object(
        'provider', v_selected_model ->> 'provider',
        'model', v_selected_model ->> 'model',
        'display_name', v_selected_model ->> 'display_name',
        'api_key_encrypted', v_api_key_encrypted,
        'organization_id', v_org_id,
        'settings', COALESCE(
          v_proc_config -> 'settings_override',
          v_default_settings,
          '{}'::jsonb
        )
      );

      RETURN v_result;
    END IF;
  END IF;

  -- Fall back to global default (no API key)
  SELECT jsonb_build_object(
    'provider', provider,
    'model', model_name,
    'display_name', display_name,
    'api_key_encrypted', NULL,
    'organization_id', v_org_id,
    'settings', configuration
  ) INTO v_result
  FROM public.llm_global_settings
  WHERE is_default = true
    AND is_active = true
  LIMIT 1;

  -- If no default found, return error config
  IF v_result IS NULL THEN
    RETURN jsonb_build_object(
      'error', 'No LLM configuration available',
      'organization_id', v_org_id
    );
  END IF;

  RETURN v_result;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.get_llm_config_for_run TO authenticated;
```

### Step 5: Create Helper Functions for Managing Configuration

**File**: `supabase/migrations/[timestamp]_create_llm_config_helpers.sql`

```sql
-- Helper function to set organization LLM configuration
CREATE OR REPLACE FUNCTION public.set_organization_llm_config(
  p_api_keys jsonb,  -- {"anthropic": "sk-...", "mistral": "ml-..."}
  p_available_models jsonb,  -- Array of model objects
  p_default_model_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_encrypted_keys jsonb = '{}'::jsonb;
  v_key text;
  v_value text;
BEGIN
  -- Get current organization
  v_org_id := (auth.jwt() -> 'app_metadata' ->> 'organization_id')::uuid;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'No organization context found';
  END IF;

  -- Encrypt each API key
  FOR v_key, v_value IN SELECT * FROM jsonb_each_text(p_api_keys)
  LOOP
    v_encrypted_keys := v_encrypted_keys ||
      jsonb_build_object(v_key, public.encrypt_api_key(v_value, v_org_id));
  END LOOP;

  -- Update organization configuration
  UPDATE public.organizations
  SET
    llm_configuration = jsonb_build_object(
      'api_keys_encrypted', v_encrypted_keys,
      'available_models', p_available_models,
      'default_model_id', p_default_model_id
    ),
    updated_at = now()
  WHERE id = v_org_id;

  -- Return success
  RETURN jsonb_build_object(
    'success', true,
    'organization_id', v_org_id,
    'models_configured', jsonb_array_length(p_available_models)
  );
END;
$$;

-- Helper function to list available models for an organization
CREATE OR REPLACE FUNCTION public.get_available_llm_models()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_org_config jsonb;
  v_global_models jsonb;
  v_result jsonb;
BEGIN
  -- Get current organization
  v_org_id := (auth.jwt() -> 'app_metadata' ->> 'organization_id')::uuid;

  -- Get organization configuration
  SELECT llm_configuration
  INTO v_org_config
  FROM public.organizations
  WHERE id = v_org_id;

  -- If org has configured models, return them
  IF v_org_config IS NOT NULL AND v_org_config ? 'available_models' THEN
    RETURN jsonb_build_object(
      'source', 'organization',
      'models', v_org_config -> 'available_models',
      'default_model_id', v_org_config ->> 'default_model_id'
    );
  END IF;

  -- Otherwise return global models
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', model_name,
      'provider', provider,
      'model', model_name,
      'display_name', display_name,
      'is_default', is_default
    )
    ORDER BY is_default DESC, display_name
  ) INTO v_global_models
  FROM public.llm_global_settings
  WHERE is_active = true;

  RETURN jsonb_build_object(
    'source', 'global',
    'models', COALESCE(v_global_models, '[]'::jsonb),
    'default_model_id', NULL
  );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.set_organization_llm_config TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_available_llm_models TO authenticated;
```

### Step 6: Generate TypeScript Types

After running migrations, generate updated types:

```bash
cd validai-app
npx supabase gen types typescript --project-id xczippkxxdqlvaacjexj > lib/database.types.ts
```

### Step 7: Create TypeScript Interfaces

**File**: `validai-app/lib/types/llm-config.types.ts`

```typescript
// LLM Configuration Types
export interface LLMGlobalSetting {
  id: string;
  provider: 'anthropic' | 'mistral' | 'openai' | 'google' | 'meta';
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
```

### Step 8: Create React Hooks for LLM Configuration

**File**: `validai-app/hooks/use-llm-config.ts`

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { ResolvedLLMConfig, LLMModelConfig } from '@/lib/types/llm-config.types';

export function useAvailableLLMModels() {
  const supabase = createClient();

  return useQuery({
    queryKey: ['llm-models-available'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_available_llm_models');
      if (error) throw error;
      return data as {
        source: 'organization' | 'global';
        models: LLMModelConfig[];
        default_model_id?: string;
      };
    },
  });
}

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
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['llm-models-available'] });
    },
  });
}

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
```

## Testing Checklist

### Database Tests
- [ ] Global settings table created successfully
- [ ] Organization column added
- [ ] Encryption functions work correctly
- [ ] Resolution function returns correct hierarchy
- [ ] Helper functions execute without errors

### Integration Tests
- [ ] Can encrypt and decrypt API keys
- [ ] Resolution works with no configuration (returns global default)
- [ ] Resolution works with organization configuration
- [ ] Resolution works with processor override
- [ ] Settings merge correctly at each level

### Security Tests
- [ ] Decrypt function restricted to service_role
- [ ] Encrypted keys are not readable in plain text
- [ ] Organization isolation works correctly

## Deployment Steps

1. **Development Environment**
   ```bash
   cd validai-app
   npx supabase migration up
   npx supabase gen types typescript --project-id xczippkxxdqlvaacjexj > lib/database.types.ts
   ```

2. **Staging Environment**
   - Review all migrations
   - Test with sample data (no initial values)
   - Verify encryption/decryption

3. **Production Environment**
   - Apply migrations during maintenance window
   - Monitor for errors
   - Test with limited users first

## Rollback Plan

If issues occur, rollback migrations:

```sql
-- Rollback order (reverse of creation)
DROP FUNCTION IF EXISTS public.get_available_llm_models();
DROP FUNCTION IF EXISTS public.set_organization_llm_config();
DROP FUNCTION IF EXISTS public.get_llm_config_for_run();
DROP FUNCTION IF EXISTS public.decrypt_api_key();
DROP FUNCTION IF EXISTS public.encrypt_api_key();
ALTER TABLE public.organizations DROP COLUMN IF EXISTS llm_configuration;
DROP TABLE IF EXISTS public.llm_global_settings;
```

## Success Criteria

- [ ] All migrations applied successfully
- [ ] No errors in database functions
- [ ] Configuration resolution working correctly
- [ ] API keys encrypted and not visible in database
- [ ] TypeScript types generated and working
- [ ] React hooks fetching data correctly

## Notes

- No initial data is inserted (as requested)
- No RLS policies enforced yet (Phase 2)
- No Vault integration (waiting for stable release)
- No Edge Functions required for Phase 1
- Simple encryption using pgcrypto (upgrade to Vault later)