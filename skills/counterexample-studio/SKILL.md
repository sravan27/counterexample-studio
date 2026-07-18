---
name: counterexample-studio
description: Evidence-bounded invariant testing with deterministic counterexample generation, shrinking, replay verification, and regression export. Use when Codex needs to translate a plain-English invariant into Counterexample Studio contract JSON, test an implementation or transformation against generated cases, interpret and minimize a failure, export a regression test, verify a counterexample bundle, or make a correctness claim that must stay within observed evidence.
---

# Counterexample Studio

Use the deterministic lab to falsify claims, not to certify universal correctness.

## Compile the invariant

1. Restate the invariant as observable behavior: valid inputs, operation, expected relation, excluded inputs, and comparison semantics.
2. Identify ambiguity before compilation. Do not silently choose units, equality rules, ordering, overflow behavior, or invalid-input policy.
3. Call `compile_contract` with the plain-English invariant. Supply an explicit built-in contract ID only after resolving ambiguity.
4. Inspect the returned registered contract, matched terms, and selection method. If the tool returns `needs_disambiguation`, clarify or select from its candidates; do not invent an executable contract.
5. Preserve the contract digest. Do not hand-edit the registered manifest.

Compilation proves only that a contract was produced. It does not prove the contract faithfully captures the user's intent.

## Run the deterministic lab

1. Call `run_lab` with the compiled built-in contract ID.
2. Set or preserve the integer seed, trace-step bound, and target semantics.
3. Preserve the contract digest from compilation and the seed, target semantics, trace length, trace hash, bundle ID, and artifact path returned by the run. Do not invent missing provenance fields.
4. If the lab finds no failure, report: `No mismatch was observed in this recorded N-step trace with seed S against target T.` Never report the invariant or implementation as correct.
5. If the lab finds a failure, treat the original failure bundle as evidence and continue to minimization.

Do not change the contract, seed, target semantics, or reference oracle while describing one run.

## Minimize and interpret a failure

1. Call `minimize_failure` with the original failure bundle.
2. Preserve the same mismatch fingerprint under the same contract and target semantics; use kind-only preservation only when explicitly justified.
3. Call `verify_bundle` before relying on the minimized result.
4. Explain the reduced trace, reference observation, target observation, mismatch fingerprint, and evaluation count. Call it smaller, not globally smallest.
5. Separate observed facts from likely root cause. A counterexample demonstrates deterministic divergence from the tested reference semantics; it does not by itself prove why the target failed or establish that the reference is universally correct.

If minimization changes the failure class or verification fails, retain the original bundle and do not export the minimized case as evidence.

## Export a regression

1. Export only a verified original or minimized bundle with `export_regression`.
2. Choose a workspace-local output path and export the project's supported Vitest regression.
3. Inspect the generated test before running or committing it.
4. Inspect or port the generated test if the target repository uses another framework, then run the narrow test and relevant suite with that repository's normal commands.
5. Report that the regression preserves the known counterexample. Do not claim it establishes the full invariant.

## Evidence language

Use claims proportional to evidence:

- Verified failure: `This trace deterministically violates contract clause X under target semantics Y.`
- Verified minimized failure: `This is a smaller replaying witness for the same violation.`
- Passing bounded run: `No failure was found in the N-step trace generated with seed S against target T.`
- Exported regression: `This test covers the verified witness.`

Never replace a contract digest, seed, trace bound, target semantics, or verification result with conversational memory.
