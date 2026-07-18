# Devpost Submission Packet

## Project Name

Counterexample Studio

## Tagline

Find the smallest sequence that makes an AI-built data feature silently lie.

## Category

Developer Tools

## Short Description

Counterexample Studio turns a plain-English data invariant into an executable contract, drives a reference model and target adapter through the same deterministic operations, detects silent semantic divergence, minimizes the failing trace, and exports a verified evidence bundle plus runnable regression test.

## Inspiration

The project grew out of repeated public database-correctness work. Small semantic gaps in sync and query engines produced wrong rows without exceptions: invalid function arity, signed casts, division-by-zero behavior, JSON iteration, newline matching, and UTF-8 range ordering. Four PowerSync fixes and two Rocicorp fixes were merged, and the PowerSync scope became a paid $1,000 contribution. The repeated manual workflow suggested a product: start from the behavioral invariant and automatically search for the smallest replayable witness.

## What It Does

Counterexample Studio provides an end-to-end falsification loop:

- Codex converts a natural-language invariant into a conservative canonical contract.
- A seeded generator creates deterministic state-transition traces.
- A reference model and target adapter execute identical operations.
- A differential oracle classifies missing rows, unexpected rows, value drift, ordering drift, error asymmetry, and state divergence.
- Delta debugging removes irrelevant operations while preserving the mismatch.
- A tamper-evident bundle records the contract, seed, trace, observations, fingerprint, and integrity digest.
- A Vitest exporter turns the minimized witness into a durable regression.

The interactive studio demonstrates a completed customer incorrectly remaining in a pending queue because of stale live-query cache invalidation. The request succeeds and no exception is thrown. Forty operations are reduced to the three that prove the defect, then the corrected adapter is rerun against the witness.

## How We Built It

The project is a TypeScript monorepo with a deterministic core engine, CLI, React/Vite studio, real Dexie/IndexedDB target adapter, Codex skill, and local MCP server. The engine avoids network calls and time-dependent behavior. Evidence bundles are replayed and SHA-256 verified before regression export.

Codex coordinated the product pivot, architecture, public provenance checks, integration, and browser QA. Parallel GPT-5.6 agents implemented disjoint core-engine and MCP/skill slices while the main rollout built the studio and submission narrative. The included Codex skill is also a runtime part of the product: it compiles invariants, exposes assumptions, invokes deterministic tools, and keeps claims bounded to recorded evidence.

## Challenges

The hardest design decision was epistemic, not visual. A generated test pass is not proof of correctness. The product had to distinguish a verified counterexample, a regression covering one witness, and a bounded run that found no witness. That claim boundary shaped the bundle format, replay verification, MCP annotations, and Codex instructions.

The second challenge was minimization. Removing an operation can change the type of failure rather than merely simplify it. The minimizer therefore preserves mismatch kind or fingerprint and validates every candidate trace before accepting a reduction.

## Accomplishments

- Six deterministic executable contracts.
- Stepwise reference-versus-target observations and mismatch taxonomy.
- Delta-debugging minimizer with bounded evaluations.
- Tamper-evident, replay-verified evidence bundles.
- Runnable Vitest regression export.
- A real IndexedDB demonstration of silent stale-query state.
- A local Codex skill and MCP integration with path confinement and no network access.
- Explicit Build Week provenance separating new implementation from prior public evidence.

## What We Learned

The highest-leverage use of an AI coding agent is not just generating more implementation. It is turning intent into an adversarial, inspectable test loop. The useful output is not a confident sentence. It is a small witness another engineer can replay.

## What Is Next

- Adapter SDKs for SQLite, Postgres, sync engines, and application caches.
- Contract synthesis from schemas, existing tests, and issue descriptions.
- Stateful coverage guidance across multiple seeds.
- CI annotations that attach the minimized trace and generated regression to a pull request.
- A corpus of public semantic-compatibility contracts maintained as versioned evidence.

## Public Evidence

- [PowerSync #644](https://github.com/powersync-ja/powersync-service/pull/644)
- [PowerSync #645](https://github.com/powersync-ja/powersync-service/pull/645)
- [PowerSync #646](https://github.com/powersync-ja/powersync-service/pull/646)
- [PowerSync #647](https://github.com/powersync-ja/powersync-service/pull/647)
- [Rocicorp Zero #6083](https://github.com/rocicorp/mono/pull/6083)
- [Rocicorp Zero #6088](https://github.com/rocicorp/mono/pull/6088)
- [silentdrop](https://github.com/sravan27/silentdrop)

## Assets Still Needed Before Submission

- Public repository URL.
- Hosted studio URL.
- Public YouTube URL for the completed 2:49 narrated demo.
