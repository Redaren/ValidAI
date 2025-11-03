# ValidAI User Guide: Understanding Question Types

**A Non-Technical Guide to Document Processing with AI**

---

## Table of Contents
1. [How ValidAI Works](#how-validai-works)
2. [Understanding Processors & Operations](#understanding-processors--operations)
3. [The 7 Question Types](#the-7-question-types)
   - [Validation Questions](#1-validation-questions)
   - [Extraction Questions](#2-extraction-questions)
   - [Rating Questions](#3-rating-questions)
   - [Classification Questions](#4-classification-questions)
   - [Analysis Questions](#5-analysis-questions)
   - [Traffic Light Questions](#6-traffic-light-questions)
   - [Generic Questions](#7-generic-questions)
4. [Best Practices for Writing Prompts](#best-practices-for-writing-prompts)
5. [Quick Start Guide](#quick-start-guide)

---

## How ValidAI Works

ValidAI is a document processing platform that uses artificial intelligence to automatically analyze your documents and answer questions about them.

### The Basic Workflow

```
1. Upload Document → 2. Choose/Create Processor → 3. AI Processes Document → 4. View Results
```

**Think of it like this:**
- Your **document** is the input (contract, invoice, report, etc.)
- A **processor** is a reusable template/checklist of questions
- Each **operation** (or question) in the processor asks the AI something specific
- The AI reads your document and provides **structured answers** you can review

---

## Understanding Processors & Operations

### What is a Processor?

A **processor** is like a reusable template or workflow. It contains a set of operations (questions) that you want to run on documents of a similar type.

**Examples:**
- "Contract Review Processor" - contains 15 operations checking legal requirements
- "Invoice Validator" - contains 8 operations extracting payment details
- "Risk Assessment Processor" - contains 10 operations evaluating risks

### What is an Operation?

An **operation** is a single question or task you want the AI to perform on your document.

**Examples:**
- "Does this contract have a termination clause?" (Validation)
- "Extract all payment amounts mentioned" (Extraction)
- "Rate the clarity of this document from 1-10" (Rating)

### How They Work Together

1. You create a **processor** (e.g., "Employment Contract Checker")
2. You add multiple **operations** to it (questions about the contract)
3. You organize operations into **areas** (sections like "Compliance", "Financials", "Risks")
4. When you run the processor on a document, the AI answers all questions in order
5. You get a **results report** showing all answers

---

## The 7 Question Types

ValidAI offers 7 different "question types" (operation types). Each type is designed for a specific kind of task and gives you a specific format of answer.

---

### 1. Validation Questions ✓✗

**What it does:** Checks if something is true or false. The AI gives you a YES/NO answer with an explanation.

**When to use it:**
- Checking if a document meets requirements
- Verifying presence of specific clauses or sections
- Compliance checks
- Binary decisions

**What you get back:**
- **Result:** `true` or `false`
- **Explanation:** Why the AI made that decision

**Visual Output:**
```
✅ TRUE
"The document contains a confidentiality clause in Section 7, which clearly defines the obligations of both parties..."
```

#### ✅ Good Prompt Examples

**Example 1:**
```
"Does this employment contract include a non-compete clause that restricts the employee for more than 12 months?"
```
✅ **Why it's good:** Clear yes/no question with specific criteria (duration specified)

**Example 2:**
```
"Is the liability cap clearly stated and does it exceed $1,000,000?"
```
✅ **Why it's good:** Multiple criteria combined into one validation with specific threshold

**Example 3:**
```
"Does this document meet all requirements: signed by both parties, dated within the last 30 days, and notarized?"
```
✅ **Why it's good:** Comprehensive checklist of multiple requirements in one validation

#### ❌ Bad Prompt Examples

**Example 1:**
```
"Tell me about the termination clause"
```
❌ **Why it's bad:** Not a yes/no question - use Analysis or Generic instead

**Example 2:**
```
"Is this contract good?"
```
❌ **Why it's bad:** Too vague and subjective - what does "good" mean? Be specific about what you're validating

**Example 3:**
```
"Does it have problems?"
```
❌ **Why it's bad:** Open-ended and unclear - specify exactly what problems you're checking for

---

### 2. Extraction Questions 🔍

**What it does:** Pulls out specific pieces of information from the document and returns them as a list.

**When to use it:**
- Collecting dates, names, amounts, or other data points
- Finding all instances of something (e.g., all deadlines)
- Building a list from scattered information
- Gathering multiple items of the same type

**What you get back:**
- **Items:** A list of extracted information (strings)
- **Explanation:** Context about what was extracted and from where

**Visual Output:**
```
Items: [Payment Terms] [Net 30] [5% Early Payment Discount] [Late Fee: 2% per month]

Context: "Extracted all payment-related terms from Section 4 (Payment Conditions) and Section 9 (Penalties)..."
```

#### ✅ Good Prompt Examples

**Example 1:**
```
"Extract all monetary amounts mentioned in this invoice, including the currency."
```
✅ **Why it's good:** Clear what to extract and includes format details (currency)

**Example 2:**
```
"List all deadlines and milestone dates mentioned in this project agreement, in chronological order."
```
✅ **Why it's good:** Specific item type with helpful sorting instruction

**Example 3:**
```
"Extract the names and roles of all parties involved in this contract (e.g., 'John Smith - Contractor')."
```
✅ **Why it's good:** Specifies format for each extracted item, making results consistent

**Example 4:**
```
"Find all liability limitations or indemnification clauses. For each one, state the section number and the cap amount if specified."
```
✅ **Why it's good:** Clear what to find and what details to include for each item

#### ❌ Bad Prompt Examples

**Example 1:**
```
"Extract everything important"
```
❌ **Why it's bad:** "Important" is subjective - be specific about what data you need

**Example 2:**
```
"Get the date"
```
❌ **Why it's bad:** Which date? Documents often have many dates (signing date, effective date, expiration date, etc.)

**Example 3:**
```
"Is there a price?"
```
❌ **Why it's bad:** This is a yes/no question - use Validation instead, or rephrase: "Extract all prices mentioned"

**Example 4:**
```
"Extract information"
```
❌ **Why it's bad:** Too vague - what information? Specify exactly what you want extracted

---

### 3. Rating Questions ⭐

**What it does:** Scores something on a numerical scale. The AI gives you a number with an explanation.

**When to use it:**
- Scoring quality, clarity, completeness, or risk
- Comparing documents numerically
- Measuring subjective attributes
- Creating metrics

**What you get back:**
- **Value:** A number (e.g., 7.5, 8, 3)
- **Explanation:** Justification for that score

**Visual Output:**
```
━━━━━━━━━━━━━━━━━━━━━
      8.5 / 10
━━━━━━━━━━━━━━━━━━━━━

"The document scores 8.5/10 for clarity. It uses clear language and is well-organized, but Section 4 contains dense legal jargon that could be simplified..."
```

#### ✅ Good Prompt Examples

**Example 1:**
```
"Rate the completeness of this contract on a scale of 1-10, where 1 is missing critical sections and 10 has all expected clauses for a standard employment agreement."
```
✅ **Why it's good:** Clear scale definition with anchors for what 1 and 10 mean

**Example 2:**
```
"Score the readability of this document from 1-5, where 1 is full of jargon and complex sentences, and 5 is clear, simple language anyone could understand."
```
✅ **Why it's good:** Provides context for the scale and defines extremes

**Example 3:**
```
"Rate the risk level of this vendor contract from 0-100, where 0 is zero risk and 100 is maximum risk. Consider: liability caps, indemnification, termination rights, and payment terms."
```
✅ **Why it's good:** Specifies what factors to consider in the rating

**Example 4:**
```
"On a scale of 1-10, how favorable are the terms in this contract to our company? (1 = heavily favors the other party, 10 = heavily favors us)"
```
✅ **Why it's good:** Clear perspective and definition of the scale endpoints

#### ❌ Bad Prompt Examples

**Example 1:**
```
"Rate this document"
```
❌ **Why it's bad:** Rating what aspect? On what scale? What does each number mean?

**Example 2:**
```
"Give a score"
```
❌ **Why it's bad:** Score for what? Out of how much? No criteria specified

**Example 3:**
```
"How good is this contract from 1-10?"
```
❌ **Why it's bad:** "Good" is too vague - good in what way? Legal protection? Clarity? Fairness?

**Example 4:**
```
"Rate on a scale"
```
❌ **Why it's bad:** Missing the scale range, the attribute being rated, and what the numbers represent

---

### 4. Classification Questions 🏷️

**What it does:** Assigns the document to a category or type. The AI tells you which category it belongs to and why.

**When to use it:**
- Categorizing documents into types
- Determining document purpose or nature
- Routing documents to appropriate workflows
- Identifying document variants

**What you get back:**
- **Classification:** The assigned category (string)
- **Explanation:** Reasoning for the classification

**Visual Output:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Category: Employment Agreement - Full-Time
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

"Classified as a full-time employment agreement based on the presence of salary terms, benefits package, standard work hours (40/week), and permanent employment language in Section 2..."
```

#### ✅ Good Prompt Examples

**Example 1:**
```
"Classify this contract into one of the following categories: Service Agreement, Employment Contract, NDA, Partnership Agreement, Purchase Order, or Other. Base your decision on the primary purpose of the document."
```
✅ **Why it's good:** Provides specific categories to choose from with clear criteria

**Example 2:**
```
"What type of legal document is this? Classify it as one of: Contract, Invoice, Letter of Intent, Memo, Policy Document, Report, or Other."
```
✅ **Why it's good:** Clear, mutually exclusive categories with a catch-all option

**Example 3:**
```
"Classify the urgency level of this email as: Critical (action required within 24 hours), High (action required within 1 week), Medium (action required within 1 month), or Low (informational only)."
```
✅ **Why it's good:** Defines what each classification level means with actionable timelines

**Example 4:**
```
"Determine the contract type: Fixed-Price, Time-and-Materials, Retainer, or Hybrid. Look for payment structure and billing terms to make this determination."
```
✅ **Why it's good:** Tells the AI where to look (payment structure) to make the classification

#### ❌ Bad Prompt Examples

**Example 1:**
```
"What kind of document is this?"
```
❌ **Why it's bad:** Open-ended - provide specific categories to choose from

**Example 2:**
```
"Classify this"
```
❌ **Why it's bad:** Classify into what categories? Need to specify options

**Example 3:**
```
"Categorize based on type"
```
❌ **Why it's bad:** What types exist? Always provide the possible classifications

**Example 4:**
```
"Put this in a bucket"
```
❌ **Why it's bad:** Informal and unclear - what are the buckets? Be specific

---

### 5. Analysis Questions 📊

**What it does:** Provides a detailed, structured analysis with a main conclusion and supporting explanation.

**When to use it:**
- Deep dives into specific aspects
- Comprehensive reviews
- Multi-factor assessments
- Detailed findings with conclusions

**What you get back:**
- **Conclusion:** Main finding or summary (headline)
- **Analysis:** Detailed explanation, evidence, and supporting details

**Visual Output:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  CONCLUSION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
The contract meets compliance requirements with minor issues that should be addressed.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  DETAILED ANALYSIS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
The analysis reveals:

✅ Strengths:
• All required sections present (Sections 1-12)
• Liability cap clearly stated at $2M
• Termination rights balanced for both parties

⚠️ Issues to Address:
• Confidentiality clause (Section 8) lacks specific duration - recommend adding "2 years post-termination"
• Payment terms don't specify currency
• Force majeure clause could be more comprehensive

📋 Recommendation:
Request amendments to Sections 8 and 11 before signing.
```

#### ✅ Good Prompt Examples

**Example 1:**
```
"Analyze the risk profile of this vendor agreement. Consider: liability limitations, indemnification clauses, data security provisions, termination rights, and payment terms. Provide a conclusion about overall risk level and detailed findings for each area."
```
✅ **Why it's good:** Clear scope with specific factors to analyze and structured output request

**Example 2:**
```
"Conduct a fairness analysis of this employment contract from the employee's perspective. Evaluate: compensation, benefits, work hours, termination conditions, non-compete terms, and intellectual property rights. Conclude whether the terms are favorable, balanced, or unfavorable."
```
✅ **Why it's good:** Specific perspective, clear evaluation criteria, and requested conclusion format

**Example 3:**
```
"Analyze the completeness of this project proposal. Check for: scope definition, timeline, budget breakdown, deliverables, success metrics, and risk mitigation. Conclude whether it's ready for approval or needs additional detail."
```
✅ **Why it's good:** Checklist approach with actionable conclusion (ready or not ready)

**Example 4:**
```
"Review the payment terms in this contract and analyze: payment schedule, amounts, late payment penalties, early payment discounts, and dispute resolution for payment issues. Conclude whether the terms are clear and reasonable."
```
✅ **Why it's good:** Focused on specific aspect with multiple dimensions to analyze

#### ❌ Bad Prompt Examples

**Example 1:**
```
"Analyze this document"
```
❌ **Why it's bad:** Analyze what aspect? Too broad - specify what you want analyzed

**Example 2:**
```
"What do you think?"
```
❌ **Why it's bad:** Too informal and open-ended - provide specific analysis framework

**Example 3:**
```
"Is this okay?"
```
❌ **Why it's bad:** Use Validation for yes/no questions. Analysis needs specific criteria to evaluate

**Example 4:**
```
"Review everything"
```
❌ **Why it's bad:** "Everything" is too broad - focus on specific aspects for meaningful analysis

---

### 6. Traffic Light Questions 🚦

**What it does:** Provides a simple risk assessment using a traffic light system (Red = High Risk, Yellow = Medium Risk, Green = Low Risk).

**When to use it:**
- Quick risk assessments
- Go/no-go decisions
- Visual status indicators
- Flagging items for review

**What you get back:**
- **Status:** `red`, `yellow`, or `green`
- **Explanation:** Why that status was assigned

**Visual Output:**
```
🔴 RED - High Risk

"High risk identified due to missing liability cap, unlimited indemnification clause in Section 7, and lack of termination rights. This contract should not be signed without major amendments."
```

```
🟡 YELLOW - Medium Risk

"Medium risk due to some unclear payment terms and a 60-day payment window which is longer than standard. Recommend clarification before proceeding."
```

```
🟢 GREEN - Low Risk

"Low risk. All standard protections in place, terms are favorable, and liability is appropriately capped. Safe to proceed."
```

#### ✅ Good Prompt Examples

**Example 1:**
```
"Assess the risk level of this contract using traffic light colors:
- 🔴 Red (High Risk): Missing critical protections, unfavorable terms, or major legal concerns - DO NOT SIGN
- 🟡 Yellow (Medium Risk): Some issues or unclear terms that should be clarified - PROCEED WITH CAUTION
- 🟢 Green (Low Risk): All protections in place, terms are fair - SAFE TO PROCEED

Consider: liability caps, indemnification, termination rights, payment terms, and confidentiality."
```
✅ **Why it's good:** Clearly defines what each color means with specific criteria and factors to consider

**Example 2:**
```
"Evaluate this vendor agreement for security compliance using a traffic light system:
- Red: Major security gaps or non-compliance with our standards
- Yellow: Minor gaps or missing documentation that should be addressed
- Green: Meets or exceeds all security requirements

Check: data encryption, access controls, breach notification, data retention, and audit rights."
```
✅ **Why it's good:** Context-specific traffic light definitions with clear checklist

**Example 3:**
```
"Provide a traffic light status for timeline feasibility:
- Red: Timeline is unrealistic and likely to fail
- Yellow: Timeline is aggressive but achievable with some risk
- Green: Timeline has adequate buffer and is realistic

Evaluate based on the scope, resources mentioned, and industry standards."
```
✅ **Why it's good:** Domain-specific application with clear definitions and evaluation criteria

**Example 4:**
```
"Give a traffic light assessment for budget approval:
- Red: Budget concerns - significantly over estimate or missing critical cost categories
- Yellow: Budget is acceptable but has some areas needing clarification
- Green: Budget is complete, reasonable, and well-documented

Review all cost breakdowns and compare to stated scope."
```
✅ **Why it's good:** Specific use case with clear red/yellow/green thresholds

#### ❌ Bad Prompt Examples

**Example 1:**
```
"Give this a color"
```
❌ **Why it's bad:** What does each color represent? Define red/yellow/green meanings

**Example 2:**
```
"Is this red, yellow, or green?"
```
❌ **Why it's bad:** No context for what aspect is being assessed or what each color means

**Example 3:**
```
"Traffic light this"
```
❌ **Why it's bad:** Missing definitions for colors and criteria for assessment

**Example 4:**
```
"Check if it's safe"
```
❌ **Why it's bad:** Use this format but define what red/yellow/green represent in your context

---

### 7. Generic Questions 📝

**What it does:** Asks open-ended questions and gets free-form text responses. No structured format - just natural language.

**When to use it:**
- Exploratory questions
- Summarization
- Open-ended analysis
- Questions that don't fit other types
- Natural language explanations

**What you get back:**
- **Plain text response** (no structured format)

**Visual Output:**
```
This is a Master Service Agreement between Acme Corp and Widget Inc., effective January 15, 2024. The agreement establishes the framework for ongoing services over a 2-year period with automatic renewal. Key terms include monthly billing cycles, 30-day payment terms, and either party may terminate with 90 days written notice. The scope covers software development services with rates ranging from $150-250/hour depending on seniority level...
```

#### ✅ Good Prompt Examples

**Example 1:**
```
"Provide a 3-paragraph executive summary of this contract, including: who the parties are, what the agreement covers, key terms (duration, payment, termination), and any notable provisions."
```
✅ **Why it's good:** Structured request with specific elements to include in the summary

**Example 2:**
```
"Explain the warranty terms in plain language that a non-lawyer could understand. Include what is covered, duration, limitations, and process for claims."
```
✅ **Why it's good:** Clear audience (non-lawyer) and specific components to explain

**Example 3:**
```
"Summarize any unusual or non-standard clauses in this contract that deviate from typical industry agreements. For each unusual clause, explain why it might be problematic or beneficial."
```
✅ **Why it's good:** Focused on specific content (unusual items) with analysis component

**Example 4:**
```
"Describe the roles and responsibilities of each party in this agreement. List them separately and include any performance metrics or deliverables mentioned."
```
✅ **Why it's good:** Clear structure requested (separate by party) with specific details to include

#### ❌ Bad Prompt Examples

**Example 1:**
```
"Summarize"
```
❌ **Why it's bad:** How detailed? What aspects? Give more guidance on what to include

**Example 2:**
```
"What does it say?"
```
❌ **Why it's bad:** Too broad - specify what information you're looking for

**Example 3:**
```
"Explain"
```
❌ **Why it's bad:** Explain what specifically? The entire document? Certain sections?

**Example 4:**
```
"Tell me about this"
```
❌ **Why it's bad:** Too vague - be specific about what aspects you want to know about

**Better alternatives:** Use more structured question types when possible (e.g., Extraction to pull out specific data, Analysis for structured review)

---

## Best Practices for Writing Prompts

### 1. Be Specific

❌ **Vague:** "Check the dates"
✅ **Specific:** "Extract all dates mentioned in this contract, including: effective date, expiration date, payment due dates, and any milestone deadlines"

### 2. Provide Context

❌ **No context:** "Is this good?"
✅ **With context:** "Validate whether this vendor agreement meets our procurement standards: liability cap at least $1M, payment terms net 30 or better, and termination clause with 60-day notice"

### 3. Define Your Scale or Categories

❌ **Undefined:** "Rate the risk"
✅ **Defined:** "Rate the financial risk from 1-10, where 1 is minimal financial exposure (under $10k) and 10 is critical exposure (over $1M)"

### 4. Specify Format When It Matters

❌ **Unformatted:** "Get the names"
✅ **Formatted:** "Extract all party names in the format: 'Full Name - Role (e.g., John Smith - Contractor)'"

### 5. Break Complex Tasks into Multiple Operations

Instead of one giant question:
❌ "Analyze everything about this contract"

Use multiple focused operations:
✅ Operation 1: "Extract all payment terms and amounts" (Extraction)
✅ Operation 2: "Validate whether termination rights exist for both parties" (Validation)
✅ Operation 3: "Rate the clarity of language from 1-10" (Rating)
✅ Operation 4: "Traffic light assessment of overall risk" (Traffic Light)

### 6. Use the Right Question Type

Each type has a purpose - choose the one that matches your need:

| Your Goal | Best Type |
|-----------|-----------|
| Check if something exists | **Validation** |
| Pull out specific data | **Extraction** |
| Score or rate something | **Rating** |
| Assign to a category | **Classification** |
| Get detailed review | **Analysis** |
| Quick risk check | **Traffic Light** |
| Open-ended question | **Generic** |

### 7. Tell the AI Where to Look (Optional but Helpful)

✅ "Extract all payment amounts mentioned in Section 4 (Payment Terms) or Section 8 (Additional Fees)"

This helps the AI focus on relevant sections, though it can read the entire document.

### 8. Provide Examples When Helpful

✅ "Classify this contract type as one of: Service Agreement (ongoing services), Project Agreement (one-time project), Retainer (recurring monthly fee), or Other. For example, if it mentions monthly recurring payments and ongoing support, classify as Retainer."

### 9. Avoid Ambiguous Language

❌ Ambiguous: "Check if there are issues"
✅ Clear: "Validate whether this contract contains any of the following issues: missing signatures, liability exceeding $500k, payment terms longer than net 60, or missing confidentiality clause"

### 10. Test and Iterate

- Start with a few operations
- Run them on a sample document
- Review the results
- Refine your prompts based on what you get back
- Add more operations once the first few work well

---

## Quick Start Guide

### Step 1: Choose Your Document Type
Decide what kind of documents you'll be processing (contracts, invoices, reports, etc.)

### Step 2: Create a Processor
Give your processor a clear name like "Vendor Contract Review" or "Invoice Validation"

### Step 3: Organize into Areas
Create logical sections to group your operations:
- **Example for Contracts:** "Compliance", "Financial Terms", "Risk Assessment", "General Info"
- **Example for Invoices:** "Validation", "Extraction", "Categorization"

### Step 4: Add Operations
For each question you want to ask:
1. Choose the right question type
2. Write a clear, specific prompt following the examples above
3. Test it on a sample document

### Step 5: Test Your Processor
1. Upload a test document
2. Run the processor
3. Review the results
4. Refine any operations that didn't give you the results you expected

### Step 6: Use It Repeatedly
Once your processor works well:
- Use it on all similar documents
- You'll get consistent, structured results every time
- Make improvements based on edge cases you discover

---

## Quick Reference: Choosing the Right Question Type

**Need a YES/NO answer?** → Use **Validation** ✓✗

**Need to pull out specific information?** → Use **Extraction** 🔍

**Need to score something?** → Use **Rating** ⭐

**Need to categorize?** → Use **Classification** 🏷️

**Need detailed analysis with conclusion?** → Use **Analysis** 📊

**Need a quick risk assessment?** → Use **Traffic Light** 🚦

**Need an open-ended text answer?** → Use **Generic** 📝

---

## Tips for Success

### Start Small
Begin with 3-5 key operations that answer your most important questions. Add more over time.

### Be Consistent
Use the same prompt structure for similar operations across different processors. This makes results easier to compare.

### Use Areas Wisely
Group related operations together in areas. This makes large processors easier to manage and results easier to review.

### Review and Refine
The AI is very capable, but the quality of results depends on the quality of your prompts. If you don't get what you expected, refine the prompt and try again.

### Leverage Structured Types
Whenever possible, use structured types (Validation, Extraction, Rating, etc.) instead of Generic. Structured outputs are easier to work with, compare, and analyze.

---

## Need Help?

- Review this guide when writing new operations
- Look at the examples for the question type you're using
- Test on sample documents before processing large batches
- Iterate on your prompts based on results

**Remember:** The more specific and clear your prompts are, the better your results will be!
