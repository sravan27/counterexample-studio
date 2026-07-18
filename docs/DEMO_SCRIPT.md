# Demo Script: Under Three Minutes

## 0:00-0:15 - The Failure

"AI can write a data feature that looks right, compiles, and returns the wrong rows without throwing. Counterexample Studio finds the smallest sequence that makes that feature silently lie."

Open the studio on the failed result. Point to the reference queue, the target queue, and the green `request completed` indicator.

## 0:15-0:38 - The Invariant

"The invariant is plain English: when a customer moves from pending to complete, the customer must disappear from every pending query. Codex compiles that intent into a conservative executable contract and records any ambiguity rather than inventing certainty."

Open the Contract tab and show the canonical JSON.

## 0:38-1:05 - Deterministic Search

"The lab generates a deterministic forty-operation trace from a recorded seed. A reference model and the real IndexedDB target receive the same operations. The write succeeds. No exception is raised. But the live-query cache still returns the completed customer."

Run the lab and select the divergence in the operation timeline.

## 1:05-1:30 - Minimize The Witness

"A failing trace is useful only if a maintainer can understand it. Delta debugging removes every operation that is not required to preserve the mismatch. Forty operations become three: insert pending, update complete, query pending."

Click **Minimize failure** and show the three-step replay.

## 1:30-1:55 - Export Evidence

"Counterexample Studio packages the contract, seed, observations, minimized trace, mismatch fingerprint, and SHA-256 integrity digest. It then exports a runnable Vitest regression that preserves this exact witness."

Click **Export regression test**. Briefly show the evidence or generated test.

## 1:55-2:18 - Verify The Fix

"Now I apply the corrected cache invalidation and rerun the minimized trace. Reference and target agree. This does not claim universal correctness. It proves that the known counterexample is fixed and makes the test durable."

Click **Apply corrected invalidation and rerun** and show the pass state.

## 2:18-2:42 - The System

"Under the studio is a reusable deterministic engine with six contracts, a CLI, a Codex skill, and a local MCP server. The same loop covers upsert replacement, delete visibility, filter-before-pagination, stable ordering, null comparison, and inclusive range boundaries."

Show the included contract list, then a terminal `demo` result or architecture diagram.

## 2:42-2:55 - Why This Team

"This product came from repeated public wrong-data work: four merged PowerSync fixes, two merged Rocicorp fixes, and a paid $1,000 correctness sprint. Build Week turned that manual pattern into a repeatable developer tool."

Show the public PR links in the README.

## 2:55-3:00 - Close

"Counterexample Studio: stop asking whether generated code looks right. Ask for the smallest trace that proves it wrong."
