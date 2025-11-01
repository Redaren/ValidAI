# LLM Provider Configuration Implementation Plan

VERSION: 1.0
DATE: 2025-01-02
STATUS: Draft

## Executive Summary

This document outlines the implementation plan for a hierarchical LLM provider configuration system in ValidAI. The system will support multiple LLM providers (Anthropic, Mistral, OpenAI, etc.) with a three-tier configuration hierarchy: Global → Organization → Processor.

## Architecture Overview

### Configuration Hierarchy
1. **Global Level**: System-wide defaults for all users
2. **Organization Level**: Organization-specific settings (Pro/Enterprise accounts)
3. **Processor Level**: Processor-specific overrides for specialized use cases

### Key Design Decisions
- Store API keys in Supabase Vault (already enabled)
- Use JSONB for flexible provider configuration
- Edge Functions handle all LLM API calls
- Client never receives API keys

## Implementation Phases

### Phase 1: Database Schema (Week 1)

#### 1.1 Create Global Settings Table
```sql
CREATE TABLE llm_global_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider IN ('anthropic', 'mistral', 'openai', 'google', 'meta')),
  model_name text NOT NULL,
  display_name text NOT NULL,
  model_category text CHECK (model_category IN ('fast', 'balanced', 'powerful', 'specialized')),
  is_default boolean DEFAULT false,
  is_active boolean DEFAULT true,
  configuration jsonb DEFAULT '{}',
  capabilities jsonb DEFAULT '{}', -- max_tokens, supports_vision, supports_tools, etc.
  cost_per_million_input_tokens decimal(10,4),
  cost_per_million_output_tokens decimal(10,4),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Ensure only one default
CREATE UNIQUE INDEX idx_one_default ON llm_global_settings(is_default) WHERE is_default = true;
```

#### 1.2 Extend Organizations Table
```sql
ALTER TABLE organizations ADD COLUMN llm_configuration jsonb DEFAULT NULL;

-- Example structure:
-- {
--   "default_profile": "balanced",
--   "profiles": {
--     "fast": { provider, model, api_key_vault_ref, settings },
--     "balanced": { ... },
--     "powerful": { ... }
--   }
-- }
```

#### 1.3 Utilize Existing Processor Configuration
- Already exists: `processors.configuration`
- Will store: `{ "llm_profile": "powerful", "settings_override": { ... } }`

#### 1.4 Create Audit Table
```sql
CREATE TABLE llm_usage_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id),
  processor_id uuid REFERENCES processors(id),
  run_id uuid REFERENCES runs(id),
  provider text NOT NULL,
  model_name text NOT NULL,
  input_tokens integer,
  output_tokens integer,
  estimated_cost decimal(10,6),
  response_time_ms integer,
  error_message text,
  created_at timestamptz DEFAULT now()
);
```

### Phase 2: Vault Setup for API Keys (Week 1)

#### 2.1 Store Organization API Keys
```sql
-- Function to store API key securely
CREATE OR REPLACE FUNCTION store_org_api_key(
  p_organization_id uuid,
  p_provider text,
  p_api_key text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_secret_id uuid;
  v_secret_name text;
BEGIN
  -- Generate unique name for this org's provider key
  v_secret_name := format('org_%s_%s_key', p_organization_id, p_provider);

  -- Create or update the secret in vault
  INSERT INTO vault.secrets (name, secret)
  VALUES (v_secret_name, p_api_key)
  ON CONFLICT (name)
  DO UPDATE SET secret = EXCLUDED.secret
  RETURNING id INTO v_secret_id;

  RETURN v_secret_id;
END;
$$;
```

#### 2.2 Retrieve API Keys (Edge Function Only)
```sql
-- Function to get decrypted API key (restricted to service role)
CREATE OR REPLACE FUNCTION get_org_api_key(
  p_organization_id uuid,
  p_provider text
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_api_key text;
  v_secret_name text;
BEGIN
  v_secret_name := format('org_%s_%s_key', p_organization_id, p_provider);

  SELECT decrypted_secret INTO v_api_key
  FROM vault.decrypted_secrets
  WHERE name = v_secret_name;

  RETURN v_api_key;
END;
$$;

-- Restrict access to service role only
REVOKE EXECUTE ON FUNCTION get_org_api_key FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_org_api_key TO service_role;
```

### Phase 3: Configuration Resolution (Week 1)

#### 3.1 Create Resolution Function
```sql
CREATE OR REPLACE FUNCTION get_effective_llm_config(
  p_processor_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org_id uuid;
  v_org_config jsonb;
  v_proc_config jsonb;
  v_global_config jsonb;
  v_selected_profile text;
  v_final_config jsonb;
BEGIN
  -- Get current organization
  v_org_id := auth.jwt() -> 'app_metadata' ->> 'organization_id';

  -- Step 1: Get processor config if provided
  IF p_processor_id IS NOT NULL THEN
    SELECT configuration INTO v_proc_config
    FROM processors
    WHERE id = p_processor_id AND organization_id = v_org_id;

    -- If processor has a specific profile selected
    IF v_proc_config IS NOT NULL AND v_proc_config ? 'llm_profile' THEN
      -- Get the profile from org config
      SELECT llm_configuration -> 'profiles' -> (v_proc_config ->> 'llm_profile')
      INTO v_final_config
      FROM organizations
      WHERE id = v_org_id;

      -- Merge any processor-level overrides
      IF v_proc_config ? 'settings_override' THEN
        v_final_config := v_final_config ||
          jsonb_build_object('settings',
            COALESCE(v_final_config -> 'settings', '{}') ||
            (v_proc_config -> 'settings_override')
          );
      END IF;

      RETURN v_final_config;
    END IF;
  END IF;

  -- Step 2: Check organization default
  SELECT llm_configuration INTO v_org_config
  FROM organizations
  WHERE id = v_org_id;

  IF v_org_config IS NOT NULL THEN
    v_selected_profile := v_org_config ->> 'default_profile';
    IF v_selected_profile IS NOT NULL THEN
      RETURN v_org_config -> 'profiles' -> v_selected_profile;
    END IF;
  END IF;

  -- Step 3: Fall back to global default
  SELECT jsonb_build_object(
    'provider', provider,
    'model', model_name,
    'display_name', display_name,
    'settings', configuration,
    'capabilities', capabilities
  ) INTO v_global_config
  FROM llm_global_settings
  WHERE is_default = true AND is_active = true
  LIMIT 1;

  RETURN v_global_config;
END;
$$;
```

### Phase 4: Edge Functions (Week 2)

#### 4.1 LLM Execution Edge Function
```typescript
// supabase/functions/execute-llm/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

serve(async (req) => {
  const { processor_id, prompt, operation_id } = await req.json()

  // Get service role client
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // Get effective configuration
  const { data: config } = await supabase.rpc('get_effective_llm_config', {
    p_processor_id: processor_id
  })

  // Get API key from vault if needed
  let apiKey = null
  if (config.api_key_vault_ref) {
    const { data: keyData } = await supabase.rpc('get_org_api_key', {
      p_organization_id: org_id,
      p_provider: config.provider
    })
    apiKey = keyData
  } else {
    // Use system default key
    apiKey = Deno.env.get(`${config.provider.toUpperCase()}_API_KEY`)
  }

  // Execute LLM call based on provider
  const response = await executeLLMCall(config.provider, config.model, apiKey, prompt, config.settings)

  // Log usage
  await supabase.from('llm_usage_logs').insert({
    organization_id: org_id,
    processor_id,
    provider: config.provider,
    model_name: config.model,
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
    estimated_cost: calculateCost(response.usage, config),
    response_time_ms: response.latency
  })

  return new Response(JSON.stringify(response), {
    headers: { 'Content-Type': 'application/json' }
  })
})
```

#### 4.2 API Key Management Edge Function
```typescript
// supabase/functions/manage-llm-keys/index.ts
// Handles storing/updating organization API keys
```

### Phase 5: Frontend Components (Week 2)

#### 5.1 Organization Settings Page
- API key management interface
- Model profile configuration
- Usage dashboard

#### 5.2 Processor Creation/Edit
- Model selection dropdown
- Settings override interface
- Estimated cost display

#### 5.3 Run Execution
- Show selected model
- Real-time token usage
- Cost tracking

### Phase 6: RLS and Security (Week 3)

#### 6.1 Row Level Security Policies
```sql
-- Global settings: read-only for all authenticated
ALTER TABLE llm_global_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read global settings"
  ON llm_global_settings FOR SELECT
  USING (true);

-- Usage logs: org members can view their own
ALTER TABLE llm_usage_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view usage"
  ON llm_usage_logs FOR SELECT
  USING (
    organization_id = auth.jwt() -> 'app_metadata' ->> 'organization_id'::uuid
  );
```

#### 6.2 Function Security
- Vault access functions: service_role only
- Configuration resolution: authenticated users
- API key management: org admins only

### Phase 7: Testing & Migration (Week 3)

#### 7.1 Data Migration
```sql
-- Populate global settings with default models
INSERT INTO llm_global_settings (provider, model_name, display_name, is_default, configuration) VALUES
  ('anthropic', 'claude-3-5-sonnet-20241022', 'Claude 3.5 Sonnet', true, '{"temperature": 0.7, "max_tokens": 4096}'),
  ('anthropic', 'claude-3-opus-20240229', 'Claude 3 Opus', false, '{"temperature": 0.5, "max_tokens": 8192}'),
  ('mistral', 'mistral-large-latest', 'Mistral Large', false, '{"temperature": 0.7, "max_tokens": 4096}');
```

#### 7.2 Testing Checklist
- [ ] Vault secret storage and retrieval
- [ ] Configuration resolution hierarchy
- [ ] Edge function LLM execution
- [ ] Usage logging and cost tracking
- [ ] RLS policies enforcement
- [ ] Frontend model selection
- [ ] API key management UI

## Risk Mitigation

### Security Risks
- **Risk**: API key exposure
- **Mitigation**: Keys stored in Vault, never sent to client, Edge Functions only

### Performance Risks
- **Risk**: Edge Function latency
- **Mitigation**: Caching configuration, connection pooling

### Cost Risks
- **Risk**: Unexpected LLM costs
- **Mitigation**: Usage tracking, quotas, cost alerts

## Success Metrics

1. **Security**: Zero API key exposures
2. **Performance**: <100ms configuration resolution
3. **Flexibility**: Support for 5+ LLM providers
4. **Usage**: 90% of processors use appropriate models
5. **Cost**: 20% reduction through model optimization

## Timeline

- **Week 1**: Database schema, Vault setup, Resolution logic
- **Week 2**: Edge Functions, Frontend components
- **Week 3**: Security, Testing, Deployment

## Dependencies

- Supabase Vault (✅ Already enabled)
- Edge Functions runtime
- Frontend framework (Next.js)
- LLM provider SDKs

## Open Questions

1. Should we support custom/self-hosted models?
2. Do we need usage quotas per organization?
3. Should we cache LLM responses?
4. How to handle provider outages?

## Next Steps

1. Review and approve this plan
2. Create migration files
3. Implement Phase 1 (Database)
4. Set up development environment for testing
5. Begin Edge Function development