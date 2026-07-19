# Build Provenance

## Timeline

- OpenAI Build Week began on 2026-07-13.
- Counterexample Studio was selected and scaffolded on 2026-07-18.
- Initial repository commit: `8a27b6a` (`chore: scaffold Counterexample Studio for Build Week`).
- A published-package replay for PowerSync PR #646 and its studio evidence panel were added on 2026-07-19.
- The six-contract catalog became a live browser execution surface on 2026-07-19, using the same runner, minimizer, bundle, and verifier as the CLI.

The repository history after that commit is the source of truth for implementation timing.

## Codex Collaboration

The main Codex rollout performed:

- route and competition qualification;
- product-wedge selection and adversarial differentiation review;
- architecture and work decomposition;
- public PR provenance verification;
- studio implementation and integration;
- published-package historical replay and provenance binding;
- browser-native execution and deterministic evidence verification for all six contracts;
- test, browser, responsive, and packaging QA;
- claim-boundary review;
- README, case study, demo script, and submission packet.

Two GPT-5.6 coding agents received disjoint write scopes:

| Worker | Scope |
| --- | --- |
| Core engine worker | `packages/core/**` and `scripts/counterexample.mjs` |
| Codex integration worker | `skills/counterexample-studio/**`, `packages/mcp/**`, `.mcp.json`, and `docs/ARCHITECTURE.md` |

The main rollout did not duplicate those implementation scopes while the workers were active. It reviewed and integrated their outputs after completion.

## Prior Work Boundary

The following existed before Build Week and is cited only as public evidence:

- PowerSync PRs 644-647;
- Rocicorp Zero PRs 6083 and 6088;
- `sravan27/silentdrop`;
- `sravan27/silentdrop-llm`.

No upstream source is copied into Counterexample Studio's implementation. The historical verifier installs two exact public PowerSync npm packages as attributed development fixtures and executes their exported operator surface. Their registry integrity values and source hashes are recorded so the before-and-after claim is independently reproducible. No private vulnerability report, customer email, payment record, or unpublished third-party material is included.

## Reproducibility

Before submission, the repository should preserve:

- installation, test, type-check, and production-build output;
- CLI-generated evidence bundles for all included contracts;
- the checked-in, hash-bound historical PowerSync replay and exact package lock;
- plugin validation output;
- desktop and mobile screenshots from the production build;
- the final public repository commit SHA;
- the hosted deployment URL and video URL.

Those artifacts demonstrate what was built and tested; they do not imply a competition result before judging.
