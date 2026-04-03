# Project Guidelines

## Scope
These instructions apply across the entire repository.
Use this file as the single workspace instruction source.

## Architecture
- This repo contains one on-chain Solana program plus generated JS and Rust clients.
- Program source of truth:
  - `program/src/` for on-chain logic.
  - `program/idl.json` for interface schema and client generation input.
- JS client:
  - Manual code in `clients/js/src/` and CLI code in `clients/js/src/cli/`.
  - Generated code in `clients/js/src/generated/`.
- Rust client:
  - Generated code in `clients/rust/src/generated/`.
  - Handwritten support code in `clients/rust/src/hooked/`.
- Script orchestration lives in `scripts/` and root `package.json` scripts.

## Build and Test
- Preferred entry points are root pnpm scripts:
  - `pnpm programs:build`
  - `pnpm programs:test`
  - `pnpm clients:js:test`
  - `pnpm clients:rust:test`
  - `pnpm programs:format && pnpm programs:lint`
  - `pnpm clients:js:format && pnpm clients:js:lint`
  - `pnpm clients:rust:format && pnpm clients:rust:lint`
- Code generation:
  - Run `pnpm generate:clients` after any `program/idl.json` change.
  - If generated files change, include them in the same change set.
- Solana tooling helpers:
  - `pnpm solana:check`
  - `pnpm validator:start` and `pnpm validator:stop`

## Conventions
- Do not hand-edit generated directories:
  - `clients/js/src/generated/`
  - `clients/rust/src/generated/`
- For client API changes, update `program/idl.json` and regenerate clients.
- Keep changes scoped; avoid unrelated refactors.
- Follow existing style and naming in nearby files.

## Environment and Pitfalls
- Required versions are pinned:
  - Solana CLI `2.3.4` (workspace metadata in `Cargo.toml`).
  - Rust toolchain `1.86.0` (`rust-toolchain.toml`).
  - Rust fmt/lint nightly `nightly-2025-02-16`.
  - Node `>=20` and `pnpm@10.15.1`.
- JS integration tests require a local validator and built program artifacts.
- Authority validation and program-data handling are security-sensitive; treat changes in `program/src/processor/` as high risk.

## Key References
- Project overview and CLI usage: `README.md`
- Program details: `program/README.md`
- JS client usage: `clients/js/README.md`
- Rust client usage: `clients/rust/README.md`
- CI quality gates and canonical command flow: `.github/workflows/main.yml`
- Security reporting policy: `SECURITY.md`
