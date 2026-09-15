# GrowForge Digital — User Memory & Learning Engine Specification

> **Auto-Generated:** 2026-09-15T20:02:34.205Z  
> **Engine File:** `src/lib/userMemory.ts`  

## 1. Data Schema (`data/user_memories.json`)

```typescript
interface UserMemory {
  email: string;
  toneStyle: string;             // Writing style & tone preferences
  brandRules: string[];          // Core positive brand & operational rules
  strategicPreferences: string[];// Strategic channel, market, and pricing preferences
  pastOverrides: string[];       // Historical user modifications
  explicitRejections: string[];   // Negative constraints ('never do X', 'avoid Y')
  shadowObservations: string[];  // Unprompted learned patterns from feedback loops
  updatedAt: string;
}
```

## 2. Negative Constraint Parser & Deduplication

- **Rejection Triggers:** Automatically captures feedback matching `/(?:don't|do not|never|stop|avoid|no more|dislike)\s+(?:use|suggest|recommend|propose|do|include|add)?\s*([^,.!?\n]+)/gi` during plan revisions.
- **40-Character Prefix Normalization:** Deduplicates identical or closely matching constraints to keep context tokens compact.
- **Universal Prompt Injection:** `formatUserMemoryPrompt()` prepends learned rules directly to the Orchestrator and department agents.
