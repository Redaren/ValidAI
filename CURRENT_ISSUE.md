# OCR Annotation Troubleshooting Summary

**Last Updated**: 2025-10-29 22:59 UTC
**Status**: 🔴 BLOCKED - Schema format rejection
**Feature**: Mistral OCR with structured annotations in workbench

---

## Current State

✅ **OCR works WITHOUT annotations** (basic markdown extraction)
❌ **OCR with annotations fails** - Mistral API rejects schema format

---

## Timeline of Attempts

### Version 82 - First Success ✅

**Date**: ~22:30 UTC
**Approach**: Used `responseFormatFromZodObject()` from Mistral SDK
**Schema**: ChaptersSchema with `.describe()` methods

```typescript
import { responseFormatFromZodObject } from 'npm:@mistralai/mistralai@1.10.0/extra/structChat.js'

const ChaptersSchema = z.object({
  language: z.string().describe("The language of the document."),
  chapter_titles: z.array(z.string()).describe("List of chapter titles found in the document."),
  urls: z.array(z.string()).describe("List of URLs found in the document."),
})

return responseFormatFromZodObject(ChaptersSchema)
```

**Result**: ✅ Schema ACCEPTED by Mistral API
**Error received**: "11 pages exceeds max 8 for annotations"
**Key insight**: This approach WORKED - the schema was valid!

---

### Version 83 - Extended Schemas

**Date**: ~22:45 UTC
**Changes**: Added `.describe()` methods to DatesSchema and ItemsSchema

```typescript
const DatesSchema = z.object({
  effective_date: z.string().describe("The effective date or start date of the contract."),
  expiration_date: z.string().describe("The expiration date or end date of the contract."),
  parties: z.array(z.object({
    name: z.string().describe("The name of the party or organization."),
    role: z.string().describe("The role of the party in the contract (e.g., buyer, seller, contractor, client).")
  })).describe("List of parties involved in the contract.")
})

const ItemsSchema = z.object({
  invoice_number: z.string().describe("The invoice or receipt number."),
  date: z.string().describe("The date of the invoice or transaction."),
  line_items: z.array(z.object({
    description: z.string().describe("Description of the item or service."),
    quantity: z.number().describe("Quantity of the item purchased."),
    unit_price: z.number().describe("Price per unit of the item."),
    amount: z.number().describe("Total amount for this line item (quantity × unit_price).")
  })).describe("List of line items on the invoice."),
  total: z.number().describe("The total amount of the invoice.")
})
```

**Result**: Unknown (tested with long document, hit 8-page limit before schema validation)

---

### Version 84 - Switched to zodToJsonSchema ❌

**Date**: ~22:55 UTC
**Reason**: Suspected `$schema` field was causing issues
**Approach**: Used `zod-to-json-schema` package instead of Mistral SDK helper

```typescript
import { zodToJsonSchema } from 'npm:zod-to-json-schema@3.23.0'

const jsonSchema = zodToJsonSchema(zodSchema, {
  target: 'openApi3',
  $refStrategy: 'none',
  definitions: undefined  // ← Caused crash
})

delete jsonSchema.$schema
return { type: 'json_schema', json_schema: jsonSchema }
```

**Result**: ❌ TypeError - `Cannot convert undefined or null to object`
**Root cause**: `definitions: undefined` caused `Object.entries()` to fail

---

### Version 85 - Fixed TypeError ❌

**Date**: ~22:58 UTC
**Fix**: Removed `definitions: undefined` line

```typescript
const jsonSchema = zodToJsonSchema(zodSchema, {
  target: 'openApi3',
  $refStrategy: 'none'
  // Removed problematic definitions line
})

delete jsonSchema.$schema
return { type: 'json_schema', json_schema: jsonSchema }
```

**Result**: ❌ "Please provide a json_schema for document_annotation_format"
**Analysis**: Mistral API completely rejects the schema produced by `zodToJsonSchema()`

---

## Key Findings

### ✅ What Works

1. **OCR without annotations** - Basic markdown extraction works perfectly
2. **`responseFormatFromZodObject()` approach** - Version 82 proved this works
3. **`.describe()` methods** - Required for semantic instructions to OCR model
4. **ChaptersSchema** - Simple structure (no nested objects) works

### ❌ What Fails

1. **`zodToJsonSchema()` output** - Consistently rejected by Mistral API
2. **Missing `.describe()` methods** - Schema lacks semantic meaning
3. **Documents over 8 pages** - Hard limit when annotations enabled
4. **Nested object schemas** - Unknown if DatesSchema/ItemsSchema work (untested with short doc)

### ⚠️ Unknown/Untested

1. Whether `responseFormatFromZodObject()` adds `$schema` field
2. Whether DatesSchema/ItemsSchema work with short documents
3. Exact format Mistral OCR API expects for nested objects
4. Whether `pages: [0,1,2,3,4,5,6,7]` parameter is required

---

## Current Theory

### Why Version 82 Worked

`responseFormatFromZodObject()` is the **official Mistral SDK helper**:
- Designed specifically for Mistral APIs
- Produces exact format Mistral expects
- Handles `.describe()` → `description` conversion correctly
- May include additional metadata/structure we're unaware of

### Why Version 85 Fails

`zodToJsonSchema()` is a **generic converter**:
- Not designed for Mistral's specific requirements
- Produces standard JSON Schema (OpenAPI 3.0 or Draft-07)
- Missing Mistral-specific fields or structure
- Incompatible output format

---

## Recommended Next Steps

### Option 1: Revert to Working Approach ⭐ RECOMMENDED

1. **Switch back to `responseFormatFromZodObject()`**
2. **Add debug logging** to see actual schema output
3. **Test with short document** (< 8 pages)
4. **If `$schema` field exists**, delete it conditionally
5. **Verify all three formats work** (chapters, dates, items)

**Rationale**: Version 82 worked. Don't fix what isn't broken.

### Option 2: Debug Current Approach

1. Add extensive logging to see `zodToJsonSchema()` output
2. Compare with `responseFormatFromZodObject()` output
3. Identify missing fields or wrong structure
4. Manually patch the schema

**Rationale**: Educational but time-consuming.

### Option 3: Manual Schema Construction

1. Capture working schema from version 82 via logging
2. Manually construct JSON Schema matching that exact format
3. Hardcode schemas for all three formats

**Rationale**: Most reliable but least maintainable. Last resort.

---

## Code Locations

### Main Files
- **Edge Function**: `supabase/functions/execute-workbench-test/index.ts`
- **Schema Definitions**: Lines 199-224
- **Conversion Function**: Lines 226-279
- **API Call**: Line 325 (`documentAnnotationFormat: annotationSchema`)

### Current Code (Version 85)

**Import:**
```typescript
import { zodToJsonSchema } from 'npm:zod-to-json-schema@3.23.0'
```

**Conversion Function:**
```typescript
function getAnnotationSchema(format: string) {
  let zodSchema: z.ZodObject<any> | undefined

  switch (format) {
    case 'none': return undefined
    case 'chapters': zodSchema = ChaptersSchema; break
    case 'dates': zodSchema = DatesSchema; break
    case 'items': zodSchema = ItemsSchema; break
    default: return undefined
  }

  const jsonSchema = zodToJsonSchema(zodSchema, {
    target: 'openApi3',
    $refStrategy: 'none'
  })

  if (jsonSchema.$schema) {
    delete jsonSchema.$schema
  }

  return {
    type: 'json_schema',
    json_schema: jsonSchema
  }
}
```

---

## Test Requirements

### Test Documents Needed

1. **Short document with chapters** (< 8 pages)
   - Contains table of contents
   - Has chapter titles
   - Includes URLs

2. **Short contract** (< 8 pages)
   - Has effective/expiration dates
   - Lists parties and their roles
   - Signed agreement

3. **Short invoice** (< 8 pages)
   - Invoice number and date
   - Line items with descriptions
   - Quantities, unit prices, amounts
   - Total amount

### Expected Behavior

When annotations work correctly:
```json
{
  "markdown": "# Document Content\n\nOCR extracted text...",
  "annotations": {
    "language": "English",
    "chapter_titles": ["Introduction", "Background", "Methodology"],
    "urls": ["https://example.com", "https://example.org"]
  }
}
```

---

## Open Questions

1. **Does `responseFormatFromZodObject()` add `$schema` field?**
   - Need to log output to confirm
   - If yes, can we delete it like we do with `zodToJsonSchema()`?

2. **What exact format does Mistral OCR expect?**
   - Need to capture working schema from version 82
   - Compare with current failing schema

3. **Why did version 82 work but version 85 doesn't?**
   - Same schemas (with `.describe()`)
   - Different conversion method
   - Different output format

4. **Do we need the `pages` parameter?**
   - Example in docs: `pages: Array.from({ length: 8 }, (_, i) => i)`
   - Required for pagination or just optional?

---

## Related Documentation

- **Mistral OCR Docs**: `C:\Users\johan\Downloads\OCR your Documents.md`
- **Official Example**: Uses `responseFormatFromZodObject(DocumentSchema)`
- **API Spec**: Document annotation format accepts `{ type: 'json_schema', json_schema: {...} }`

---

## Decision Point

**We need to decide**: Continue debugging `zodToJsonSchema()` or revert to `responseFormatFromZodObject()`?

**Recommendation**: Revert to version 82 approach (Option 1) with debug logging to understand what's actually happening.
