# From Wrong Rows To Minimal Proof

## The Repeating Failure Pattern

In May and June 2026, a sequence of public database and sync-engine contributions exposed the same engineering problem in different forms: an operation completed without an exception, but the observed data did not match the intended semantics.

The defects were small in code and large in consequence:

- PowerSync accepted an invalid `iif()` arity.
- Signed string casts did not match the expected SQLite behavior.
- Division by zero produced the wrong runtime result.
- `json_each()` mishandled object and scalar evaluation.
- Rocicorp Zero used regex and ordering behavior that diverged from SQLite-compatible expectations.

All six cited fixes were reviewed and merged publicly:

| Project | Public change | Result |
| --- | --- | --- |
| PowerSync | [Fix `iif()` arity validation](https://github.com/powersync-ja/powersync-service/pull/644) | Merged |
| PowerSync | [Fix signed string casts](https://github.com/powersync-ja/powersync-service/pull/645) | Merged |
| PowerSync | [Fix division-by-zero semantics](https://github.com/powersync-ja/powersync-service/pull/646) | Merged |
| PowerSync | [Fix `json_each()` object and scalar evaluation](https://github.com/powersync-ja/powersync-service/pull/647) | Merged |
| Rocicorp Zero | [Match SQLite `LIKE`/`ILIKE` newline behavior](https://github.com/rocicorp/mono/pull/6083) | Merged |
| Rocicorp Zero | [Use UTF-8 ordering for range filters](https://github.com/rocicorp/mono/pull/6088) | Merged |

The PowerSync work became a paid, fixed-scope $1,000 contribution. The payment is context for the problem's commercial relevance; it is not presented as a contest result or as proof that Counterexample Studio already existed.

## What Was Missing

Each contribution still required a human to:

1. Notice a semantic inconsistency.
2. Translate the expectation into a minimal experiment.
3. Separate the defect from unrelated operations.
4. Explain the mismatch to a maintainer.
5. Preserve the discovery as a regression test.

The public [silentdrop](https://github.com/sravan27/silentdrop) corpus generalized some known cases, but it remained a static checker and evidence collection. It did not compile new invariants, compare a reference and target state transition system, or minimize a newly generated trace.

## The Build Week Leap

Counterexample Studio productizes that missing loop:

```text
invariant -> contract -> generated trace -> differential mismatch
          -> minimized witness -> verified bundle -> regression test
```

The browser demonstration uses a new scenario rather than replaying a prior pull request. A customer is inserted into a pending queue, updated to complete, and queried again. The target write succeeds, but stale cache invalidation leaves the completed customer visible in the pending queue. The lab reduces forty operations to the three-step proof and verifies the corrected adapter against that witness.

The browser also exposes the complete six-contract matrix as live execution rather than screenshots or fixture JSON. Every selection generates a bounded trace, compares real reference and mutant adapters, minimizes the failure, hash-binds the evidence, replay-verifies it, and allows the resulting bundle to be downloaded. This makes the broader engine inspectable without asking a judge to install the CLI.

## Closing The Proof Gap

A deliberately faulty demo can explain a product, but it cannot establish that the machinery works on independent code. Counterexample Studio therefore includes a historical replay against two exact published versions of PowerSync's sync-rules package around PR #646.

The verifier calls the upstream division operator directly. The pre-fix package evaluates `5 / 0` as `Infinity`, which fails a SQLite-compatible `IS NULL` query. The post-fix package evaluates the same witness as `NULL` and matches the reference. A generated ten-operation trace is minimized to the required write and query, and the evidence records both npm integrity values, both source hashes, every observation, and a SHA-256 digest.

This is not a reconstruction of the old bug in new code. It is an executable before-and-after replay of the published upstream packages.

## What Is New

Every executable component in this repository was created during Build Week:

- deterministic contract registry and trace generators;
- reference and faulty semantic adapters;
- stepwise differential oracle and mismatch taxonomy;
- delta-debugging minimizer;
- tamper-evident evidence bundles and deterministic replay;
- Vitest regression exporter;
- IndexedDB studio;
- browser-native six-contract execution and evidence export;
- Codex skill and local MCP server.

Prior work is cited as public problem evidence. No PowerSync, Rocicorp, or private security-report code is copied into the product implementation. Two exact public PowerSync npm packages are installed only as attributed historical verification fixtures.

## The Claim Boundary

Counterexample Studio is not a theorem prover. It makes a narrower, useful promise: when it finds a counterexample, it produces a small replayable witness; when it does not, it records the exact bounded search that passed. That distinction is central to the product and to the way Codex is instructed to communicate results.
