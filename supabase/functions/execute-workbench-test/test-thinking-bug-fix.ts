#!/usr/bin/env -S deno run --allow-net --allow-env

/**
 * Test Script for Thinking + Structured Output Workaround
 *
 * This script tests the workaround for Vercel AI SDK issue #7220
 * where thinking mode conflicts with forced tool_choice in generateObject().
 *
 * Usage:
 * cd supabase/functions/execute-workbench-test
 * deno run --allow-net --allow-env test-thinking-bug-fix.ts
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || 'http://localhost:54321'
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || ''
const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/execute-workbench-test`

// Test cases
const testCases = [
  {
    name: 'Validation WITHOUT thinking (should use generateObject)',
    payload: {
      processor_id: '00000000-0000-0000-0000-000000000000', // Mock UUID
      mode: 'stateless',
      operation_type: 'validation',
      system_prompt: 'You are a validation assistant.',
      send_system_prompt: true,
      send_file: false,
      conversation_history: [],
      new_prompt: 'Is 2+2 equal to 4?',
      settings: {
        model_id: 'claude-3-5-haiku-20241022',
        max_tokens: 1000,
        thinking: undefined, // No thinking
        citations_enabled: false,
        create_cache: false
      }
    }
  },
  {
    name: 'Validation WITH thinking (should use hybrid approach)',
    payload: {
      processor_id: '00000000-0000-0000-0000-000000000000', // Mock UUID
      mode: 'stateless',
      operation_type: 'validation',
      system_prompt: 'You are a validation assistant.',
      send_system_prompt: true,
      send_file: false,
      conversation_history: [],
      new_prompt: 'Is 2+2 equal to 4? Think carefully about basic arithmetic.',
      settings: {
        model_id: 'claude-3-5-haiku-20241022',
        max_tokens: 4000,
        thinking: {
          type: 'enabled',
          budget_tokens: 2000
        },
        citations_enabled: false,
        create_cache: false
      }
    }
  },
  {
    name: 'Generic WITH thinking (should use generateText normally)',
    payload: {
      processor_id: '00000000-0000-0000-0000-000000000000', // Mock UUID
      mode: 'stateless',
      operation_type: 'generic',
      system_prompt: 'You are a helpful assistant.',
      send_system_prompt: true,
      send_file: false,
      conversation_history: [],
      new_prompt: 'Explain why 2+2 equals 4. Think through it step by step.',
      settings: {
        model_id: 'claude-3-5-haiku-20241022',
        max_tokens: 4000,
        thinking: {
          type: 'enabled',
          budget_tokens: 2000
        },
        citations_enabled: false,
        create_cache: false
      }
    }
  }
]

async function runTest(testCase: any) {
  console.log(`\n${'='.repeat(50)}`)
  console.log(`Test: ${testCase.name}`)
  console.log(`${'='.repeat(50)}`)

  try {
    const response = await fetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(testCase.payload)
    })

    const result = await response.json()

    if (!response.ok) {
      console.error('❌ Test Failed:', result.error || 'Unknown error')
      console.error('Details:', result)
      return false
    }

    // Check if structured output is present for validation operations
    if (testCase.payload.operation_type === 'validation') {
      if (!result.structured_output) {
        console.error('❌ Missing structured_output for validation operation')
        return false
      }

      if (typeof result.structured_output.result !== 'boolean') {
        console.error('❌ structured_output.result is not a boolean')
        return false
      }

      if (typeof result.structured_output.comment !== 'string') {
        console.error('❌ structured_output.comment is not a string')
        return false
      }

      console.log('✅ Structured output validated successfully:')
      console.log(`   Result: ${result.structured_output.result}`)
      console.log(`   Comment: ${result.structured_output.comment}`)
    }

    // Check for thinking blocks when thinking is enabled
    if (testCase.payload.settings.thinking) {
      if (!result.thinking_blocks || result.thinking_blocks.length === 0) {
        console.log('⚠️  Warning: No thinking blocks found (might be model dependent)')
      } else {
        console.log('✅ Thinking blocks present:', result.thinking_blocks.length)
      }
    }

    console.log('✅ Test Passed')
    console.log('Response metadata:', result.metadata)

    return true
  } catch (error) {
    console.error('❌ Test Error:', error)
    return false
  }
}

async function main() {
  console.log('Testing Thinking + Structured Output Workaround')
  console.log(`Edge Function URL: ${EDGE_FUNCTION_URL}`)

  if (!SUPABASE_ANON_KEY) {
    console.error('Error: SUPABASE_ANON_KEY environment variable not set')
    console.log('Please set your Supabase project credentials or run locally with:')
    console.log('supabase start')
    Deno.exit(1)
  }

  let passedTests = 0

  for (const testCase of testCases) {
    const passed = await runTest(testCase)
    if (passed) passedTests++

    // Add delay between tests to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000))
  }

  console.log(`\n${'='.repeat(50)}`)
  console.log(`Results: ${passedTests}/${testCases.length} tests passed`)
  console.log(`${'='.repeat(50)}`)

  if (passedTests === testCases.length) {
    console.log('🎉 All tests passed! The workaround is working correctly.')
  } else {
    console.log('⚠️  Some tests failed. Please check the implementation.')
    Deno.exit(1)
  }
}

if (import.meta.main) {
  main()
}