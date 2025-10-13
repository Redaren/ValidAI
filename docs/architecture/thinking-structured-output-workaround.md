# Thinking + Structured Output Workaround

**Date:** 2025-10-13
**Issue:** Vercel AI SDK #7220
**Status:** Implemented (Temporary Workaround)
**Last Updated:** 2025-10-13 - Fixed AI SDK v5 compatibility

## Problem

When using the Vercel AI SDK with Anthropic models, there's a conflict when trying to use both:
1. **Thinking mode** (`providerOptions.anthropic.thinking`)
2. **Structured outputs** (`generateObject()` with a schema)

The error occurs because:
- `generateObject()` automatically sets `tool_choice: {type: 'tool', name: 'json'}` to force tool use
- Anthropic's API doesn't allow thinking mode when tool_choice forces tool use
- This results in: `"Thinking may not be enabled when tool_choice forces tool use"`

## Solution

We implemented a hybrid approach that detects when both thinking and structured output are requested, and uses `generateText()` with manual tool definition instead of `generateObject()`.

### Implementation Details

**Location:** `supabase/functions/execute-workbench-test/index.ts`

**Detection Logic:**
```typescript
const useHybridApproach = useStructuredOutput && outputSchema && body.settings.thinking
```

**Three Execution Paths:**

1. **Hybrid Path** (Thinking + Structured Output):
   - Uses `generateText()` with manual tool definition
   - Sets `toolChoice: 'auto'` instead of forced
   - Adds prompt instruction to use the JSON tool
   - Extracts structured data from tool calls
   - Validates against original Zod schema

2. **Normal Structured Path** (No Thinking):
   - Uses standard `generateObject()` with schema
   - Works as originally designed
   - Direct schema validation by SDK

3. **Generic Path** (No Structure):
   - Uses `generateText()` for free-form responses
   - Supports thinking mode naturally

### Code Changes

The workaround adds approximately 70 lines of code that:

1. **Convert Zod schema to JSON Schema** for tool definition
2. **Append instruction** to the user message to use the JSON tool
3. **Parse tool calls** from the response
4. **Validate extracted data** against the original schema
5. **Fallback to JSON extraction** from text if needed

### Testing

A test script is provided at `supabase/functions/execute-workbench-test/test-thinking-bug-fix.ts` that validates:

- Validation without thinking (uses generateObject)
- Validation with thinking (uses hybrid approach)
- Generic with thinking (uses generateText normally)

## When to Remove

This workaround should be removed when:

1. Vercel AI SDK fixes issue #7220
2. The SDK allows thinking mode with forced tool choice
3. Or provides an alternative API for structured outputs with thinking

To remove the workaround:

1. Delete the `useHybridApproach` condition and hybrid path
2. Re-enable thinking in the `generateObject()` providerOptions
3. Remove the test script
4. Delete this documentation file

## Impact

- **Performance:** Minimal - adds negligible processing time
- **Accuracy:** Maintained - same validation logic applies
- **User Experience:** Improved - users can now use thinking with validation
- **Maintainability:** Code is isolated and clearly marked as workaround

## References

- GitHub Issue: https://github.com/vercel/ai/issues/7220
- Similar workarounds by community members: @zmays, @aminelemaizi
- Anthropic API Documentation on thinking mode
- Vercel AI SDK documentation on generateObject

## Version Compatibility Updates

### AI SDK v5 Compatibility (2025-10-13)

Fixed compatibility with AI SDK v5 which renamed several properties:
- Changed `parameters` → `inputSchema` in tool definitions
- Added `jsonSchema` helper import and usage
- Wrapped JSON schema with `jsonSchema()` function as required by v5

This ensures the workaround continues to function with the latest AI SDK version.

## Notes

- The workaround is production-ready and thoroughly tested
- All existing features (caching, citations, etc.) continue to work
- The hybrid approach is only activated when necessary
- Code is well-commented to explain the temporary nature
- Compatible with AI SDK v5 (latest)