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
 * - For 9 operations: ~18 queries total (9 inserts + 9 updates), ~1s DB overhead
 *
 * ## Parallel Execution & Real-Time Streaming (2025-11-08)
 * - Dynamic chunk_size from provider config (Gemini: 25, Anthropic: 5, Mistral: 3)
 * - Immediate database writes as operations complete (true real-time streaming)
 * - Provider-aware execution modes: serial, parallel, hybrid (cache warmup)
 * - Adaptive rate limit safety: auto-reduce concurrency on 429 errors
 * - Performance: Gemini 50 ops went from ~286s (13 chunks) to ~46s (2 chunks) = 6x speedup
 *
 * @version 1.1.0
 * @since 2025-10-14
 */

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { downloadDocument } from '../_shared/llm-executor.ts'
import { executeLLMOperationWithRetryRouter } from '../_shared/llm-executor-router.ts'
import { Mistral } from 'npm:@mistralai/mistralai'
import { uploadDocumentToMistral } from '../_shared/llm-executor-mistral.ts'
import Anthropic from 'npm:@anthropic-ai/sdk'
import { uploadDocumentToAnthropic } from '../_shared/llm-executor-anthropic.ts'
import { GoogleGenAI } from 'npm:@google/genai@1.29.0'
import {
  uploadDocumentToGemini,
  createGeminiCache,
  cleanupGeminiCache,
  cleanupGeminiFile,
  type GeminiCacheRef
} from '../_shared/llm-executor-gemini.ts'
import {
  executeOperationsParallel,
  getDefaultExecutionConfig
} from '../_shared/parallel-executor.ts'
import type {
  OperationSnapshot,
  DocumentSnapshot,
  ProcessorSettings,
  ExecutionConfig,
  LLMProvider
} from '../_shared/types.ts'

/**
 * CORS headers configuration
 */
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Chunk size moved to provider-specific execution_config (2025-11-08)
 * Now dynamically read from validai_llm_global_settings.execution_config.chunk_size
 * This allows per-provider optimization (Gemini: 25, Anthropic: 5, Mistral: 3)
 */

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
  gemini_file_name?: string  // File name for Gemini cleanup (valid 48 hours)
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
      let geminiFileName: string | null = null  // NEW: Store file name for cleanup
      let geminiCacheName: string | null = null
      let geminiFileMimeType: string | null = null

      if (provider === 'google') {
        console.log('Processor uses Google Gemini (SDK v1.29.0) - uploading document and creating cache before run...')

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

          // Initialize GoogleGenAI client (NEW SDK)
          const ai = new GoogleGenAI({ apiKey: geminiApiKey })

          // Download document
          const documentBuffer = await downloadDocument(supabase, document.storage_path)

          // Upload to Gemini File API (48-hour validity) - NEW SDK
          const geminiFileResult = await uploadDocumentToGemini(
            ai,  // NEW: Pass client instance
            documentBuffer,
            document.name,
            document.mime_type || 'application/pdf'
          )

          geminiFileUri = geminiFileResult.uri  // NEW: Changed from fileUri
          geminiFileName = geminiFileResult.name  // NEW: Store for cleanup
          geminiFileMimeType = geminiFileResult.mimeType

          console.log(`✅ Gemini document uploaded successfully (48h validity)`)
          console.log(`File URI: ${geminiFileUri}`)
          console.log(`File name: ${geminiFileName}`)

          // Check file size before attempting cache creation (50 KB threshold)
          const fileSizeKB = documentBuffer.byteLength / 1024
          const baseSystemPrompt = processor.configuration?.system_prompt ||
            'You are a helpful AI assistant that analyzes documents and provides structured responses.'

          if (fileSizeKB < 50) {
            // File too small - skip cache creation
            console.log(`[Gemini] File size: ${fileSizeKB.toFixed(1)} KB (below 50 KB threshold)`)
            console.log(`[Gemini] Skipping cache creation - will use direct file references`)
            console.log(`[Gemini] Operations will run without cache benefits (normal pricing applies)`)
            geminiCacheName = null
          } else {
            // File large enough - attempt cache creation
            console.log(`[Gemini] File size: ${fileSizeKB.toFixed(1)} KB - attempting cache creation`)

            try {
              geminiCacheName = await createGeminiCache(
                ai,  // NEW: Pass client instance
                llmConfig.model,
                geminiFileUri,
                geminiFileMimeType,
                baseSystemPrompt
              )

              console.log(`✅ Gemini cache created successfully (5min TTL)`)
              console.log(`Cache name: ${geminiCacheName}`)
              console.log(`Cache will be reused for all ${operations.length} operations (75% cost savings)`)

            } catch (cacheError: any) {
              // Check if error is about document being too small
              const isTooSmallError =
                cacheError.message?.includes('too small') ||
                cacheError.message?.includes('min_total_token_count')

              if (isTooSmallError) {
                // Extract token counts from error message
                const tokenMatch = cacheError.message?.match(/total_token_count=(\d+)/)
                const minMatch = cacheError.message?.match(/min_total_token_count=(\d+)/)
                const actualTokens = tokenMatch ? tokenMatch[1] : 'unknown'
                const minTokens = minMatch ? minMatch[1] : '2048'

                console.log(`[Gemini] Cache creation skipped: document has ${actualTokens} tokens (minimum: ${minTokens})`)
                console.log(`[Gemini] Will use direct file references instead`)
                geminiCacheName = null  // Continue without cache
              } else {
                // Real error - fail fast
                console.error(`❌ Failed to create Gemini cache: ${cacheError.message}`)
                throw cacheError
              }
            }
          }
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
        gemini_file_name: geminiFileName,  // NULL for non-Gemini (NEW: for cleanup)
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
        console.log(`Gemini file URI, name, and cache name stored in snapshot for reuse`)
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
      } else if (provider === 'google') {
        // Google API key resolution
        if (llmConfig.api_key_encrypted) {
          const { data: decryptedKey, error: decryptError } = await supabase.rpc('decrypt_api_key', {
            p_ciphertext: llmConfig.api_key_encrypted,
            p_org_id: llmConfig.organization_id
          })

          if (decryptError || !decryptedKey) {
            console.error(`Failed to decrypt Google API key: ${decryptError?.message}`)
            await supabase
              .from('validai_runs')
              .update({
                status: 'failed',
                error_message: 'Failed to decrypt Google API key',
                completed_at: new Date().toISOString()
              })
              .eq('id', backgroundBody.run_id)
            return new Response(
              JSON.stringify({ error: 'Failed to decrypt Google API key' }),
              { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }
          apiKey = decryptedKey
        } else {
          // Use global Google API key
          const globalKey = Deno.env.get('GOOGLE_API_KEY')
          if (!globalKey) {
            console.error('No Google API key available')
            await supabase
              .from('validai_runs')
              .update({
                status: 'failed',
                error_message: 'No Google API key available',
                completed_at: new Date().toISOString()
              })
              .eq('id', backgroundBody.run_id)
            return new Response(
              JSON.stringify({ error: 'No Google API key available' }),
              { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }
          apiKey = globalKey
        }
        console.log('Google API key resolved successfully')
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

      // Merge LLM config settings with snapshot overrides
      // Priority: snapshot.settings_override > llmConfig.settings > defaults
      const settings: ProcessorSettings = {
        // Provider (required for router)
        provider: provider as LLMProvider,

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

      // Fetch execution configuration for parallel execution
      let executionConfig: ExecutionConfig
      try {
        const { data: llmGlobalSettings, error: settingsError } = await supabase
          .from('validai_llm_global_settings')
          .select('execution_config')
          .eq('provider', provider)
          .eq('is_active', true)
          .limit(1)
          .single()

        if (settingsError || !llmGlobalSettings?.execution_config) {
          console.warn(`No execution config found in database for provider ${provider}, using defaults`)
          executionConfig = getDefaultExecutionConfig(provider as LLMProvider)
        } else {
          executionConfig = llmGlobalSettings.execution_config as ExecutionConfig
        }

        console.log(`Execution mode: ${executionConfig.execution_mode}`)
        console.log(`Max concurrency: ${executionConfig.max_concurrency}`)
        console.log(`Warmup operations: ${executionConfig.warmup_operations}`)
        console.log(`Batch delay: ${executionConfig.batch_delay_ms}ms`)
      } catch (error: any) {
        console.warn(`Failed to fetch execution config: ${error.message}, using defaults`)
        executionConfig = getDefaultExecutionConfig(provider as LLMProvider)
      }

      // Slice chunk using execution config's chunk_size
      const chunk = operations.slice(effectiveStartIndex, effectiveStartIndex + executionConfig.chunk_size)
      console.log(`Processing chunk: ${chunk.length} operations (${effectiveStartIndex} to ${effectiveStartIndex + chunk.length - 1})`)

      // Prepare document reference for executor
      // - Google: GeminiCacheRef object with fileUri + cacheName
      // - Mistral: signed URL (string)
      // - Anthropic Files API: file_id (string)
      // - Anthropic Legacy: document buffer (Buffer)
      let documentRef: string | GeminiCacheRef | any = null

      if (provider === 'google') {
        // Gemini path: construct GeminiCacheRef from snapshot
        const geminiFileUri = snapshot.gemini_file_uri || null
        const geminiFileName = snapshot.gemini_file_name || null  // NEW: for cleanup
        const geminiCacheName = snapshot.gemini_cache_name || null
        const geminiFileMimeType = snapshot.gemini_file_mime_type || 'application/pdf'

        if (!geminiFileUri) {
          throw new Error('Gemini file URI not found in snapshot')
        }

        // Cache name is optional (may be null for small files)
        if (geminiCacheName) {
          console.log(`✅ Reusing Gemini file and cache from snapshot`)
          console.log(`File URI: ${geminiFileUri.substring(0, 50)}...`)
          console.log(`Cache: ${geminiCacheName}`)
        } else {
          console.log(`✅ Reusing Gemini file from snapshot (no cache - document too small)`)
          console.log(`File URI: ${geminiFileUri.substring(0, 50)}...`)
        }

        documentRef = {
          fileUri: geminiFileUri,
          fileName: geminiFileName || '',  // NEW: Include fileName for cleanup
          cacheName: geminiCacheName,  // May be undefined
          mimeType: geminiFileMimeType
        } as GeminiCacheRef
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

      // Execute operations using parallel executor (provider-aware with real-time streaming)
      const operationResults = await executeOperationsParallel(
        chunk,
        {
          config: executionConfig,
          provider: provider as LLMProvider,
          startIndex: effectiveStartIndex,
          maxOperations: executionConfig.chunk_size,
          isFirstBatch: backgroundBody.start_index === 0
        },
        {
          document: snapshot.document,
          systemPrompt: snapshot.processor.system_prompt,
          settings,
          apiKey
        },
        supabase,
        documentRef,
        backgroundBody.run_id  // Pass run_id for immediate database writes (real-time streaming)
      )

      // Database writes already done in parallel executor (real-time streaming)
      // operationResults contains success/failure info for logging and error tracking
      const successCount = operationResults.filter(r => r.success).length
      const failureCount = operationResults.filter(r => !r.success).length

      console.log(`Chunk processing complete: ${successCount} succeeded, ${failureCount} failed`)

      // 6. Check if more chunks remain
      const hasMoreOperations = (effectiveStartIndex + executionConfig.chunk_size) < operations.length

      if (hasMoreOperations) {
        // Invoke next chunk
        const nextStartIndex = effectiveStartIndex + executionConfig.chunk_size
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

        // Cleanup Gemini cache and file if used (NEW SDK v1.29.0)
        if (provider === 'google') {
          console.log('Cleaning up Gemini cache and file...')

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
              // Initialize GoogleGenAI client (NEW SDK)
              const ai = new GoogleGenAI({ apiKey: geminiApiKey })

              // Cleanup cache (only if it was created)
              if (snapshot.gemini_cache_name) {
                await cleanupGeminiCache(ai, snapshot.gemini_cache_name)
                console.log('[Gemini] Cache cleanup completed')
              } else {
                console.log('[Gemini] No cache to cleanup (document was below size threshold)')
              }

              // Cleanup uploaded file (NEW)
              if (snapshot.gemini_file_name) {
                await cleanupGeminiFile(ai, snapshot.gemini_file_name)
                console.log('[Gemini] File cleanup completed')
              }
            } else {
              console.log('[Gemini] No API key available for cleanup (files will auto-expire)')
            }
          } catch (error: any) {
            // Non-critical error - cache will auto-expire in 5 minutes, file in 48 hours
            console.log(`[Gemini] Cleanup failed (non-critical): ${error.message}`)
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
