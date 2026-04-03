---
description: "Use when modifying the Rust client crate, especially handwritten helpers and integration points around generated types. Keep generated code untouched and maintain IDL/client consistency."
name: "Rust Client"
applyTo:
  - "clients/rust/src/hooked/**"
  - "clients/rust/src/lib.rs"
  - "clients/rust/Cargo.toml"
  - "clients/rust/tests/**"
---
# Rust Client Guidelines

## Scope
- Apply this guidance to handwritten Rust client code and crate configuration.
- Keep changes narrow and aligned with existing generated-client integration patterns.

## Generated Boundaries
- Do not manually edit generated code under clients/rust/src/generated/.
- For API/schema changes, update program/idl.json and run pnpm generate:clients.
- Keep generated diffs in the same change set as IDL changes.

## Integration Conventions
- Keep custom wrappers and glue code in clients/rust/src/hooked/.
- Preserve re-export behavior in clients/rust/src/lib.rs unless a task explicitly changes public API.
- Maintain compatibility with generated instruction/account/type modules.

## Testing and Verification
- For Rust client changes, run:
  - pnpm clients:rust:test
- For formatting and linting:
  - pnpm clients:rust:format
  - pnpm clients:rust:lint
- For IDL/API-affecting changes, also run:
  - pnpm generate:clients
  - pnpm programs:test

## Style and Safety
- Follow existing Rust patterns in nearby hooked modules.
- Prefer explicit conversions and clear error propagation over implicit behavior.
- Avoid unrelated refactors in the same patch as behavior changes.

## References
- Rust client overview: clients/rust/README.md
- Root script entry points: package.json
- Program schema source: program/idl.json
- CI command flow: .github/workflows/main.yml
- Workspace-wide defaults: .github/copilot-instructions.md
