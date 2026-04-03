---
description: "Use when modifying the JavaScript client or CLI, including metadata packing/parsing, command handlers, and integration tests. Keep generated code untouched and maintain @solana/kit-compatible behavior."
name: "JavaScript Client"
applyTo:
  - "clients/js/src/*.ts"
  - "clients/js/src/cli/**"
  - "clients/js/test/**"
---
# JavaScript Client Guidelines

## Scope
- Apply this guidance to handwritten JS client and CLI code in clients/js/src and tests in clients/js/test.
- Keep changes focused on specific API functions or CLI command paths.

## Generated Boundaries
- Do not manually edit generated code under clients/js/src/generated/.
- If client API surface must change, update program/idl.json and run pnpm generate:clients.
- Keep generated diffs in the same change when IDL changes.

## API and CLI Conventions
- Preserve existing command option naming and behavior unless task explicitly requests breaking changes.
- Keep compatibility with @solana/kit usage patterns already established in this repo.
- Prefer explicit validation and user-facing error messages in CLI flows.

## Data Handling
- Reuse existing packing/parsing helpers for encoding, compression, and format logic.
- Maintain behavior parity between write/fetch/update flows when adding new metadata handling.

## Testing and Verification
- For JS code changes, run:
  - pnpm clients:js:test
- For formatting/linting on JS client:
  - pnpm clients:js:format
  - pnpm clients:js:lint
- If touching IDL-related behavior, run pnpm generate:clients and relevant client tests.

## Style and Structure
- Match existing module organization and naming in nearby files.
- Avoid broad refactors in the same change as functional fixes.
- Keep function behavior explicit and minimize hidden side effects.

## References
- Root command entry points: package.json
- JS client docs and local commands: clients/js/README.md
- CI flow for format/lint/test: .github/workflows/main.yml
- Workspace-wide defaults: .github/copilot-instructions.md
