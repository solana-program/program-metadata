---
name: Program Safety Gate
description: "Run a pre-merge Solana program safety gate: client regeneration check, authority/programData security review, and targeted regression test plan."
argument-hint: "Optional: changed files, instruction names, or PR focus"
agent: agent
---
Execute a single pre-merge safety workflow for Solana program changes in this repository.

Scope:
- program/src/**
- program/tests/**
- program/idl.json

Workflow:
1. Regeneration drift check
   - Verify if program/idl.json changes require client regeneration.
   - Run generation flow equivalent to /Regenerate Clients.
   - Report generated drift and any non-generated unexpected changes.

2. Security review for authority/programData handling
   - Run review flow equivalent to /Review Program Authority Validation.
   - Focus on canonical vs non-canonical authority behavior, loader v2/v3 checks, and optional programData handling.
   - Report findings first by severity with concrete fixes.

3. Regression test selection
   - Run selection flow equivalent to /Select Program Regression Tests.
   - Return must-run, should-run, optional tests with rationale.
   - Include exact commands, preferring root scripts.

4. Gate verdict
   - Return one final verdict:
     - pass (no blockers)
     - pass-with-risks
     - fail (blockers)
   - If not pass, include the shortest actionable next steps.

Output format:
- Section 1: Regeneration status
- Section 2: Security findings
- Section 3: Test plan
- Section 4: Gate verdict
- Keep output concise and actionable.
