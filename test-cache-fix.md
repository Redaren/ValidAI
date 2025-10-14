# Edge Function Cache Fix Test Plan

## Summary of Changes

Fixed the prompt caching issue in the `execute-workbench-test` edge function by ensuring the `system` parameter is never used when cache control is needed.

### Root Cause
The function was incorrectly using BOTH:
1. System messages in the `messages` array (with cache control)
2. The `system` parameter passed to generateText/generateObject

This caused the Vercel AI SDK to ignore the cache control metadata because the `system` parameter takes precedence and cannot have cache control applied.

### The Fix
Modified the code to:
1. **Always use `messages` array** for system messages when ANY caching is involved (creating or using cache)
2. **Only use `system` parameter** for non-caching scenarios (stateless mode without cache)
3. **Conditionally include** the `system` parameter in API calls only when it's defined

### Code Changes

1. **Lines 270-334**: Updated system message handling logic
   - Added clear documentation about the requirement
   - Changed condition to use messages array for ANY caching scenario
   - Only use system parameter when no caching is involved

2. **Lines 612-656**: Fixed hybrid approach (generateText with tools)
   - Build params object first
   - Conditionally add system parameter only if defined

3. **Lines 690-711**: Fixed generateObject call
   - Build params object first
   - Conditionally add system parameter only if defined

4. **Lines 717-744**: Fixed main generateText call
   - Build params object first
   - Conditionally add system parameter only if defined

## Test Scenarios

### Scenario 1: Create New Cache (Should Work Now)
1. Set mode to "stateless"
2. Toggle "Send system prompt" ON
3. Add a system prompt with >1024 tokens
4. Toggle "Create cache" ON
5. Send a test message

**Expected**:
- Cache should be created (check `cachedWriteTokens` > 0 in response)
- System message should be in messages array with cache control
- No system parameter should be passed

### Scenario 2: Use Existing Cache (Should Work Now)
1. After Scenario 1, keep mode as "stateful"
2. Keep same system prompt
3. Toggle "Create cache" OFF
4. Send another message

**Expected**:
- Cache should be hit (check `cachedReadTokens` > 0 in response)
- System message should be in messages array WITHOUT cache control
- No system parameter should be passed

### Scenario 3: No Caching (Should Still Work)
1. Set mode to "stateless"
2. Toggle "Send system prompt" ON
3. Add a system prompt
4. Toggle "Create cache" OFF
5. Send a test message

**Expected**:
- No caching (both `cachedWriteTokens` and `cachedReadTokens` = 0)
- System parameter should be used (not in messages array)
- Works as before

## Verification in Console Logs

Look for these log messages:

### When Creating Cache:
```
System message added to messages array WITH cache control (creating cache)
System parameter: no
```

### When Using Existing Cache:
```
System message added to messages array WITHOUT cache control (using existing cache)
System parameter: no
```

### When No Caching:
```
System message using system parameter (no caching)
System parameter: yes
```

## Success Metrics

1. **Cache Write**: When "Create cache" is ON, response should show `cachedWriteTokens` > 0
2. **Cache Hit**: On subsequent messages with cache, response should show `cachedReadTokens` > 0
3. **Cost Savings**: Cache hits should show ~90% reduction in input tokens charged

## Deployment

After testing locally, deploy the edge function:
```bash
npx supabase functions deploy execute-workbench-test
```