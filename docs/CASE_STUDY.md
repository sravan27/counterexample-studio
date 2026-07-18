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

## What Is New

Every executable component in this repository was created during Build Week:

- deterministic contract registry and trace generators;
- reference and faulty semantic adapters;
- stepwise differential oracle and mismatch taxonomy;
- delta-debugging minimizer;
- tamper-evident evidence bundles and deterministic replay;
- Vitest regression exporter;
- IndexedDB studio;
- Codex skill and local MCP server.

Prior work is cited only as public problem evidence. No PowerSync, Rocicorp, or private security-report code is copied into this project.

## The Claim Boundary

Counterexample Studio is not a theorem prover. It makes a narrower, useful promise: when it finds a counterexample, it produces a small replayable witness; when it does not, it records the exact bounded search that passed. That distinction is central to the product and to the way Codex is instructed to communicate results.
