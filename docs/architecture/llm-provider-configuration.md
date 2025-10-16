# LLM Provider Configuration Architecture

> **Last Updated:** 2025-10-16

## Overview

ValidAI implements a flexible 3-tier configuration hierarchy for managing Large Language Model (LLM) providers and their settings. This architecture allows for progressive customization from system-wide defaults down to processor-specific optimizations.

## Implementation Status

**Current Implementation (as of 2025-10-16):**

### ✅ Fully Implemented
- **Database Schema:** All tables, columns, and functions are in place and working
  - `llm_global_settings` table with seeded Anthropic models
  - `organizations.llm_configuration` JSONB column
  - `processors.configuration` JSONB column
- **Database Functions:** All resolution and configuration functions operational
  - `get_llm_config_for_run()` - Resolves configuration through 3-tier hierarchy
  - `set_organization_llm_config()` - Saves organization settings with encryption
  - `get_available_llm_models()` - Returns available models
- **TypeScript Types:** Complete type definitions in `lib/types/llm-config.types.ts`
- **React Hooks:** All hooks implemented in `hooks/use-llm-config.ts`
- **Edge Functions:** Production run execution fully integrated with LLM config resolution
- **Security:** API key encryption and global fallback working

### ⚠️ Architecturally Ready, UI Pending
- **Processor Model Selection:** Database supports `selected_model_id` in `processors.configuration`, but no UI to set it yet
- **Processor Settings Override:** Database supports `settings_override` for temperature/max_tokens, but no UI exists
- **Organization LLM Management:** Hooks are ready, but Pro/Enterprise admin UI not built

### 🔄 Current Behavior
- **All processors use global default model** (Claude 3.5 Sonnet) via automatic fallback
- **Organizations cannot configure custom API keys yet** (all use global `ANTHROPIC_API_KEY` from Edge Function environment)
- **Processor configuration only stores** `default_run_view` field (for UI preference, not LLM settings)
- **System prompt is the only processor-level LLM customization** available through UI

### 📋 Roadmap
This document describes the **complete architecture** as designed. Implementation priority:
1. ✅ **Phase 1 (Complete):** Core database schema and resolution logic
2. ⏳ **Phase 2 (Pending):** Processor model selection UI
3. ⏳ **Phase 3 (Pending):** Organization LLM configuration UI (Pro/Enterprise feature)
4. ⏳ **Phase 4 (Future):** Advanced settings overrides and usage analytics

## Configuration Hierarchy

The system follows a strict 3-level hierarchy where each level can override the settings from the level above:

```
┌─────────────────────┐
│   Global Settings   │ ← System defaults (all users)
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Organization Config │ ← Custom API keys & models (Pro/Enterprise)
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Processor Config   │ ← Task-specific overrides
└─────────────────────┘
```

### 1. Global Level (System Defaults)

**Table**: `llm_global_settings`

The global level provides system-wide defaults that are available to all users. These are managed by system administrators and serve as the fallback when no custom configuration exists.

**Key Features**:
- Multiple models can be registered
- One model marked as `is_default`
- System provides API keys (users don't need their own)
- Base configuration settings (temperature, max_tokens, etc.)

**Example Global Settings**:
```json
{
  "provider": "anthropic",
  "model_name": "claude-3-5-sonnet-20241022",
  "display_name": "Claude 3.5 Sonnet",
  "is_default": true,
  "configuration": {
    "default_temperature": 1.0,
    "default_max_tokens": 4096,
    "default_top_p": 1.0,
    "context_window": 200000,
    "supports_top_p": true
  }
}
```

**Model Capabilities**:

Models may have restrictions on which API parameters they support. The `supports_top_p` flag indicates whether a model can accept both `temperature` and `top_p` parameters simultaneously:

- **Claude 4.5 models** (Haiku 4.5, Sonnet 4.5): `supports_top_p: false`
  - These models only accept `temperature` parameter
  - Attempting to send both parameters results in API error
- **Claude 3.x models** (3.5 Sonnet, 3.5 Haiku, 3 Opus): `supports_top_p: true`
  - These models accept both `temperature` and `top_p` parameters
  - Both can be used for sampling control

The LLM executor automatically handles this by conditionally including `top_p` based on model capabilities.

### 2. Organization Level (Custom Configuration)

**Column**: `organizations.llm_configuration`

Organizations with Pro or Enterprise accounts can configure their own LLM settings, including:
- Custom API keys (encrypted)
- Available models for their users
- Organization-wide default model
- Override global settings

**Data Structure**:
```json
{
  "api_keys_encrypted": {
    "anthropic": "encrypted_key_here",
    "mistral": "encrypted_key_here"
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

### 3. Processor Level (Fine-tuned Control)

**Column**: `processors.configuration`

Individual processors can select specific models and override settings for their particular use case.

**Data Structure (Designed)**:
```json
{
  "selected_model_id": "opus",
  "settings_override": {
    "temperature": 0.2,
    "max_tokens": 8192
  },
  "default_run_view": "technical"
}
```

**Current Implementation Note:**
- ⚠️ `selected_model_id` and `settings_override` are **supported by the database and resolution logic** but have **no UI yet**
- ✅ `default_run_view` is the only field currently settable via UI (determines which view to show on run detail page)
- In practice, processors currently use organization or global defaults for LLM configuration
- System prompt (stored in `processors.system_prompt` column, not in `configuration`) is the primary processor-level customization available

## Resolution Logic

The system resolves configuration using the `get_llm_config_for_run()` function, which follows this logic:

```mermaid
flowchart TD
    A[Start] --> B{Processor has config?}
    B -->|Yes| C[Use processor model selection]
    B -->|No| D{Organization has config?}

    C --> E{Model exists in org?}
    E -->|Yes| F[Return org model + processor overrides]
    E -->|No| D

    D -->|Yes| G[Use org default model]
    D -->|No| H[Use global default]

    G --> I[Return org model + org API key]
    H --> J[Return global model + system API key]
```

### Resolution Example

Given:
- **Global**: Claude Sonnet as default
- **Organization**: Has Anthropic + Mistral keys, Sonnet as default
- **Processor**: Selects Opus with temperature 0.2

Result:
```json
{
  "provider": "anthropic",
  "model": "claude-3-opus-20240229",
  "display_name": "Most Capable",
  "api_key_encrypted": "org_encrypted_key",
  "organization_id": "org_uuid",
  "settings": {
    "temperature": 0.2,  // Processor override
    "max_tokens": 8192   // From processor
  }
}
```

## Database Implementation

### Core Tables and Functions

#### Tables
- `llm_global_settings` - Stores all available models and their default configurations
- `organizations.llm_configuration` - JSONB column for organization-specific settings

#### Key Functions

1. **`get_llm_config_for_run(processor_id)`**
   - Main resolution function
   - Returns fully resolved configuration
   - Handles the 3-tier hierarchy

2. **`set_organization_llm_config(api_keys, models, default_model_id)`**
   - Updates organization configuration
   - Encrypts API keys automatically
   - Validates model structure

3. **`get_available_llm_models()`**
   - Returns models available to current user
   - Shows organization models if configured
   - Falls back to global models

4. **`encrypt_api_key(plaintext, org_id)` / `decrypt_api_key(ciphertext, org_id)`**
   - Handles secure API key storage
   - Organization-specific encryption
   - Decrypt restricted to service role

## Security Architecture

### API Key Storage

**Current Implementation (Pre-Production):**
- Global API key stored in Edge Function environment variable (`ANTHROPIC_API_KEY`)
- Enables immediate testing without organization setup
- Used as fallback when organization has no custom key
- Suitable for beta/preview deployments

**Organization-Level Keys (Enterprise Feature):**
API keys are encrypted using pgcrypto with organization-specific keys:

```
Plaintext API Key
       ↓
[Encrypt with org_id + secret]
       ↓
Base64 Encoded Ciphertext
       ↓
Stored in organizations.llm_configuration.api_keys_encrypted
```

**Security Features**:
- Keys encrypted at rest
- Organization-specific encryption keys
- Decrypt function restricted to service role
- Keys never sent to client

**Edge Function Resolution:**
```typescript
// Priority: Organization key → Global env var
if (llmConfig.api_key_encrypted) {
  // Use organization's custom key
  apiKey = await decrypt_api_key(llmConfig.api_key_encrypted, org_id)
} else {
  // Fallback to global key
  apiKey = Deno.env.get('ANTHROPIC_API_KEY')
}
```

### Access Control

Current implementation:
- All users use global API key by default
- Organization custom keys require encryption setup
- Decrypt function limited to service role

Future implementation:
- Role-based access (admin, member, viewer)
- Plan-based features (free: global key, pro/enterprise: custom keys)
- Audit logging for configuration changes

## Usage Patterns

### Setting Organization Configuration

> **⚠️ UI Status:** Hook is implemented and ready, but admin UI for organization LLM configuration is not yet built. This is a planned Pro/Enterprise feature.

```typescript
// React component using the hook
import { useSetOrganizationLLMConfig } from '@/hooks/use-llm-config';

function LLMSettings() {
  const setConfig = useSetOrganizationLLMConfig();

  const saveConfiguration = async () => {
    await setConfig.mutateAsync({
      api_keys: {
        anthropic: 'sk-ant-...',
        mistral: 'ml-key-...'
      },
      available_models: [
        {
          id: 'sonnet',
          provider: 'anthropic',
          model: 'claude-3-5-sonnet-20241022',
          display_name: 'Claude Sonnet'
        }
      ],
      default_model_id: 'sonnet'
    });
  };
}
```

### Getting Available Models

```typescript
import { useAvailableLLMModels } from '@/hooks/use-llm-config';

function ModelSelector() {
  const { data: models } = useAvailableLLMModels();

  // models.source: 'organization' | 'global'
  // models.models: array of available models
  // models.default_model_id: current default
}
```

### Processor Configuration

> **⚠️ UI Status:** Database and resolution logic support `selected_model_id` and `settings_override`, but no UI exists to set these fields yet. Current UI only allows setting `default_run_view` and `system_prompt` (separate column).

```typescript
// When creating/editing a processor (future implementation)
const processorConfig = {
  selected_model_id: 'opus',  // Select from available models (no UI yet)
  settings_override: {
    temperature: 0.2  // Override for this processor (no UI yet)
  },
  default_run_view: 'technical'  // ✅ Currently settable via UI
};

// Save to processors.configuration column
await updateProcessor({
  configuration: processorConfig
});
```

### Resolving Configuration at Runtime

> **✅ Fully Implemented:** This works end-to-end in Edge Functions during processor runs.

```typescript
import { useResolvedLLMConfig } from '@/hooks/use-llm-config';

function RunProcessor({ processorId }: { processorId: string }) {
  const { data: llmConfig } = useResolvedLLMConfig(processorId);

  // llmConfig contains:
  // - provider: 'anthropic'
  // - model: 'claude-3-5-sonnet-20241022' (currently always global default)
  // - api_key_encrypted: null (currently always uses global ANTHROPIC_API_KEY)
  // - settings: { default_temperature: 1.0, default_max_tokens: 4096, ... }
}
```

## Account Type Behaviors

> **Note:** Account tier differentiation is architecturally designed but not enforced in current UI. All accounts currently behave like Free accounts.

### Free Accounts
- Use global default models ✅ **Current behavior for all accounts**
- System provides API keys ✅ **Current behavior for all accounts**
- Cannot customize settings
- Single model selection

### Pro Accounts (Planned)
- Add custom API keys ⏳ Database ready, UI pending
- Select from multiple models ⏳ Database ready, UI pending
- Set organization defaults ⏳ Database ready, UI pending
- Override global settings ⏳ Database ready, UI pending

### Enterprise Accounts (Future)
- All Pro features
- Processor-level optimization ⏳ Database ready, UI pending
- Usage analytics 📋 Planned
- Custom model endpoints 📋 Planned
- Audit logging 📋 Planned

## Migration Path

### Phase 1 (Current)
- Basic 3-tier hierarchy
- Encrypted API key storage
- Simple resolution logic
- No access controls

### Phase 2 (Planned)
- Migrate to Supabase Vault when stable
- Add role-based access controls
- Implement usage tracking
- Add audit logging

### Vault Migration

When Supabase Vault becomes stable, migration will be straightforward:

```sql
-- Move encrypted keys from JSONB to Vault
INSERT INTO vault.secrets (name, secret)
SELECT
  format('org_%s_%s', org_id, provider),
  decrypt_api_key(api_key, org_id)
FROM organization_api_keys;

-- Update configuration to use vault references
UPDATE organizations
SET llm_configuration = jsonb_set(
  llm_configuration,
  '{api_key_vault_ref}',
  '"org_uuid_provider"'
);
```

## Best Practices

### For Developers

1. **Always use the resolution function**
   ```typescript
   // Good
   const config = await supabase.rpc('get_llm_config_for_run', { processor_id });

   // Bad - Don't manually traverse hierarchy
   const org = await getOrganization();
   const config = org.llm_configuration || globalDefault;
   ```

2. **Never decrypt API keys client-side**
   - Decryption happens in Edge Functions only
   - Client receives encrypted keys or null

3. **Cache configuration appropriately**
   - Use React Query's built-in caching
   - Invalidate on configuration changes

### For Organizations

1. **Start with defaults**
   - Test with global settings first
   - Add custom configuration when needed

2. **Use model IDs consistently**
   - Define clear, memorable IDs
   - Document model purposes

3. **Optimize processor settings**
   - Legal docs: Lower temperature (0.2)
   - Creative tasks: Higher temperature (0.8)
   - Analysis: Balanced settings (0.5)

## Troubleshooting

### Common Issues

1. **No configuration returned**
   - Check organization context in JWT
   - Verify global default exists
   - Ensure models are marked `is_active`

2. **Wrong model selected**
   - Check processor's `selected_model_id`
   - Verify model exists in organization's available models
   - Check organization's `default_model_id`

3. **API key decryption fails**
   - Verify encryption used correct org_id
   - Check service role permissions
   - Ensure key was encrypted with current function

4. **Error: "temperature and top_p cannot both be specified"**
   - This error occurs with Claude 4.5 models (Haiku 4.5, Sonnet 4.5)
   - Verify model configuration has `supports_top_p: false` set
   - Check migration `add_llm_model_capabilities` has been applied
   - LLM executor should automatically exclude `top_p` for these models
   - If error persists, check Edge Function logs for parameter detection logic

### Debug Queries

```sql
-- Check current user's organization
SELECT auth.jwt() -> 'app_metadata' ->> 'organization_id';

-- View organization configuration
SELECT llm_configuration
FROM organizations
WHERE id = 'org_uuid';

-- Test resolution
SELECT get_llm_config_for_run('processor_uuid');

-- View available models
SELECT get_available_llm_models();
```

## Future Enhancements

### Planned Features

1. **Model Versioning**
   - Track model version changes
   - Maintain compatibility

2. **Usage Analytics**
   - Token consumption per model
   - Cost tracking by organization
   - Performance metrics

3. **Advanced Features**
   - Custom model endpoints
   - Self-hosted model support
   - Model routing based on load

4. **Governance**
   - Audit trail for changes
   - Compliance reporting
   - Data residency controls

### Extension Points

The architecture supports future extensions:
- Additional providers (AWS Bedrock, Azure OpenAI)
- Custom models and endpoints
- Complex routing rules
- Dynamic model selection based on document type

## Summary

The 3-tier LLM configuration system provides:
- **Flexibility**: Organizations control their AI usage
- **Simplicity**: Clear hierarchy and resolution
- **Security**: Encrypted API keys, never exposed
- **Scalability**: Supports multiple providers and models
- **Future-proof**: Ready for Vault and advanced features

This architecture enables ValidAI to support diverse customer needs from free users with defaults to enterprises with complex requirements, all while maintaining security and simplicity.