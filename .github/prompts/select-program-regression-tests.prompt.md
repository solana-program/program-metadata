---
name: Select Program Regression Tests
description: "Pick the smallest high-signal regression test set for Solana program changes, with focus on authority and programData-sensitive paths."
argument-hint: "Optional: changed files or instruction names"
agent: agent
---
Select the minimum effective regression test set for recent Solana program changes.

Primary scope:
- [program/src/processor](../program/src/processor)
- [program/src/state](../program/src/state)
- [program/tests](../program/tests)

Task:
1. Infer impacted behavior from changed files or provided instruction names.
2. Map impacted behavior to existing tests under [program/tests](../program/tests) and [clients/js/test](../clients/js/test) when relevant.
3. Return a prioritized test list in this order:
   - must-run
   - should-run
   - optional
4. For each test, include one sentence explaining why it guards the changed behavior.
5. Include exact commands to execute the selected set, preferring workspace root scripts first.

Required considerations:
- Canonical vs non-canonical authority behavior.
- Optional programData account handling.
- Mutation/immutability/closure safety (set-data, set-authority, set-immutable, close, trim).
- Any IDL change impact that requires client regeneration validation.

Output format:
- Findings and test recommendations only; concise and actionable.
- If coverage is missing, explicitly call out missing tests and propose concrete test names.
