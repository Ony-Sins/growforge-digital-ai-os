# NORA conversational principle — dynamic expression, deterministic facts

Recorded 2026-10-05 (Claude Code, at the user's direction, during Overview V2-A). This is a cross-product requirement, not an
Overview detail. It is **not implemented yet**; V2-A only prepared the grounded fact layer it will sit on.

## The rule

NORA's ordinary dialogue must be **composed in real time**, per turn, from:

- the user's input and the conversation history
- the current surface (CORE / Explore / Dive In + lens / Systems)
- current system state (the deterministic Overview Snapshot and the other grounded sources)
- relevant memory / context
- interaction and session state
- recent linguistic / expression patterns (so wording does not repeat)

Her **greetings, acknowledgements, explanations, transitions, follow-up questions and wording** must NOT come from a small set of
preset phrases with variables substituted. No `"Good morning {name}"`, no `"You currently have {n} missions"`, no phrase library, no
template table, no fake humanization by variable substitution. The same underlying facts may be expressed many different ways.

**Stable personality, variable expression.**

## Knowing when not to speak

Silence is a valid response. NORA should decide whether anything useful needs saying at all.

- The user is actively talking to NORA and moves between lenses: she does **not** greet them again as if they had just arrived.
- The user returns after a meaningful absence: a contextual greeting may be appropriate.
- Nothing worth saying: say nothing.

## What stays deterministic (never generated, never paraphrased into something different)

- facts and counts, including what is and is not executing
- permissions and security boundaries
- financial values
- action confirmations
- execution state
- destructive-action requirements

Expression is generated; truth is not. A generated sentence may change how a fact is said, never what the fact is.

## Architecture this implies

```
REAL SYSTEM STATE
      |
Overview Snapshot            (lib/overviewSnapshot.ts: deterministic facts, codes, provenance, no prose)
      |
NORA communication / presentation plan      (future: decides whether to speak, what to include, in what order)
      |
text  +  voice  +  holographic visualization     (future: all three refer to the SAME grounded facts)
```

The snapshot deliberately contains no sentences: only codes (`mission.recorded_running_unconfirmed`), counts, raw entity labels,
priority with a reason, and provenance. A guard test (`scripts/test-overview-snapshot.ts`) fails if canned greeting or summary
phrasing is introduced into the snapshot modules.

## Future briefing capabilities this must support (approved direction, none built)

Brief me; quick / normal / detailed briefing; offering a brief automatically when meaningful changes exist; a concise first-arrival
summary when appropriate; natural interruption; follow-up questions; resuming a briefing; real-time dynamic wording; recent-expression
memory to reduce repetition. Shape of a briefing beat: fact -> what it means -> why it matters -> a simple explanation or scenario when
useful -> a possible next action.

## Visual explanation (future, not built)

NORA will later visualize what she is saying (execution pipeline for missions, charts for usage/finance, topology for agents and
departments, a simplified dependency diagram for system health, side-by-side surfaces for comparisons, abstract scenarios for simple
explanations). These must be driven by the same snapshot facts, never by independently generated decorative animation. No visual
hallucination. The center of Overview currently holds a temporary object; it is expected to be replaced by NORA's own living presence
(the "NORA Morph Field": idle / listening / thinking / retrieving / speaking / presenting / executing). CORE remains the true nucleus
of the CORE page.
