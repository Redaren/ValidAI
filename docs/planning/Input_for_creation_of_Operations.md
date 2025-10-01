# Input Requirements for Creating Operations

**VERSION 0.1** | **DATE: 2025-10-01** | **PHASE: 1.5**

## Executive Summary

This document analyzes the five operation types in ValidAI's document intelligence system to determine what configuration is required when creating operations, how each type behaves during Run execution, and whether a unified UI flow can support all operation types.

**Key Finding**: While all operation types share a common base structure, they have type-specific requirements that necessitate **dynamic form fields** based on the selected operation type. However, a **single unified form** with conditional sections can handle all types effectively.

---

## Table of Contents

1. [Operation Types Overview](#operation-types-overview)
2. [Common Fields (All Operation Types)](#common-fields-all-operation-types)
3. [Type-Specific Analysis](#type-specific-analysis)
   - [Extraction Operations](#1-extraction-operations)
   - [Validation Operations](#2-validation-operations)
   - [Rating Operations](#3-rating-operations)
   - [Classification Operations](#4-classification-operations)
   - [Analysis Operations](#5-analysis-operations)
4. [Run Execution Behavior](#run-execution-behavior)
5. [UI Flow Assessment](#ui-flow-assessment)
6. [Recommendations](#recommendations)

---

## Operation Types Overview

ValidAI supports five distinct operation types, each designed for a specific analysis pattern:

| Type | Purpose | Output | Evaluation |
|------|---------|--------|------------|
| **extraction** | Extract specific data values | Structured data | Schema validation |
| **validation** | Yes/no/boolean checks | Boolean + reasoning | Pass/fail criteria |
| **rating** | Numerical scores/assessments | Number + reasoning | Range validation |
| **classification** | Categorize into predefined options | Category + reasoning | Valid category check |
| **analysis** | Free-form analysis/summaries | Unstructured text | Optional keyword/sentiment |

---

## Common Fields (All Operation Types)

These fields are **required or applicable for ALL operation types**:

### Core Identification
| Field | Required | Type | Database Column | Purpose |
|-------|----------|------|-----------------|---------|
| **Name** | ✅ Yes | string | `name` | Identifies the operation (max 255 chars) |
| **Description** | ❌ No | string | `description` | Explains what the operation does |
| **Operation Type** | ✅ Yes | enum | `operation_type` | Determines behavior (extraction, validation, etc.) |

### Execution Configuration
| Field | Required | Type | Database Column | Purpose |
|-------|----------|------|-----------------|---------|
| **Prompt** | ✅ Yes | text | `prompt` | Instructions sent to LLM |
| **Position** | ✅ Yes | numeric | `position` | Ordering within area (auto-calculated) |

**Note**: The following fields are **NOT part of the creation UI** - they are auto-set or managed separately:
- `required`: Always set to `false` by default (not exposed in creation UI)
- `area`: Determined by which area the user adds the operation to (context-driven from button location)
- `configuration`: Set to `null` by default (inherits from processor-level configuration)

---

## Type-Specific Analysis

### 1. Extraction Operations

**Purpose**: Extract specific data values from documents (names, dates, amounts, clauses, etc.)

#### How It Works During Run

1. **LLM Call**: Prompt asks for specific data extraction
2. **Expected Response**: Structured JSON matching the output schema
3. **Parsing**: System parses LLM response into structured format
4. **Validation**: Checks if parsed data matches the output schema
5. **Storage**:
   - `raw_response`: Full LLM text response
   - `parsed_value`: Extracted structured data as JSONB
   - `evaluation_result`: "passed" if valid, "failed" if schema mismatch

#### Type-Specific Fields

| Field | Required | Database Column | Purpose | Example |
|-------|----------|-----------------|---------|---------|
| **Output Schema** | ⚠️ Strongly Recommended | `output_schema` | JSON Schema defining expected structure | `{"type": "object", "properties": {"amount": {"type": "number"}, "currency": {"type": "string"}}}` |
| **Validation Rules** | ❌ Optional | `validation_rules` | Additional validation constraints | `{"amount": {"min": 0, "required": true}}` |

#### Configuration During Creation

**Essential Questions to Ask User**:
1. What data do you want to extract?
2. What is the expected structure of the data?
3. Should specific fields be required?
4. Are there value constraints (min/max, format, etc.)?

**Prompt Template Guidance**:
```
"Extract [specific data] from this document. Return the result as JSON with the following structure: [schema]. Be precise and only extract explicitly stated information."
```

#### Example from Database
```json
{
  "name": "Extract payment terms",
  "operation_type": "extraction",
  "prompt": "Extract all payment terms including amounts, schedules, and conditions from this contract. Return as structured data.",
  "output_schema": {
    "type": "object",
    "properties": {
      "total_amount": {"type": "number"},
      "currency": {"type": "string"},
      "payment_schedule": {"type": "string"},
      "payment_terms": {"type": "string"}
    },
    "required": ["total_amount"]
  },
  "required": true
}
```

#### UI Considerations
- Need schema builder or JSON editor
- Consider visual schema designer for common patterns
- Validation rules editor for constraints
- Preview of expected output format

---

### 2. Validation Operations

**Purpose**: Yes/no checks, boolean assertions, presence/absence verification

#### How It Works During Run

1. **LLM Call**: Prompt asks yes/no question or boolean check
2. **Expected Response**: Boolean answer + reasoning
3. **Parsing**: Extracts boolean value (yes/no, true/false, present/absent)
4. **Evaluation**: Compares result against validation rules
5. **Storage**:
   - `raw_response`: Full LLM response with reasoning
   - `parsed_value`: `{"result": true/false, "reasoning": "..."}`
   - `evaluation_result`: Based on validation rules

#### Type-Specific Fields

| Field | Required | Database Column | Purpose | Example |
|-------|----------|-----------------|---------|---------|
| **Output Schema** | ⚠️ Recommended | `output_schema` | Defines boolean + reasoning structure | `{"type": "object", "properties": {"present": {"type": "boolean"}, "reasoning": {"type": "string"}}}` |
| **Validation Rules** | ⚠️ Important | `validation_rules` | Defines pass/fail criteria | `{"expected_value": true, "fail_if_absent": true}` |

#### Configuration During Creation

**Essential Questions to Ask User**:
1. What condition are you checking for?
2. What constitutes a "pass" vs "fail"?
3. Is this a safety-critical check?
4. Should absence/unclear cases fail or warn?

**Prompt Template Guidance**:
```
"Does this document contain/satisfy [condition]? Answer YES or NO and explain your reasoning."
```

#### Example from Database
```json
{
  "name": "Check compliance",
  "operation_type": "validation",
  "prompt": "Does this contract include proper confidentiality clauses as required by company policy? Answer YES or NO with justification.",
  "output_schema": {
    "type": "object",
    "properties": {
      "compliant": {"type": "boolean"},
      "reasoning": {"type": "string"}
    }
  },
  "validation_rules": {
    "expected_value": true,
    "severity": "critical"
  },
  "required": true
}
```

#### UI Considerations
- Simplified schema (boolean + reasoning is common pattern)
- Clear validation rules setup
- Expected value selector (true/false)
- Severity indicator (warning vs critical)

---

### 3. Rating Operations

**Purpose**: Numerical assessments, scores, quality ratings on a scale

#### How It Works During Run

1. **LLM Call**: Prompt asks for numerical rating on defined scale
2. **Expected Response**: Number + reasoning/justification
3. **Parsing**: Extracts numerical score
4. **Evaluation**: Validates score is within expected range
5. **Storage**:
   - `raw_response`: Full LLM response with justification
   - `parsed_value`: `{"score": 7, "reasoning": "...", "out_of": 10}`
   - `evaluation_result`: "passed" if in range, "warning" if borderline

#### Type-Specific Fields

| Field | Required | Database Column | Purpose | Example |
|-------|----------|-----------------|---------|---------|
| **Output Schema** | ⚠️ Strongly Recommended | `output_schema` | Defines score structure and range | `{"type": "object", "properties": {"score": {"type": "number", "minimum": 1, "maximum": 10}}}` |
| **Validation Rules** | ⚠️ Recommended | `validation_rules` | Defines acceptable score ranges | `{"min_acceptable": 5, "warn_below": 7, "scale": {"min": 1, "max": 10}}` |

#### Configuration During Creation

**Essential Questions to Ask User**:
1. What are you rating?
2. What is the scale? (1-5, 1-10, 0-100, etc.)
3. What score range is acceptable?
4. What score range triggers warnings?

**Prompt Template Guidance**:
```
"Rate [aspect] on a scale of [min] to [max], where [max] is [best description] and [min] is [worst description]. Provide the numerical score and detailed reasoning."
```

#### Example from Database
```json
{
  "name": "Rate contract clarity",
  "operation_type": "rating",
  "prompt": "Rate the clarity and readability of this contract from 1-10, where 10 is exceptionally clear. Provide reasoning for your score.",
  "output_schema": {
    "type": "object",
    "properties": {
      "score": {"type": "number", "minimum": 1, "maximum": 10},
      "reasoning": {"type": "string"}
    }
  },
  "validation_rules": {
    "scale": {"min": 1, "max": 10},
    "warn_below": 6,
    "fail_below": 3
  },
  "required": false
}
```

#### UI Considerations
- Scale range picker (min/max)
- Visual scale indicator
- Threshold configurator (pass/warn/fail boundaries)
- Common presets (1-5 stars, 1-10 scale, percentage)

---

### 4. Classification Operations

**Purpose**: Categorize documents or content into predefined categories

#### How It Works During Run

1. **LLM Call**: Prompt asks to classify into one of predefined categories
2. **Expected Response**: Category label + reasoning
3. **Parsing**: Extracts chosen category
4. **Evaluation**: Validates category is in allowed list
5. **Storage**:
   - `raw_response`: Full LLM response with justification
   - `parsed_value`: `{"category": "fixed-price", "confidence": "high", "reasoning": "..."}`
   - `evaluation_result`: "passed" if valid category, "failed" if not

#### Type-Specific Fields

| Field | Required | Database Column | Purpose | Example |
|-------|----------|-----------------|---------|---------|
| **Output Schema** | ✅ Required | `output_schema` | Defines allowed categories (enum) | `{"type": "object", "properties": {"category": {"type": "string", "enum": ["fixed-price", "time-and-materials", "retainer", "hybrid"]}}}` |
| **Validation Rules** | ❌ Optional | `validation_rules` | Confidence thresholds, category priority | `{"require_high_confidence": true, "allow_multiple": false}` |

#### Configuration During Creation

**Essential Questions to Ask User**:
1. What are you classifying?
2. What are the possible categories? (must be predefined)
3. Can multiple categories apply?
4. Is a confidence level required?

**Prompt Template Guidance**:
```
"Classify this document as one of the following: [category1], [category2], [category3]. Choose the single best match and explain your classification."
```

#### Example from Database
```json
{
  "name": "Identify contract type",
  "operation_type": "classification",
  "prompt": "Classify this contract as one of the following: fixed-price, time-and-materials, retainer, or hybrid. Explain your classification.",
  "output_schema": {
    "type": "object",
    "properties": {
      "contract_type": {
        "type": "string",
        "enum": ["fixed-price", "time-and-materials", "retainer", "hybrid"]
      },
      "confidence": {
        "type": "string",
        "enum": ["low", "medium", "high"]
      },
      "reasoning": {"type": "string"}
    },
    "required": ["contract_type", "reasoning"]
  },
  "required": true
}
```

#### UI Considerations
- Category list builder (add/remove/reorder)
- Visual category chips/tags
- Option for multi-classification
- Confidence level requirement toggle
- Category description tooltips

---

### 5. Analysis Operations

**Purpose**: Free-form analysis, summaries, explanations, assessments without rigid structure

#### How It Works During Run

1. **LLM Call**: Prompt asks for analysis/summary/explanation
2. **Expected Response**: Free-form text (markdown supported)
3. **Parsing**: Minimal - text is stored as-is
4. **Evaluation**: Optional keyword/sentiment checks
5. **Storage**:
   - `raw_response`: Full LLM analysis
   - `parsed_value`: `{"analysis": "...", "key_points": [...]}`
   - `evaluation_result`: Usually "passed" unless validation rules apply

#### Type-Specific Fields

| Field | Required | Database Column | Purpose | Example |
|-------|----------|-----------------|---------|---------|
| **Output Schema** | ❌ Optional | `output_schema` | Optional structure for analysis | `{"type": "object", "properties": {"summary": {"type": "string"}, "key_points": {"type": "array"}}}` |
| **Validation Rules** | ❌ Optional | `validation_rules` | Keyword presence, sentiment, length | `{"min_length": 100, "required_keywords": ["risk", "concern"]}` |

#### Configuration During Creation

**Essential Questions to Ask User**:
1. What aspect should be analyzed?
2. What level of detail? (brief, detailed, comprehensive)
3. Specific focus areas? (risks, benefits, compliance, etc.)
4. Output format preference? (bullet points, paragraphs, structured)

**Prompt Template Guidance**:
```
"Provide a [brief/detailed] analysis of [aspect]. Focus on [specific concerns]. Format as [bullet points/paragraphs]."
```

#### Example from Database
```json
{
  "name": "Summarize key risks",
  "operation_type": "analysis",
  "prompt": "Provide a brief summary (3-5 bullet points) of the main risks and concerns in this contract from the service provider perspective.",
  "output_schema": {
    "type": "object",
    "properties": {
      "risks": {
        "type": "array",
        "items": {"type": "string"}
      },
      "overall_assessment": {"type": "string"}
    }
  },
  "validation_rules": {
    "min_risks": 1,
    "max_risks": 5
  },
  "required": false
}
```

#### UI Considerations
- Simplest form - primarily prompt-focused
- Optional structure hints
- Output format selector (prose, bullets, structured)
- Minimum/maximum length guidance
- Focus area multi-select

---

## Run Execution Behavior

### General Execution Flow for All Operations

When a Run is triggered for a document:

```
1. Run Record Created
   ├─ Status: "pending"
   ├─ Processor snapshot stored
   └─ Operation list retrieved (ordered by area, position)

2. For Each Operation (Sequential Execution)
   ├─ Status: "processing"
   ├─ Build LLM Request
   │  ├─ System Prompt (from processor)
   │  ├─ Operation Prompt
   │  ├─ Document Content
   │  └─ Configuration (temperature, model, etc.)
   │
   ├─ Call LLM API
   │  ├─ Send request
   │  ├─ Track tokens (input + output)
   │  ├─ Track timing
   │  └─ Handle errors
   │
   ├─ Process Response
   │  ├─ Store raw_response
   │  ├─ Parse according to operation_type
   │  ├─ Extract structured data → parsed_value
   │  └─ Validate against output_schema
   │
   ├─ Evaluate Result
   │  ├─ Apply validation_rules
   │  ├─ Determine evaluation_result (passed/failed/warning/not_applicable)
   │  └─ Store evaluation_details
   │
   └─ Create Operation Result Record
      ├─ Status: "success" or "failed"
      ├─ All data + metadata stored
      └─ Continue to next operation

3. Run Completion
   ├─ Status: "completed" or "failed"
   ├─ Aggregate costs/tokens
   └─ Mark completion timestamp
```

### Type-Specific Parsing Logic

| Operation Type | Parsing Strategy | Success Criteria |
|----------------|------------------|------------------|
| **extraction** | JSON extraction → validate against schema | Valid JSON matching schema |
| **validation** | Boolean detection (yes/no/true/false) | Boolean value extracted |
| **rating** | Number extraction → range validation | Number within defined scale |
| **classification** | Category matching → enum validation | Category in allowed list |
| **analysis** | Text extraction → optional structure | Text present, optional checks pass |

### Error Handling

Each operation can fail at multiple stages:

1. **LLM API Error**: Network, rate limit, timeout
   - Status: "failed"
   - Error message stored
   - Evaluation: N/A

2. **Parsing Error**: Response doesn't match expected format
   - Status: "failed"
   - Raw response stored
   - Evaluation: "failed"

3. **Validation Error**: Response parses but fails validation
   - Status: "success" (API call succeeded)
   - Evaluation: "failed"
   - Details explain why

4. **Required Operation Failure**: If operation.required = true and fails
   - Entire run marked as problematic
   - Remaining operations may be skipped (design decision)

---

## UI Flow Assessment

### Can We Use a Single Form for All Operation Types?

**Answer: YES, with Dynamic Fields** ✅

### Unified Form Structure

```
┌─────────────────────────────────────────────────────────┐
│ Add Operation                                           │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ ESSENTIAL INFORMATION                                   │
│ ├─ Operation Type* [Dropdown]                          │
│ │   └─ extraction / validation / rating /              │
│ │       classification / analysis                      │
│ ├─ Name* [Text Input]                                  │
│ └─ Description [Textarea]                              │
│                                                         │
│ INSTRUCTIONS                                            │
│ └─ Prompt* [Textarea with AI guidance]                 │
│     └─ Template suggestions based on operation type    │
│                                                         │
│ ═══ DYNAMIC SECTION (based on operation type) ═══      │
│                                                         │
│ [IF extraction]                                         │
│   OUTPUT STRUCTURE                                      │
│   ├─ Output Schema* [JSON Editor or Visual Builder]    │
│   └─ Validation Rules [JSON Editor]                    │
│                                                         │
│ [IF validation]                                         │
│   VALIDATION CRITERIA                                   │
│   ├─ Output Schema [Simplified: boolean + reasoning]   │
│   ├─ Expected Value* [true/false]                      │
│   └─ Severity [warning/critical]                       │
│                                                         │
│ [IF rating]                                             │
│   RATING CONFIGURATION                                  │
│   ├─ Scale Range* [Min: _ Max: _]                      │
│   ├─ Warning Threshold [Number]                        │
│   └─ Failure Threshold [Number]                        │
│                                                         │
│ [IF classification]                                     │
│   CLASSIFICATION OPTIONS                                │
│   ├─ Categories* [Tag Input - Add/Remove]              │
│   ├─ Allow Multiple [Checkbox]                         │
│   └─ Require Confidence [Checkbox]                     │
│                                                         │
│ [IF analysis]                                           │
│   ANALYSIS CONFIGURATION                                │
│   ├─ Output Format [prose/bullets/structured]          │
│   ├─ Minimum Length [Number] (optional)                │
│   └─ Focus Areas [Multi-select Tags] (optional)        │
│                                                         │
│ ═══════════════════════════════════════════════════    │
│                                                         │
│ [Cancel] [Create Operation]                            │
└─────────────────────────────────────────────────────────┘
```

### Implementation Strategy

**1. Shared Base Form Component**
```typescript
// Common fields visible in creation UI
- Operation Type (drives conditional rendering)
- Name
- Description
- Prompt

// Auto-set fields (not in form UI)
- Area: from context (which area user clicked "Add" from)
- Position: auto-calculated (max position in area + 1)
- Required: defaults to false
- Configuration: defaults to null (inherits processor settings)
```

**2. Type-Specific Sub-Components**
```typescript
// Conditional rendering based on operation_type
<ExtractionFields />     // Schema builder
<ValidationFields />     // Expected value, severity
<RatingFields />         // Scale, thresholds
<ClassificationFields /> // Category list
<AnalysisFields />       // Format, focus areas
```

**3. Dynamic Schema Generation**
```typescript
// Generate appropriate output_schema based on type
generateOutputSchema(operationType: string, typeConfig: any): JSONSchema
```

**4. Validation Rules Builder**
```typescript
// Generate validation_rules based on type-specific inputs
generateValidationRules(operationType: string, criteria: any): ValidationRules
```

### User Experience Flow

```
1. User clicks "Add Operation" button (within a specific area)
   └─ Sheet/Dialog opens with form
   └─ Area context is captured (operation will be added to THIS area)

2. User selects Operation Type
   └─ Form dynamically shows relevant fields
   └─ Prompt field shows template suggestions
   └─ Help text updates contextually

3. User fills required fields
   └─ Real-time validation feedback
   └─ Schema preview (for structured types)

4. User reviews and submits
   └─ Operation created with auto-set values:
       • Area: from button context (which area user was in)
       • Position: max position in area + 1
       • Required: false (default)
       • Configuration: null (inherits from processor)
   └─ UI updates to show new operation card in that area
```

---

## Recommendations

### 1. UI Implementation Approach

✅ **Use a Single Unified Form with Dynamic Sections**
- More maintainable than separate forms per type
- Better UX - users learn one interface
- Easier to add new operation types
- Conditional rendering based on `operation_type`

### 2. Smart Defaults and Templates

**Provide operation-type-specific templates**:
```typescript
const templates = {
  extraction: {
    prompt: "Extract [data_point] from this document. Return as JSON: {...}",
    output_schema: { type: "object", properties: {} }
  },
  validation: {
    prompt: "Does this document contain [element]? Answer YES or NO.",
    output_schema: {
      type: "object",
      properties: {
        result: { type: "boolean" },
        reasoning: { type: "string" }
      }
    }
  },
  // ... etc
}
```

### 3. Progressive Disclosure

**Start simple, reveal complexity as needed**:
- Default view: Type, Name, Prompt
- One click: Show type-specific fields
- Advanced: Show LLM configuration

### 4. Visual Schema Builders

**For structured types (extraction, classification, rating)**:
- Visual JSON schema builder for extraction
- Category chip input for classification
- Slider with thresholds for rating
- Reduces errors, improves UX

### 5. Validation Strategy

**Client-side validation**:
```typescript
// Zod schemas per operation type
const extractionOperationSchema = z.object({
  name: nameSchema,
  operation_type: z.literal('extraction'),
  prompt: promptSchema,
  output_schema: jsonSchemaValidator, // Custom validator
  // ...
})
```

**Server-side validation**:
- Database constraints (name length, required fields)
- RLS policies (organization isolation)
- Schema validity checks

### 6. Field Requirements Summary (Creation UI Only)

**Fields in Creation Form**:
| Field | extraction | validation | rating | classification | analysis |
|-------|-----------|------------|--------|----------------|----------|
| Name | ✅ Required | ✅ Required | ✅ Required | ✅ Required | ✅ Required |
| Description | Optional | Optional | Optional | Optional | Optional |
| Operation Type | ✅ Required | ✅ Required | ✅ Required | ✅ Required | ✅ Required |
| Prompt | ✅ Required | ✅ Required | ✅ Required | ✅ Required | ✅ Required |
| Output Schema | ⚠️ Strongly Rec | ⚠️ Recommended | ⚠️ Strongly Rec | ✅ Required | Optional |
| Validation Rules | Optional | ⚠️ Important | ⚠️ Recommended | Optional | Optional |

**Not in Creation UI** (auto-set):
- `required`: Always set to `false` by default
- `area`: Determined from button context (which area user clicked from)
- `position`: Auto-calculated (max position in target area + 1)
- `configuration`: Set to `null` (inherits processor defaults)

### 7. Database Considerations

**When creating an operation** (auto-set by system):
1. `area`: Determined by which area the "Add Operation" button was clicked from
2. `position`: Auto-calculated as (max position in target area + 1)
3. `required`: Set to `false` by default
4. `configuration`: Set to `null` (inherits from processor)
5. `output_schema`: Validate is valid JSON Schema (if provided)
6. Ensure target `area` exists in processor's `area_configuration`

**Consider adding** (post-MVP):
- `created_by` field to track who created each operation
- `version` field for operation evolution tracking

### 8. Testing Strategy

**Test each operation type**:
- Valid creation with all required fields
- Missing required fields (should fail)
- Invalid schemas (should fail)
- Execution with mock LLM responses
- Parsing and validation logic

---

## Appendix: Example Payloads

### Extraction Operation Payload
```json
{
  "processor_id": "uuid",
  "name": "Extract contract parties",
  "description": "Identifies all parties involved in the contract",
  "operation_type": "extraction",
  "prompt": "Extract all parties from this contract including their roles. Return as JSON.",
  "output_schema": {
    "type": "object",
    "properties": {
      "parties": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "name": {"type": "string"},
            "role": {"type": "string"},
            "address": {"type": "string"}
          },
          "required": ["name", "role"]
        }
      }
    }
  },
  "validation_rules": {
    "min_parties": 2
  },
  "area": "Extractions",
  "position": 1.0,
  "required": true
}
```

### Validation Operation Payload
```json
{
  "processor_id": "uuid",
  "name": "Check termination clause",
  "description": "Verifies presence of proper termination conditions",
  "operation_type": "validation",
  "prompt": "Does this contract include clear termination conditions for both parties? Answer YES or NO with explanation.",
  "output_schema": {
    "type": "object",
    "properties": {
      "present": {"type": "boolean"},
      "reasoning": {"type": "string"}
    },
    "required": ["present", "reasoning"]
  },
  "validation_rules": {
    "expected_value": true,
    "severity": "warning"
  },
  "area": "Validations",
  "position": 2.0,
  "required": false
}
```

### Rating Operation Payload
```json
{
  "processor_id": "uuid",
  "name": "Rate legal risk",
  "description": "Assesses overall legal risk on 1-10 scale",
  "operation_type": "rating",
  "prompt": "Rate the overall legal risk of this contract from 1 (very low risk) to 10 (very high risk). Consider liability, indemnification, and termination clauses.",
  "output_schema": {
    "type": "object",
    "properties": {
      "score": {"type": "number", "minimum": 1, "maximum": 10},
      "reasoning": {"type": "string"},
      "key_concerns": {"type": "array", "items": {"type": "string"}}
    }
  },
  "validation_rules": {
    "scale": {"min": 1, "max": 10},
    "warn_above": 7,
    "fail_above": 9
  },
  "area": "Assessments",
  "position": 3.0,
  "required": true
}
```

### Classification Operation Payload
```json
{
  "processor_id": "uuid",
  "name": "Classify urgency",
  "description": "Determines how urgently this contract needs review",
  "operation_type": "classification",
  "prompt": "Classify the urgency of this contract review as: immediate, high, medium, or low priority. Consider deadline mentions and risk factors.",
  "output_schema": {
    "type": "object",
    "properties": {
      "urgency": {
        "type": "string",
        "enum": ["immediate", "high", "medium", "low"]
      },
      "reasoning": {"type": "string"}
    },
    "required": ["urgency", "reasoning"]
  },
  "validation_rules": {
    "allow_multiple": false
  },
  "area": "Classifications",
  "position": 4.0,
  "required": false
}
```

### Analysis Operation Payload
```json
{
  "processor_id": "uuid",
  "name": "Analyze payment structure",
  "description": "Provides detailed analysis of payment terms and conditions",
  "operation_type": "analysis",
  "prompt": "Provide a comprehensive analysis of the payment structure in this contract. Include payment amounts, schedules, conditions, penalties, and any unusual terms. Format as markdown with clear sections.",
  "output_schema": {
    "type": "object",
    "properties": {
      "analysis": {"type": "string"},
      "concerns": {"type": "array", "items": {"type": "string"}},
      "recommendations": {"type": "array", "items": {"type": "string"}}
    }
  },
  "validation_rules": {
    "min_length": 200,
    "required_sections": ["payment_amounts", "schedule", "conditions"]
  },
  "area": "Analysis",
  "position": 5.0,
  "required": false
}
```

---

## Implementation Checklist

### Phase 1: Core Form (All Types)
- [ ] Create operation form component with base fields
- [ ] Implement operation type selector
- [ ] Add name, description, prompt fields
- [ ] Receive area context from button location (not a form field)
- [ ] Auto-calculate position (max in target area + 1)
- [ ] Implement form validation with Zod
- [ ] Connect to `create_operation` mutation

### Phase 2: Type-Specific Fields
- [ ] Create `ExtractionFields` component (schema builder)
- [ ] Create `ValidationFields` component (expected value, severity)
- [ ] Create `RatingFields` component (scale, thresholds)
- [ ] Create `ClassificationFields` component (category manager)
- [ ] Create `AnalysisFields` component (format, focus areas)
- [ ] Implement conditional rendering logic

### Phase 3: Enhanced UX
- [ ] Add prompt templates per operation type
- [ ] Create visual schema builder for extraction
- [ ] Add category chip input for classification
- [ ] Implement scale slider for rating
- [ ] Add help text and tooltips per field
- [ ] Implement schema preview/validation

### Phase 4: Post-Creation Features (Separate from Creation)
- [ ] Implement schema validation (client + server)
- [ ] Add operation templates/presets library
- [ ] Enable operation duplication
- [ ] Add operation import/export
- [ ] Add edit operation UI (may expose advanced fields like `required`, `configuration`)

### Phase 5: Testing & Polish
- [ ] Unit tests for form validation
- [ ] Integration tests for operation creation
- [ ] Test each operation type creation
- [ ] Test schema validation edge cases
- [ ] UX testing and refinement

---

## Conclusion

**The "Add Operation" UI should be a single, intelligent form that adapts based on the selected operation type.** While each operation type has unique requirements, they share enough commonality that a unified interface provides the best user experience.

**Key Success Factors**:
1. **Clear operation type selection** upfront (drives entire form)
2. **Smart defaults and templates** reduce user effort
3. **Progressive disclosure** keeps simple things simple
4. **Visual schema builders** for complex types (extraction, classification)
5. **Real-time validation** prevents errors before submission
6. **Contextual help** guides users through type-specific requirements

This approach balances **flexibility** (supporting all five operation types) with **usability** (single, learnable interface) while maintaining **extensibility** (easy to add new operation types in the future).

---

**Document Status**: Ready for implementation
**Next Steps**: Begin Phase 1 implementation of core form component
**Stakeholder Review**: Recommended before proceeding to Phase 2
