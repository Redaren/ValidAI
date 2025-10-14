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
 *
 * ## Architecture
 * - Initial invocation: Creates run with snapshot, returns immediately (HTTP 202)
 * - Background invocation: Processes chunk of operations, self-invokes for next chunk
 * - Uses shared llm-executor utility for all LLM calls
 * - Updates run progress atomically via increment_run_progress()
 *
 * @version 1.0.0
 * @since 2025-10-14
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { executeLLMOperationWithRetry } from '../_shared/llm-executor.ts'
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
 * Processes 10 operations per invocation to stay well under 25-minute timeout
 */
const CHUNK_SIZE = 10

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
        .from('processors')
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
        .from('operations')
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
        .from('documents')
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

      // 6. Create snapshot (frozen state)
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
        }
      }

      console.log(`Snapshot created: ${operations.length} operations, document: ${document.name}`)

      // 7. Create run record
      const { data: run, error: runError } = await supabase
        .from('runs')
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
        .from('runs')
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
          .from('runs')
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
          .from('runs')
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

      // 4. Decrypt API key
      let apiKey: string
      if (llmConfig.api_key_encrypted) {
        const { data: decryptedKey, error: decryptError } = await supabase.rpc('decrypt_api_key', {
          p_ciphertext: llmConfig.api_key_encrypted,
          p_org_id: llmConfig.organization_id
        })

        if (decryptError || !decryptedKey) {
          console.error(`Failed to decrypt API key: ${decryptError?.message}`)
          await supabase
            .from('runs')
            .update({
              status: 'failed',
              error_message: 'Failed to decrypt API key',
              completed_at: new Date().toISOString()
            })
            .eq('id', backgroundBody.run_id)
          return new Response(
            JSON.stringify({ error: 'Failed to decrypt API key' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
        apiKey = decryptedKey
      } else {
        // Use global API key
        const globalKey = Deno.env.get('ANTHROPIC_API_KEY')
        if (!globalKey) {
          console.error('No API key available')
          await supabase
            .from('runs')
            .update({
              status: 'failed',
              error_message: 'No API key available',
              completed_at: new Date().toISOString()
            })
            .eq('id', backgroundBody.run_id)
          return new Response(
            JSON.stringify({ error: 'No API key available' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
        apiKey = globalKey
      }

      console.log('API key resolved successfully')

      // 5. Process chunk of operations
      const operations = snapshot.operations
      const chunk = operations.slice(backgroundBody.start_index, backgroundBody.start_index + CHUNK_SIZE)

      console.log(`Processing chunk: ${chunk.length} operations (${backgroundBody.start_index} to ${backgroundBody.start_index + chunk.length - 1})`)

      // Get settings from snapshot
      const settings: ProcessorSettings = snapshot.processor.configuration?.settings_override || {}
      const enableCaching = settings.enable_caching !== false // Default: true

      for (const [chunkIndex, operation] of chunk.entries()) {
        const operationIndex = backgroundBody.start_index + chunkIndex

        console.log(`\n--- Processing Operation ${operationIndex + 1}/${operations.length} ---`)
        console.log(`Name: ${operation.name}`)
        console.log(`Type: ${operation.operation_type}`)

        try {
          // Create operation_result (pending)
          const { data: opResult, error: createError } = await supabase
            .from('operation_results')
            .insert({
              run_id: backgroundBody.run_id,
              operation_id: operation.id,
              operation_snapshot: operation,
              execution_order: operationIndex,
              status: 'pending'
            })
            .select()
            .single()

          if (createError || !opResult) {
            console.error(`Failed to create operation_result: ${createError?.message}`)
            continue
          }

          // Update to processing
          await supabase
            .from('operation_results')
            .update({
              status: 'processing',
              started_at: new Date().toISOString()
            })
            .eq('id', opResult.id)

          // Execute LLM operation with retry
          const result = await executeLLMOperationWithRetry(
            {
              operation,
              document: snapshot.document,
              systemPrompt: snapshot.processor.system_prompt,
              settings,
              apiKey,
              enableCache: enableCaching && operationIndex === 0 ? true : enableCaching // First op creates cache
            },
            supabase
          )

          console.log(`✅ Operation completed successfully`)
          console.log(`Response length: ${result.response.length} chars`)
          console.log(`Tokens: ${result.tokens.input} in, ${result.tokens.output} out`)
          if (result.cacheHit) {
            console.log(`💰 Cache hit: ${result.tokens.cached_read} tokens (90% savings)`)
          }

          // Update operation_result (completed)
          await supabase
            .from('operation_results')
            .update({
              status: 'completed',
              response_text: result.response,
              structured_output: result.structured_output,
              thinking_blocks: result.thinking_blocks,
              model_used: result.model,
              tokens_used: result.tokens,
              execution_time_ms: result.executionTime,
              cache_hit: result.cacheHit,
              completed_at: new Date().toISOString()
            })
            .eq('id', opResult.id)

          // Increment run progress
          await supabase.rpc('increment_run_progress', {
            p_run_id: backgroundBody.run_id,
            p_status: 'completed'
          })

        } catch (error: any) {
          // Operation failed (after retries)
          console.error(`❌ Operation failed: ${error.message}`)

          await supabase
            .from('operation_results')
            .update({
              status: 'failed',
              error_message: error.message,
              error_type: error.name || 'UnknownError',
              retry_count: error.retryCount || 0,
              completed_at: new Date().toISOString()
            })
            .eq('id', opResult.id)

          // Increment run progress (failed)
          await supabase.rpc('increment_run_progress', {
            p_run_id: backgroundBody.run_id,
            p_status: 'failed'
          })

          // Continue to next operation (don't stop run)
        }
      }

      console.log(`Chunk processing complete`)

      // 6. Check if more chunks remain
      const hasMoreOperations = (backgroundBody.start_index + CHUNK_SIZE) < operations.length

      if (hasMoreOperations) {
        // Invoke next chunk
        const nextStartIndex = backgroundBody.start_index + CHUNK_SIZE
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
          .from('runs')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString()
          })
          .eq('id', backgroundBody.run_id)
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
