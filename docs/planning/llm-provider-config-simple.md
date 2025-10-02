# LLM Provider Configuration - Simple Implementation Plan

VERSION: 1.0 (Simplified)
DATE: 2025-01-02
SCOPE: Configuration Storage Only

## High-Level Architecture Overview

ValidAI will support multiple LLM providers (Anthropic, Mistral, OpenAI, etc.) with a flexible 3-tier configuration hierarchy that allows for progressive customization based on account types:

### Configuration Hierarchy
1. **Global Level (System Default)**
   - Default models available to all users
   - System-provided API keys for free tier users
   - Fallback configuration when no overrides exist

2. **Organization Level (Pro/Enterprise Accounts)**
   - Organizations can configure their own API keys
   - Select which models are available to their users
   - Set organization-wide default model preferences
   - Override global temperature/token settings

3. **Processor Level (Fine-tuned Control)**
   - Individual processors can select specific models from organization's available options
   - Override settings for specialized use cases (e.g., legal docs need lower temperature)
   - Optimize model selection based on task requirements

### How It Works
- **Free Accounts**: Use global defaults with system API keys
- **Pro Accounts**: Can set organization-level API keys and model preferences
- **Enterprise**: Full control including processor-level optimizations

### Example Scenarios
1. **Free User**: Runs processor → Uses global default (Claude Sonnet) with system API key
2. **Pro User**: Organization has Anthropic + Mistral keys → User can select from available models
3. **Specialized Processor**: Legal review processor overrides to use Claude Opus with temperature 0.2 for consistency

### Future Considerations (Out of Scope for Phase 1)
- Role-based access control (who can modify settings)
- Account type restrictions (free vs pro vs enterprise)
- Usage quotas and cost tracking
- Model access permissions per user role
- Audit logging of configuration changes

---

## Phase 1 Implementation (Current Scope)

This document focuses on Phase 1: establishing the basic storage and resolution mechanism for the 3-tier hierarchy. Access control, account restrictions, and advanced features will be added in future phases once role definitions are finalized.

## What You Asked For

Store LLM provider configuration (API keys, model selection) with a 3-tier hierarchy:
- **Global** → **Organization** → **Processor**

## Simple Implementation (No Scope Creep)

### Phase 1: Basic Storage (No Vault)

#### 1.1 Global Settings Table
```sql
CREATE TABLE llm_global_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  model_name text NOT NULL,
  display_name text NOT NULL,
  is_default boolean DEFAULT false,
  is_active boolean DEFAULT true,
  configuration jsonb DEFAULT '{}',  -- temperature, max_tokens, etc.
  created_at timestamptz DEFAULT now()
);

-- Only one default allowed
CREATE UNIQUE INDEX idx_one_default ON llm_global_settings(is_default) WHERE is_default = true;

-- Insert some defaults
INSERT INTO llm_global_settings (provider, model_name, display_name, is_default, configuration) VALUES
  ('anthropic', 'claude-3-5-sonnet-20241022', 'Claude 3.5 Sonnet', true, '{"temperature": 0.7}'),
  ('anthropic', 'claude-3-opus-20240229', 'Claude 3 Opus', false, '{"temperature": 0.5}'),
  ('mistral', 'mistral-large-latest', 'Mistral Large', false, '{"temperature": 0.7}');
```

#### 1.2 Organization Configuration
```sql
-- Add to existing organizations table
ALTER TABLE organizations
ADD COLUMN llm_configuration jsonb DEFAULT NULL;

-- Example data structure:
{
  "api_keys_encrypted": {
    "anthropic": "base64_encrypted_key_here",
    "mistral": "base64_encrypted_key_here"
  },
  "available_models": [
    {
      "id": "sonnet",
      "provider": "anthropic",
      "model": "claude-3-5-sonnet-20241022",
      "display_name": "Fast & Smart"
    },
    {
      "id": "opus",
      "provider": "anthropic",
      "model": "claude-3-opus-20240229",
      "display_name": "Most Capable"
    },
    {
      "id": "mistral",
      "provider": "mistral",
      "model": "mistral-large-latest",
      "display_name": "Cost Effective"
    }
  ],
  "default_model_id": "sonnet"
}
```

#### 1.3 Processor Configuration
```sql
-- Already exists: processors.configuration
-- Will store:
{
  "selected_model_id": "opus",  -- References org's available_models
  "settings_override": {
    "temperature": 0.2  -- Optional overrides
  }
}
```

### Phase 2: Simple Resolution Function

```sql
CREATE OR REPLACE FUNCTION get_llm_config_for_run(
  p_processor_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_org_id uuid;
  v_org_config jsonb;
  v_proc_config jsonb;
  v_selected_model_id text;
  v_selected_model jsonb;
  v_api_key text;
  v_result jsonb;
BEGIN
  -- Get organization from current user context
  v_org_id := auth.jwt() -> 'app_metadata' ->> 'organization_id'::uuid;

  -- Get org configuration
  SELECT llm_configuration INTO v_org_config
  FROM organizations WHERE id = v_org_id;

  -- Get processor configuration if specified
  IF p_processor_id IS NOT NULL THEN
    SELECT configuration INTO v_proc_config
    FROM processors WHERE id = p_processor_id;
  END IF;

  -- Determine which model to use
  IF v_proc_config IS NOT NULL AND v_proc_config ? 'selected_model_id' THEN
    v_selected_model_id := v_proc_config ->> 'selected_model_id';
  ELSIF v_org_config IS NOT NULL AND v_org_config ? 'default_model_id' THEN
    v_selected_model_id := v_org_config ->> 'default_model_id';
  END IF;

  -- If org has configuration, use it
  IF v_org_config IS NOT NULL AND v_selected_model_id IS NOT NULL THEN
    -- Find the selected model in org's available models
    SELECT model FROM (
      SELECT jsonb_array_elements(v_org_config -> 'available_models') AS model
    ) m
    WHERE model ->> 'id' = v_selected_model_id
    INTO v_selected_model;

    -- Get the encrypted API key
    v_api_key := v_org_config -> 'api_keys_encrypted' ->> (v_selected_model ->> 'provider');

    -- Build result
    v_result := jsonb_build_object(
      'provider', v_selected_model ->> 'provider',
      'model', v_selected_model ->> 'model',
      'api_key_encrypted', v_api_key,
      'settings', COALESCE(v_proc_config -> 'settings_override', '{}')
    );

    RETURN v_result;
  END IF;

  -- Fall back to global default (no API key)
  SELECT jsonb_build_object(
    'provider', provider,
    'model', model_name,
    'api_key_encrypted', NULL,  -- System will use its own
    'settings', configuration
  ) INTO v_result
  FROM llm_global_settings
  WHERE is_default = true;

  RETURN v_result;
END;
$$;
```

### Phase 3: Simple Encryption Helpers

```sql
-- Simple encryption function (using pgcrypto)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Encrypt API key
CREATE OR REPLACE FUNCTION encrypt_api_key(
  p_plaintext text,
  p_org_id uuid
) RETURNS text
LANGUAGE plpgsql
AS $$
BEGIN
  -- Simple encryption using org_id as part of key
  -- In production, use a proper key management system
  RETURN encode(
    encrypt(
      p_plaintext::bytea,
      ('validai_' || p_org_id::text)::bytea,
      'aes'
    ),
    'base64'
  );
END;
$$;

-- Decrypt API key (service-role only in your edge function)
CREATE OR REPLACE FUNCTION decrypt_api_key(
  p_ciphertext text,
  p_org_id uuid
) RETURNS text
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN convert_from(
    decrypt(
      decode(p_ciphertext, 'base64'),
      ('validai_' || p_org_id::text)::bytea,
      'aes'
    ),
    'UTF8'
  );
END;
$$;
```

## That's It!

### What This Gives You
1. ✅ Store multiple models at global level
2. ✅ Organizations can add their API keys (encrypted)
3. ✅ Organizations can select which models are available
4. ✅ Processors can override model selection
5. ✅ Simple function to resolve configuration

### What This Doesn't Include (On Purpose)
- ❌ No Edge Functions (you handle LLM calls your way)
- ❌ No usage tracking (add later if needed)
- ❌ No cost calculations (add later if needed)
- ❌ No complex UI (just store/retrieve config)
- ❌ No RLS policies yet (you said roles aren't defined)
- ❌ No Vault (wait until stable)

### Migration Path to Vault (Phase 2 - Future)

When Vault is stable, migration is simple:
```sql
-- Move keys from JSONB to Vault
DO $$
DECLARE
  r RECORD;
  v_secret_id uuid;
BEGIN
  FOR r IN
    SELECT id, llm_configuration -> 'api_keys_encrypted' as keys
    FROM organizations
    WHERE llm_configuration IS NOT NULL
  LOOP
    -- Store each key in vault
    IF r.keys ? 'anthropic' THEN
      SELECT vault.create_secret(
        decrypt_api_key(r.keys ->> 'anthropic', r.id),
        format('org_%s_anthropic', r.id)
      ) INTO v_secret_id;
    END IF;
    -- Repeat for other providers...
  END LOOP;
END $$;
```

## Implementation Steps

1. **Run the migrations** (create table, add column)
2. **Add encryption functions** (or use your existing encryption)
3. **Create resolution function**
4. **When running a processor**: Call `get_llm_config_for_run(processor_id)`
5. **In your code**: Decrypt the API key and make the LLM call

## Total Effort: ~2 hours

No scope creep. Just configuration storage with hierarchical resolution.