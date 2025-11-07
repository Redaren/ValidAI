/**
 * Execute Processor Run Edge Function
 *
 * @module execute-processor-run
 * @description
 * Orchestrates end-to-end processor execution on documents with chunked background processing.
 * Creates immutable snapshots and executes all operations sequentially via shared LLM executor.
 *
 * ## Features
 * - **Snapshot-Based Immutability**: Freezes processor state at run creation
 * - **Chunked Execution**: Processes operations in batches to avoid 25-minute timeout
 * - **Self-Invocation**: Edge Function calls itself for background processing
 * - **Prompt Caching**: First operation creates cache, subsequent operations hit cache (90% savings)
 * - **Error Recovery**: Retries transient errors, continues on operation failures
 * - **Real-time Updates**: Publishes progress via Supabase Realtime
 * - **Optimized Database Access**: Single-write operations, batch progress updates, document buffer caching
 *
 * ## Architecture
 * - Initial invocation: Creates run with snapshot, returns immediately (HTTP 202)
 * - Background invocation: Processes chunk of operations, self-invokes for next chunk
 * - Uses shared llm-executor utility for all LLM calls
 * - Updates run progress per operation (crash-resistant, idempotent retries)
 * - Downloads document once per chunk and caches in memory for all operations
 *
 * ## Performance & Stability (2025-10-29)
 * - Document buffer cached in memory (1 download per chunk vs 1 per operation = 70% reduction)
 * - Single INSERT per operation (no pending/processing states = 66% reduction in writes)
 * - Per-operation progress updates (1 UPDATE per operation = crash-resistant, adds ~100ms overhead)
 * - Resume logic prevents duplicate processing on retries (idempotent execution)
 * - CHUNK_SIZE=4 to stay within 200s runtime limit (was 10, caused timeouts on large docs)
 * - For 9 operations: ~18 queries total (9 inserts + 9 updates), ~1s DB overhead
 *
 * @version 1.1.0
 * @since 2025-10-14
 */

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { executeLLMOperationWithRetry, downloadDocument } from '../_shared/llm-executor.ts'
import { executeLLMOperationWithRetryRouter } from '../_shared/llm-executor-router.ts'
import { Mistral } from 'npm:@mistralai/mistralai'
import { uploadDocumentToMistral } from '../_shared/llm-executor-mistral.ts'
import Anthropic from 'npm:@anthropic-ai/sdk'
import { uploadDocumentToAnthropic } from '../_shared/llm-executor-anthropic.ts'
import {
  uploadDocumentToGemini,
  createGeminiCache,
  cleanupGeminiCache,
  type GeminiCacheRef
} from '../_shared/llm-executor-gemini.ts'
import type { OperationSnapshot, DocumentSnapshot, ProcessorSettings } from '../_shared/types.ts'

/**
 * CORS headers configuration
 */
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Chunk size for operation processing
 *
 * IMPORTANT: This value is constrained by actual Edge Function runtime limits, NOT the
 * theoretical 25-minute maximum. Based on testing with large documents (8MB PDFs):
 *
 * - Observed operation time: 22-27 seconds per operation (Mistral Large, 76K tokens)
 * - HTTP Gateway timeout: 150 seconds (504 Gateway Timeout)
 * - Edge Function runtime limit: ~200 seconds (forcible "shutdown")
 *
 * Current setting: CHUNK_SIZE = 4
 * - Expected chunk duration: 4 ops × 23s = ~92 seconds
 * - Safety margin: 92s < 150s (HTTP) and 92s < 200s (runtime)
 *
 * TECHNICAL DEBT / TODO:
 * 1. Investigate actual Edge Function timeout configuration (why 200s not 25min?)
 * 2. Check if timeout differs by Supabase plan (Free/Pro/Enterprise)
 * 3. Consider document size warnings in UI (>5MB = slower processing)
 * 4. Optimize with mistral-small-latest instead of mistral-large-latest (3x faster)
 * 5. Implement document chunking (send only relevant pages per operation)
 * 6. Add adaptive CHUNK_SIZE based on avg operation time from previous runs
 * 7. Consider streaming response pattern to avoid HTTP Gateway timeout
 *
 * Related issue: Run 9b3ff289-ece5-4d9b-9dd8-c4465f54949f (2025-10-29)
 * - 9 operations, 8.78MB PDF, mistral-large-latest
 * - Timed out after operation 7, lost all progress due to batch update bug
 * - Fixed with this change + per-operation updates + resume logic
 */
const CHUNK_SIZE = 4

/**
 * Initial request payload (from UI)
 */
interface InitialRequest {
  processor_id: string
  document_id: string
}

/**
 * Background request payload (self-invocation)
 */
interface BackgroundRequest {
  run_id: string
  start_index: number
  background: true
}

/**
 * Run snapshot structure
 */
interface RunSnapshot {
  processor: {
    id: string
    name: string
    system_prompt: string | null
    configuration: {
      selected_model_id?: string
      settings_override?: ProcessorSettings
    } | null
  }
  operations: OperationSnapshot[]
  document: DocumentSnapshot
  mistral_document_url?: string  // Signed URL for Mistral document reuse (valid 24 hours)
  anthropic_file_id?: string  // File ID for Anthropic Files API (indefinite storage)
  gemini_file_uri?: string  // File URI for Gemini File API (valid 48 hours)
  gemini_cache_name?: string  // Cache name for Gemini explicit caching (5-minute TTL)
  gemini_file_mime_type?: string  // MIME type for Gemini file reference
}

/**
 * Main request handler
 */
serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body: InitialRequest | BackgroundRequest = await req.json()

    // Get Supabase client with service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Authenticate user (for initial requests)
    // Note: Service role calls (for testing or system triggers) bypass user authentication
    const authHeader = req.headers.get('Authorization')
    let user: any = null
    const isServiceRoleCall = authHeader?.includes(supabaseServiceKey)

    if (authHeader && !('background' in body) && !isServiceRoleCall) {
      const token = authHeader.replace('Bearer ', '')
      const { data: { user: authUser }, error: userError } = await supabase.auth.getUser(token)

      if (userError || !authUser) {
        throw new Error('Invalid user token')
      }
      user = authUser
    }

    // Branch: Initial invocation vs Background invocation
    const isBackgroundInvocation = 'background' in body && body.background === true

    if (!isBackgroundInvocation) {
      // ===== INITIAL INVOCATION (from UI) =====
      const initialBody = body as InitialRequest

      console.log('=== Initial Invocation: Creating Run ===')
      console.log(`Processor ID: ${initialBody.processor_id}`)
      console.log(`Document ID: ${initialBody.document_id}`)

      // 1. Validate input
      if (!initialBody.processor_id || !initialBody.document_id) {
        return new Response(
          JSON.stringify({ error: 'Missing required fields: processor_id and document_id' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // 2. Fetch processor
      const { data: processor, error: procError } = await supabase
        .from('validai_processors')
        .select('*')
        .eq('id', initialBody.processor_id)
        .single()

      if (procError || !processor) {
        return new Response(
          JSON.stringify({ error: `Processor not found: ${procError?.message}` }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // 3. Fetch operations (ordered by position)
      const { data: operations, error: opsError } = await supabase
        .from('validai_operations')
        .select('*')
        .eq('processor_id', initialBody.processor_id)
        .order('position', { ascending: true })

      if (opsError) {
        return new Response(
          JSON.stringify({ error: `Failed to fetch operations: ${opsError.message}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      if (!operations || operations.length === 0) {
        return new Response(
          JSON.stringify({ error: 'Processor has no operations' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // 4. Fetch document
      const { data: document, error: docError } = await supabase
        .from('validai_documents')
        .select('*')
        .eq('id', initialBody.document_id)
        .single()

      if (docError || !document) {
        return new Response(
          JSON.stringify({ error: `Document not found: ${docError?.message}` }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // 5. Get organization_id (from user or processor for service-role calls)
      let organization_id: string

      if (isServiceRoleCall) {
        // Service role: use processor's organization_id
        organization_id = processor.organization_id
      } else {
        // Regular user: verify organization membership
        const { data: membership, error: memberError } = await supabase
          .from('organization_members')
          .select('organization_id')
          .eq('user_id', user.id)
          .single()

        if (memberError || !membership) {
          return new Response(
            JSON.stringify({ error: 'User not member of any organization' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
        organization_id = membership.organization_id
      }

      // 6. Resolve LLM config to determine provider (before creating snapshot)
      console.log('Resolving LLM configuration...')
      const { data: llmConfig, error: llmError } = await supabase.rpc('get_llm_config_for_run', {
        p_processor_id: processor.id,
        p_user_id: user?.id || null
      })

      if (llmError || !llmConfig) {
        return new Response(
          JSON.stringify({ error: `Failed to resolve LLM configuration: ${llmError?.message}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const provider = llmConfig.provider || 'anthropic'
      console.log(`Provider: ${provider}`)

      // 7. If Mistral, upload document BEFORE creating run (fail-fast)
      let mistralDocumentUrl: string | null = null

      if (provider === 'mistral') {
        console.log('Processor uses Mistral - uploading document before creating run...')

        try {
          // Resolve Mistral API key
          let mistralApiKey: string
          if (llmConfig.api_key_encrypted) {
            const { data: decryptedKey, error: decryptError } = await supabase.rpc('decrypt_api_key', {
              p_ciphertext: llmConfig.api_key_encrypted,
              p_org_id: llmConfig.organization_id
            })

            if (decryptError || !decryptedKey) {
              throw new Error(`Failed to decrypt Mistral API key: ${decryptError?.message}`)
            }
            mistralApiKey = decryptedKey
          } else {
            const globalKey = Deno.env.get('MISTRAL_API_KEY')
            if (!globalKey) {
              throw new Error('No Mistral API key available (neither org-specific nor global)')
            }
            mistralApiKey = globalKey
          }

          // Download and upload document
          const documentBuffer = await downloadDocument(supabase, document.storage_path)
          const mistralClient = new Mistral({ apiKey: mistralApiKey })

          mistralDocumentUrl = await uploadDocumentToMistral(
            mistralClient,
            documentBuffer,
            document.name
          )

          console.log(`✅ Mistral document uploaded successfully`)
          console.log(`Signed URL will be stored in snapshot and reused for all ${operations.length} operations`)
        } catch (error: any) {
          console.error(`❌ Failed to upload document to Mistral: ${error.message}`)
          // FAIL FAST: Return error BEFORE creating run
          return new Response(
            JSON.stringify({
              error: 'Document upload to Mistral failed',
              details: error.message
            }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
      }

      // 7b. If Anthropic with Files API enabled, upload document BEFORE creating run (fail-fast)
      let anthropicFileId: string | null = null

      if (provider === 'anthropic') {
        // Check feature flag (defaults to true)
        const useFilesAPI = processor.configuration?.settings_override?.use_anthropic_files_api ?? true

        if (useFilesAPI) {
          console.log('Processor uses Anthropic Files API - uploading document before creating run...')

          try {
            // Resolve Anthropic API key (same pattern as Mistral)
            let anthropicApiKey: string
            if (llmConfig.api_key_encrypted) {
              const { data: decryptedKey, error: decryptError } = await supabase.rpc('decrypt_api_key', {
                p_ciphertext: llmConfig.api_key_encrypted,
                p_org_id: llmConfig.organization_id
              })

              if (decryptError || !decryptedKey) {
                throw new Error(`Failed to decrypt Anthropic API key: ${decryptError?.message}`)
              }
              anthropicApiKey = decryptedKey
            } else {
              // Use global Anthropic API key
              const globalKey = Deno.env.get('ANTHROPIC_API_KEY')
              if (!globalKey) {
                throw new Error('No Anthropic API key available (neither org-specific nor global)')
              }
              anthropicApiKey = globalKey
            }

            // Download and upload document
            const documentBuffer = await downloadDocument(supabase, document.storage_path)
            const anthropicClient = new Anthropic({ apiKey: anthropicApiKey })

            anthropicFileId = await uploadDocumentToAnthropic(
              anthropicClient,
              documentBuffer,
              document.name,
              document.mime_type
            )

            console.log(`✅ Anthropic document uploaded successfully`)
            console.log(`File ID will be stored in snapshot and reused for all ${operations.length} operations`)
          } catch (error: any) {
            console.error(`❌ Failed to upload document to Anthropic: ${error.message}`)
            // FAIL FAST: Return error BEFORE creating run
            return new Response(
              JSON.stringify({
                error: 'Document upload to Anthropic failed',
                details: error.message
              }),
              { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }
        } else {
          console.log('Processor uses Anthropic legacy mode (inline files via Vercel AI SDK)')
        }
      }

      // 7c. If Google/Gemini, upload document and create cache BEFORE creating run (fail-fast)
      let geminiFileUri: string | null = null
      let geminiCacheName: string | null = null
      let geminiFileMimeType: string | null = null

      if (provider === 'google') {
        console.log('Processor uses Google Gemini - uploading document and creating cache before run...')

        try {
          // Resolve Google API key (same pattern as Anthropic/Mistral)
          let geminiApiKey: string
          if (llmConfig.api_key_encrypted) {
            const { data: decryptedKey, error: decryptError } = await supabase.rpc('decrypt_api_key', {
              p_ciphertext: llmConfig.api_key_encrypted,
              p_org_id: llmConfig.organization_id
            })

            if (decryptError || !decryptedKey) {
              throw new Error(`Failed to decrypt Google API key: ${decryptError?.message}`)
            }
            geminiApiKey = decryptedKey
          } else {
            // Fall back to global Google API key
            const globalKey = Deno.env.get('GOOGLE_API_KEY')
            if (!globalKey) {
              throw new Error('No Google API key available (neither org-specific nor global)')
            }
            geminiApiKey = globalKey
          }

          // Download document
          const documentBuffer = await downloadDocument(supabase, document.storage_path)

          // Upload to Gemini File API (48-hour validity)
          const geminiFileResult = await uploadDocumentToGemini(
            geminiApiKey,
            documentBuffer,
            document.name,
            document.mime_type || 'application/pdf'
          )

          geminiFileUri = geminiFileResult.fileUri
          geminiFileMimeType = geminiFileResult.mimeType

          console.log(`✅ Gemini document uploaded successfully (48h validity)`)
          console.log(`File URI: ${geminiFileUri}`)

          // Create cache with base system prompt (5-minute TTL)
          const baseSystemPrompt = processor.configuration?.system_prompt ||
            'You are a helpful AI assistant that analyzes documents and provides structured responses.'

          geminiCacheName = await createGeminiCache(
            geminiApiKey,
            llmConfig.model,
            geminiFileUri,
            geminiFileMimeType,
            baseSystemPrompt
          )

          console.log(`✅ Gemini cache created successfully (5min TTL)`)
          console.log(`Cache name: ${geminiCacheName}`)
          console.log(`Cache will be reused for all ${operations.length} operations`)
        } catch (error: any) {
          console.error(`❌ Failed to upload/cache document for Gemini: ${error.message}`)
          // FAIL FAST: Return error BEFORE creating run
          return new Response(
            JSON.stringify({
              error: 'Document upload/cache creation for Gemini failed',
              details: error.message
            }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
      }

      // 8. Create snapshot (frozen state)
      const snapshot: RunSnapshot = {
        processor: {
          id: processor.id,
          name: processor.name,
          system_prompt: processor.system_prompt,
          configuration: processor.configuration
        },
        operations: operations.map((op: any) => ({
          id: op.id,
          name: op.name,
          description: op.description,
          operation_type: op.operation_type,
          prompt: op.prompt,
          position: op.position,
          area: op.area,
          configuration: op.configuration,
          output_schema: op.output_schema
        })),
        document: {
          id: document.id,
          name: document.name,
          size_bytes: document.size_bytes,
          mime_type: document.mime_type,
          storage_path: document.storage_path
        },
        mistral_document_url: mistralDocumentUrl,  // NULL for non-Mistral
        anthropic_file_id: anthropicFileId,  // NULL for legacy Anthropic or non-Anthropic
        gemini_file_uri: geminiFileUri,  // NULL for non-Gemini
        gemini_cache_name: geminiCacheName,  // NULL for non-Gemini
        gemini_file_mime_type: geminiFileMimeType  // NULL for non-Gemini
      }

      console.log(`Snapshot created: ${operations.length} operations, document: ${document.name}`)
      if (mistralDocumentUrl) {
        console.log(`Mistral signed URL stored in snapshot for reuse`)
      }
      if (anthropicFileId) {
        console.log(`Anthropic file_id stored in snapshot for reuse`)
      }
      if (geminiFileUri && geminiCacheName) {
        console.log(`Gemini file URI and cache name stored in snapshot for reuse`)
      }

      // 7. Create run record
      const { data: run, error: runError } = await supabase
        .from('validai_runs')
        .insert({
          processor_id: processor.id,
          document_id: document.id,
          organization_id: organization_id,
          snapshot: snapshot,
          status: 'pending',
          triggered_by: user?.id || null,
          trigger_type: 'manual',
          total_operations: operations.length,
          started_at: new Date().toISOString()
        })
        .select()
        .single()

      if (runError || !run) {
        return new Response(
          JSON.stringify({ error: `Failed to create run: ${runError?.message}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      console.log(`Run created: ${run.id}`)

      // 8. Kick off background processing (self-invoke)
      const edgeFunctionUrl = `${supabaseUrl}/functions/v1/execute-processor-run`

      console.log('Invoking background processing...')
      fetch(edgeFunctionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`
        },
        body: JSON.stringify({
          run_id: run.id,
          start_index: 0,
          background: true
        })
      }).catch(err => {
        console.error('Background invocation failed:', err)
      })

      // 9. Return immediately to user (HTTP 202 Accepted)
      return new Response(
        JSON.stringify({
          run_id: run.id,
          status: 'pending',
          message: 'Run created and processing started'
        }),
        {
          status: 202,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )

    } else {
      // ===== BACKGROUND INVOCATION (self-invoked) =====
      const backgroundBody = body as BackgroundRequest

      console.log('=== Background Invocation: Processing Chunk ===')
      console.log(`Run ID: ${backgroundBody.run_id}`)
      console.log(`Start Index: ${backgroundBody.start_index}`)

      // 1. Fetch run with snapshot
      const { data: run, error: runError } = await supabase
        .from('validai_runs')
        .select('*')
        .eq('id', backgroundBody.run_id)
        .single()

      if (runError || !run) {
        console.error(`Failed to fetch run: ${runError?.message}`)
        return new Response(
          JSON.stringify({ error: 'Run not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const snapshot = run.snapshot as RunSnapshot

      // 2. Update run status to processing (if first chunk)
      if (backgroundBody.start_index === 0) {
        await supabase
          .from('validai_runs')
          .update({ status: 'processing' })
          .eq('id', backgroundBody.run_id)
        console.log('Run status updated to: processing')
      }

      // 3. Get LLM configuration
      const { data: llmConfig, error: llmError } = await supabase.rpc('get_llm_config_for_run', {
        p_processor_id: run.processor_id,
        p_user_id: run.triggered_by || null
      })

      if (llmError || !llmConfig) {
        console.error(`Failed to get LLM config: ${llmError?.message}`)
        await supabase
          .from('validai_runs')
          .update({
            status: 'failed',
            error_message: `Failed to resolve LLM configuration: ${llmError?.message}`,
            completed_at: new Date().toISOString()
          })
          .eq('id', backgroundBody.run_id)
        return new Response(
          JSON.stringify({ error: 'Failed to resolve LLM config' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // 4. Determine provider and decrypt API key
      const provider = llmConfig.provider || 'anthropic'
      console.log(`Provider: ${provider}`)

      let apiKey: string
      if (provider === 'mistral') {
        // Mistral API key resolution
        if (llmConfig.api_key_encrypted) {
          const { data: decryptedKey, error: decryptError } = await supabase.rpc('decrypt_api_key', {
            p_ciphertext: llmConfig.api_key_encrypted,
            p_org_id: llmConfig.organization_id
          })

          if (decryptError || !decryptedKey) {
            console.error(`Failed to decrypt Mistral API key: ${decryptError?.message}`)
            await supabase
              .from('validai_runs')
              .update({
                status: 'failed',
                error_message: 'Failed to decrypt Mistral API key',
                completed_at: new Date().toISOString()
              })
              .eq('id', backgroundBody.run_id)
            return new Response(
              JSON.stringify({ error: 'Failed to decrypt Mistral API key' }),
              { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }
          apiKey = decryptedKey
        } else {
          // Use global Mistral API key
          const globalKey = Deno.env.get('MISTRAL_API_KEY')
          if (!globalKey) {
            console.error('No Mistral API key available')
            await supabase
              .from('validai_runs')
              .update({
                status: 'failed',
                error_message: 'No Mistral API key available',
                completed_at: new Date().toISOString()
              })
              .eq('id', backgroundBody.run_id)
            return new Response(
              JSON.stringify({ error: 'No Mistral API key available' }),
              { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }
          apiKey = globalKey
        }
        console.log('Mistral API key resolved successfully')
      } else {
        // Anthropic API key resolution (existing logic)
        if (llmConfig.api_key_encrypted) {
          const { data: decryptedKey, error: decryptError } = await supabase.rpc('decrypt_api_key', {
            p_ciphertext: llmConfig.api_key_encrypted,
            p_org_id: llmConfig.organization_id
          })

          if (decryptError || !decryptedKey) {
            console.error(`Failed to decrypt Anthropic API key: ${decryptError?.message}`)
            await supabase
              .from('validai_runs')
              .update({
                status: 'failed',
                error_message: 'Failed to decrypt Anthropic API key',
                completed_at: new Date().toISOString()
              })
              .eq('id', backgroundBody.run_id)
            return new Response(
              JSON.stringify({ error: 'Failed to decrypt Anthropic API key' }),
              { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }
          apiKey = decryptedKey
        } else {
          // Use global Anthropic API key
          const globalKey = Deno.env.get('ANTHROPIC_API_KEY')
          if (!globalKey) {
            console.error('No Anthropic API key available')
            await supabase
              .from('validai_runs')
              .update({
                status: 'failed',
                error_message: 'No Anthropic API key available',
                completed_at: new Date().toISOString()
              })
              .eq('id', backgroundBody.run_id)
            return new Response(
              JSON.stringify({ error: 'No Anthropic API key available' }),
              { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }
          apiKey = globalKey
        }
        console.log('Anthropic API key resolved successfully')
      }

      // 5. Process chunk of operations with resume logic
      const operations = snapshot.operations

      // Resume from last completed operation if this is a retry
      // This prevents re-processing operations that already have results
      const lastCompletedIndex = run.completed_operations  // Number of completed ops = next index to process
      const effectiveStartIndex = Math.max(backgroundBody.start_index, lastCompletedIndex)

      if (effectiveStartIndex > backgroundBody.start_index) {
        console.log(`⚠️ Resuming from operation ${effectiveStartIndex} (requested: ${backgroundBody.start_index}, already completed: ${lastCompletedIndex})`)
        console.log(`This appears to be a retry after a crash or timeout`)
      }

      const chunk = operations.slice(effectiveStartIndex, effectiveStartIndex + CHUNK_SIZE)

      console.log(`Processing chunk: ${chunk.length} operations (${effectiveStartIndex} to ${effectiveStartIndex + chunk.length - 1})`)

      // Merge LLM config settings with snapshot overrides
      // Priority: snapshot.settings_override > llmConfig.settings > defaults
      const settings: ProcessorSettings = {
        // Provider (required for router)
        provider: provider as 'anthropic' | 'mistral',

        // Start with resolved LLM config settings from get_llm_config_for_run
        selected_model_id: llmConfig.model,
        max_tokens: llmConfig.settings?.default_max_tokens,
        temperature: llmConfig.settings?.default_temperature,
        top_p: llmConfig.settings?.default_top_p,
        top_k: llmConfig.settings?.default_top_k,
        supports_top_p: llmConfig.settings?.supports_top_p,

        // Override with processor-specific settings if present
        ...(snapshot.processor.configuration?.settings_override || {})
      }
      const enableCaching = settings.enable_caching !== false && provider === 'anthropic' // Only Anthropic supports caching

      console.log(`Using model: ${settings.selected_model_id}`)
      console.log(`Settings: temp=${settings.temperature}, max_tokens=${settings.max_tokens}, caching=${enableCaching}`)

      // Prepare document reference for executor
      // - Google: GeminiCacheRef object with fileUri + cacheName
      // - Mistral: signed URL (string)
      // - Anthropic Files API: file_id (string)
      // - Anthropic Legacy: document buffer (Buffer)
      let documentRef: string | GeminiCacheRef | any = null

      if (provider === 'google') {
        // Gemini path: construct GeminiCacheRef from snapshot
        const geminiFileUri = snapshot.gemini_file_uri || null
        const geminiCacheName = snapshot.gemini_cache_name || null
        const geminiFileMimeType = snapshot.gemini_file_mime_type || 'application/pdf'

        if (geminiFileUri && geminiCacheName) {
          console.log(`✅ Reusing Gemini file URI and cache from snapshot`)
          console.log(`File URI: ${geminiFileUri.substring(0, 50)}...`)
          console.log(`Cache: ${geminiCacheName}`)
          documentRef = {
            fileUri: geminiFileUri,
            cacheName: geminiCacheName,
            mimeType: geminiFileMimeType
          } as GeminiCacheRef
        } else {
          throw new Error('Gemini file URI or cache name not found in snapshot')
        }
      } else if (provider === 'mistral') {
        // Existing Mistral path
        const mistralDocumentUrl = snapshot.mistral_document_url || null
        if (mistralDocumentUrl) {
          console.log(`✅ Reusing Mistral signed URL from snapshot: ${mistralDocumentUrl.substring(0, 50)}...`)
          documentRef = mistralDocumentUrl
        }
      } else if (provider === 'anthropic') {
        // Check if Files API was used (file_id in snapshot)
        const anthropicFileId = snapshot.anthropic_file_id || null

        if (anthropicFileId) {
          // NEW: Anthropic Files API path
          console.log(`✅ Reusing Anthropic file_id from snapshot: ${anthropicFileId}`)
          documentRef = anthropicFileId
        } else {
          // LEGACY: Anthropic inline files path
          console.log(`Using Anthropic legacy mode - downloading document for inline passing`)
          console.log(`\n--- Downloading document: ${snapshot.document.name} ---`)
          const documentBuffer = await downloadDocument(supabase, snapshot.document.storage_path)
          console.log(`Document cached in memory: ${documentBuffer.length} bytes`)
          documentRef = documentBuffer
        }
      }

      for (const [chunkIndex, operation] of chunk.entries()) {
        const operationIndex = effectiveStartIndex + chunkIndex

        console.log(`\n--- Processing Operation ${operationIndex + 1}/${operations.length} ---`)
        console.log(`Name: ${operation.name}`)
        console.log(`Type: ${operation.operation_type}`)

        try {
          const startedAt = new Date().toISOString()

          // Execute LLM operation with retry using router (supports all providers)
          // - Mistral: documentRef is signed URL (string)
          // - Anthropic Files API: documentRef is file_id (string)
          // - Anthropic Legacy: documentRef is Buffer
          const result = await executeLLMOperationWithRetryRouter(
            {
              operation,
              document: snapshot.document,
              systemPrompt: snapshot.processor.system_prompt,
              settings,
              apiKey,
              enableCache: enableCaching && operationIndex === 0 ? true : enableCaching, // First op creates cache (Anthropic only)
            },
            supabase,
            documentRef  // Router determines execution path based on type
          )

          console.log(`✅ Operation completed successfully`)
          console.log(`Response length: ${result.response.length} chars`)
          console.log(`Tokens: ${result.tokens.input} in, ${result.tokens.output} out`)
          if (result.cacheHit) {
            console.log(`💰 Cache hit: ${result.tokens.cached_read} tokens (90% savings)`)
          }

          // Single INSERT with all data (completed status)
          await supabase
            .from('validai_operation_results')
            .insert({
              run_id: backgroundBody.run_id,
              operation_id: operation.id,
              operation_snapshot: operation,
              execution_order: operationIndex,
              status: 'completed',
              response_text: result.response,
              structured_output: result.structured_output,
              thinking_blocks: result.thinking_blocks,
              model_used: result.model,
              tokens_used: result.tokens,
              execution_time_ms: result.executionTime,
              cache_hit: result.cacheHit,
              started_at: startedAt,
              completed_at: new Date().toISOString()
            })

          // Update progress counter immediately (atomic increment, crash-resistant)
          // If function crashes after this, progress is persisted
          await supabase.rpc('increment_run_progress', {
            p_run_id: backgroundBody.run_id,
            p_status: 'completed'
          })

          console.log(`Progress updated: ${operationIndex + 1}/${operations.length} operations completed`)

        } catch (error: any) {
          // Operation failed (after retries)
          console.error(`❌ Operation failed: ${error.message}`)
          console.error('Full error details:', {
            name: error.name,
            message: error.message,
            stack: error.stack,
            retryCount: error.retryCount
          })

          const startedAt = new Date().toISOString()

          // Single INSERT with all data (failed status)
          await supabase
            .from('validai_operation_results')
            .insert({
              run_id: backgroundBody.run_id,
              operation_id: operation.id,
              operation_snapshot: operation,
              execution_order: operationIndex,
              status: 'failed',
              error_message: error.message || 'Unknown error occurred',
              error_type: error.name || 'UnknownError',
              retry_count: error.retryCount || 0,
              started_at: startedAt,
              completed_at: new Date().toISOString()
            })

          // Update failure counter immediately (atomic increment, crash-resistant)
          await supabase.rpc('increment_run_progress', {
            p_run_id: backgroundBody.run_id,
            p_status: 'failed'
          })

          console.log(`Failed operation recorded: ${operationIndex + 1}/${operations.length}`)

          // Continue to next operation (don't stop run)
        }
      }

      console.log(`Chunk processing complete`)

      // 6. Check if more chunks remain
      const hasMoreOperations = (effectiveStartIndex + CHUNK_SIZE) < operations.length

      if (hasMoreOperations) {
        // Invoke next chunk
        const nextStartIndex = effectiveStartIndex + CHUNK_SIZE
        console.log(`More operations remaining. Invoking next chunk (start: ${nextStartIndex})`)

        const edgeFunctionUrl = `${supabaseUrl}/functions/v1/execute-processor-run`
        fetch(edgeFunctionUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`
          },
          body: JSON.stringify({
            run_id: backgroundBody.run_id,
            start_index: nextStartIndex,
            background: true
          })
        }).catch(err => {
          console.error('Next chunk invocation failed:', err)
        })

      } else {
        // All operations processed, mark run as completed
        console.log('All operations processed. Marking run as completed.')

        await supabase
          .from('validai_runs')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString()
          })
          .eq('id', backgroundBody.run_id)

        // Cleanup Gemini cache if used
        if (provider === 'google' && snapshot.gemini_cache_name) {
          console.log('Cleaning up Gemini cache...')

          try {
            // Get API key for cleanup (same pattern as upload)
            let geminiApiKey: string | undefined
            if (llmConfig.api_key_encrypted) {
              const { data: decryptedKey, error: decryptError } = await supabase.rpc('decrypt_api_key', {
                p_ciphertext: llmConfig.api_key_encrypted,
                p_org_id: llmConfig.organization_id
              })

              if (!decryptError && decryptedKey) {
                geminiApiKey = decryptedKey
              }
            } else {
              // Fall back to global Google API key
              geminiApiKey = Deno.env.get('GOOGLE_API_KEY')
            }

            if (geminiApiKey) {
              await cleanupGeminiCache(geminiApiKey, snapshot.gemini_cache_name)
            } else {
              console.warn('No API key available for cache cleanup (non-critical)')
            }
          } catch (error: any) {
            // Non-critical error - cache will auto-expire in 5 minutes
            console.warn('Gemini cache cleanup failed (non-critical):', error.message)
          }
        }
      }

      // 7. Return success
      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

  } catch (error: any) {
    console.error('Error in execute-processor-run:', error)

    return new Response(
      JSON.stringify({
        error: error.message || 'Unknown error occurred',
        details: error.toString()
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})
