---
name: Review Program Authority Validation
description: "Review authority-validation and programData handling changes in the Solana program processor for security regressions."
argument-hint: "Optional: scope path or PR focus"
agent: agent
---
Perform a security-focused review of authority validation and programData handling in this repository.

Primary scope:
- [program/src/processor](../program/src/processor)
- [program/src/processor/mod.rs](../program/src/processor/mod.rs)
- [program/src/processor/initialize.rs](../program/src/processor/initialize.rs)
- [program/src/processor/set_authority.rs](../program/src/processor/set_authority.rs)
- [program/src/processor/set_data.rs](../program/src/processor/set_data.rs)

Review goals:
1. Verify canonical vs non-canonical authority paths behave as intended.
2. Verify BPF loader v2/v3 authority checks cannot be bypassed.
3. Verify optional programData account handling is safe and consistent.
4. Identify regressions that could allow unauthorized metadata mutation/closure.
5. Ensure related tests in [program/tests](../program/tests) cover changed behavior.

Output format:
- Findings first, ordered by severity.
- For each finding include:
  - impacted file and line reference
  - risk summary
  - concrete fix recommendation
- If no findings: state that explicitly and list residual testing gaps.

Constraints:
- Prioritize security and behavioral regressions over style issues.
- Keep summary concise; do not duplicate full file contents.
