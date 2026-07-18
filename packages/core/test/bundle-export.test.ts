import test from "node:test";
import assert from "node:assert/strict";
import {
  createAdapter,
  createEvidenceBundle,
  exportVitestRegression,
  minimizeTrace,
  runContract,
  runDifferentialTrace,
  verifyEvidenceBundle,
} from "../src/index.ts";

function fixture() {
  const run = runContract({ contractId: "filter-before-pagination", seed: 77, steps: 14 });
  const minimized = minimizeTrace(
    run.trace,
    (trace) => runDifferentialTrace(trace, createAdapter("reference"), createAdapter(run.target)),
  );
  return createEvidenceBundle(run, minimized);
}

test("evidence bundles are deterministic, hash-bound, and replay-verifiable", () => {
  const first = fixture();
  const second = fixture();
  assert.deepEqual(first, second);
  assert.match(first.bundleId, /^cex-[a-f0-9]{24}$/);
  assert.match(first.integrity.digest, /^[a-f0-9]{64}$/);
  assert.deepEqual(verifyEvidenceBundle(first), {
    valid: true,
    errors: [],
    digest: first.integrity.digest,
    replayedMismatch: "missing_rows",
  });
});

test("bundle verification catches content and result tampering", () => {
  const bundle = fixture();
  const changedTrace = structuredClone(bundle);
  changedTrace.originalTrace[0].record.id = "tampered";
  const traceVerification = verifyEvidenceBundle(changedTrace);
  assert.equal(traceVerification.valid, false);
  assert.ok(traceVerification.errors.some((error) => /digest|replay|bundleId/i.test(error)));

  const changedResult = structuredClone(bundle);
  changedResult.result.match = true;
  assert.equal(verifyEvidenceBundle(changedResult).valid, false);
});

test("Vitest exporter emits a focused failing regression and supports external targets", () => {
  const bundle = fixture();
  const builtIn = exportVitestRegression(bundle);
  assert.match(builtIn, /from "vitest"/);
  assert.match(builtIn, /runDifferentialTrace/);
  assert.match(builtIn, /limit-before-filter/);
  assert.match(builtIn, /toBeNull\(\)/);
  assert.ok(builtIn.length < 10_000);

  const external = exportVitestRegression(bundle, {
    targetImport: "../src/query-engine.ts",
    targetExport: "makeQueryEngine",
  });
  assert.match(external, /import \{ makeQueryEngine \} from "\.\.\/src\/query-engine\.ts"/);
  assert.match(external, /makeQueryEngine\(\)/);
});
