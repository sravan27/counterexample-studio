import test from "node:test";
import assert from "node:assert/strict";
import {
  CONTRACTS,
  createAdapter,
  minimizeTrace,
  runContract,
  runDifferentialTrace,
} from "../src/index.ts";

test("runner classifies row-set, ordering, and state mismatches", () => {
  const expected = new Map([
    ["upsert-replaces-existing", "state_divergence"],
    ["delete-removes-visible-state", "state_divergence"],
    ["filter-before-pagination", "missing_rows"],
    ["deterministic-order-ties", "ordering_mismatch"],
    ["sql-null-comparison", "unexpected_rows"],
    ["inclusive-range-boundary", "missing_rows"],
  ]);
  for (const definition of CONTRACTS) {
    const run = runContract({ contractId: definition.manifest.id, seed: 9, steps: 12 });
    assert.equal(run.result.mismatch?.kind, expected.get(definition.manifest.id));
    assert.match(run.result.mismatch?.fingerprint ?? "", /^[a-f0-9]{64}$/);
  }
});

test("ddmin removes seeded noise and preserves each failure class", () => {
  for (const definition of CONTRACTS) {
    const run = runContract({ contractId: definition.manifest.id, seed: 999, steps: 30 });
    const kind = run.result.mismatch?.kind;
    const minimized = minimizeTrace(
      run.trace,
      (trace) => runDifferentialTrace(trace, createAdapter("reference"), createAdapter(run.target)),
    );
    assert.ok(minimized.trace.length < run.trace.length, definition.manifest.id);
    assert.equal(minimized.result.mismatch?.kind, kind);
    assert.equal(minimized.originalLength, 30);
    assert.equal(minimized.minimizedLength, minimized.trace.length);
    assert.ok(minimized.evaluations > 1);

    for (let index = 0; index < minimized.trace.length; index += 1) {
      const candidate = minimized.trace.filter((_, item) => item !== index);
      if (candidate.length === 0) continue;
      const result = runDifferentialTrace(candidate, createAdapter("reference"), createAdapter(run.target));
      assert.notEqual(result.mismatch?.kind, kind, `${definition.manifest.id} was not one-minimal at ${index}`);
    }
  }
});

test("minimizer refuses passing traces", () => {
  const run = runContract({ contractId: "inclusive-range-boundary", target: "reference", seed: 1, steps: 6 });
  assert.throws(() => minimizeTrace(
    run.trace,
    (trace) => runDifferentialTrace(trace, createAdapter("reference"), createAdapter("reference")),
  ), /does not fail/);
});

test("value simplification is monotonic and cannot exhaust the evaluation budget", () => {
  const trace = [
    { op: "put", record: { id: "witness", active: true, score: 7 } },
    { op: "query", label: "observe any row", query: {} },
  ] as const;

  const evaluate = (candidate: Parameters<typeof runDifferentialTrace>[0]) => {
    const target = createAdapter("reference");
    return runDifferentialTrace(candidate, createAdapter("reference"), {
      name: "drop-query-rows",
      apply(operation) {
        const result = target.apply(operation);
        return result.kind === "query" ? { kind: "query", rows: [] } : result;
      },
      snapshot: () => target.snapshot(),
    });
  };

  const minimized = minimizeTrace([...trace], evaluate, { maxEvaluations: 100 });

  assert.equal(minimized.result.mismatch?.kind, "missing_rows");
  assert.ok(minimized.evaluations < 20, `used ${minimized.evaluations} evaluations`);
  assert.equal(minimized.trace.length, 2);
  assert.deepEqual(minimized.trace[0], { op: "put", record: { id: "witness" } });
  assert.deepEqual(minimized.trace[1], { op: "query", query: {} });
});
