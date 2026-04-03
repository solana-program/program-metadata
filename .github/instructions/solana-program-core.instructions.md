---
description: "Use when modifying Solana on-chain program logic, processors, account/state layouts, authority checks, or program tests. Prioritize safety, deterministic behavior, and IDL/client sync."
name: "Solana Program Core"
applyTo:
  - "program/src/**"
  - "program/tests/**"
  - "program/idl.json"
---
# Solana Program Core Guidelines

## Scope
- Apply this guidance to on-chain logic under program/src and tests under program/tests.
- Keep changes tightly scoped to the target instruction, account type, or test case.

## Safety First
- Treat authority validation and program-data handling as high-risk code paths.
- Preserve canonical and non-canonical behavior unless the task explicitly changes both.
- Avoid introducing behavior that depends on non-deterministic inputs.

## State and ABI Changes
- If account data layout or instruction args change, update program/idl.json in the same change.
- After any IDL update, regenerate clients with pnpm generate:clients and include generated diffs.
- Do not manually edit generated directories:
  - clients/js/src/generated/
  - clients/rust/src/generated/

## Testing and Verification
- For program logic changes, run at minimum:
  - pnpm programs:test
- For IDL/API-affecting changes, also run:
  - pnpm clients:js:test
  - pnpm clients:rust:test
- If tests depend on local validator state, ensure validator workflow is used from root scripts.

## Style and Structure
- Follow existing processor and state module patterns in nearby files.
- Prefer small, explicit checks with clear failure paths over compact but ambiguous logic.
- Keep public behavior stable unless the task requests a breaking change.

## References
- Project overview and CLI behavior: README.md
- Program details: program/README.md
- Canonical CI flow: .github/workflows/main.yml
- Workspace-wide defaults: .github/copilot-instructions.md
