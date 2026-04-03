---
name: Regenerate Clients
description: "Regenerate JS and Rust clients from program/idl.json and summarize exactly what changed."
argument-hint: "Optional: include a short reason for the IDL change"
agent: agent
---
Regenerate clients for this workspace after IDL updates.

Task:
1. Confirm the source-of-truth file exists at [program/idl.json](../program/idl.json).
2. Run generation from the repository root:
   - pnpm generate:clients
3. Show a concise change report:
   - List changed files under [clients/js/src/generated](../clients/js/src/generated) and [clients/rust/src/generated](../clients/rust/src/generated).
   - Call out any non-generated files that changed unexpectedly.
4. If generation produced no changes, state that clearly.
5. End with the exact verification commands to run next:
   - pnpm clients:js:test
   - pnpm clients:rust:test

Constraints:
- Do not hand-edit generated files.
- Keep summary concise and actionable.
