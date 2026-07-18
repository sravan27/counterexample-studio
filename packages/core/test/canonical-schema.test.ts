import test from "node:test";
import assert from "node:assert/strict";
import {
  SeededRandom,
  ValidationError,
  canonicalStringify,
  hashCanonical,
  createAdapter,
  validateContractManifest,
  validateTrace,
} from "../src/index.ts";

test("canonical JSON is key-order independent and rejects unsupported values", () => {
  assert.equal(canonicalStringify({ z: 1, a: { y: 2, x: 3 } }), '{"a":{"x":3,"y":2},"z":1}');
  assert.equal(hashCanonical({ b: 2, a: 1 }), hashCanonical({ a: 1, b: 2 }));
  assert.throws(() => canonicalStringify({ value: Number.NaN }), ValidationError);
  assert.throws(() => canonicalStringify({ value: undefined }), ValidationError);
});

test("seeded random is deterministic and range-safe", () => {
  const left = new SeededRandom(42);
  const right = new SeededRandom(42);
  const leftValues = Array.from({ length: 100 }, () => left.nextUint32());
  const rightValues = Array.from({ length: 100 }, () => right.nextUint32());
  assert.deepEqual(leftValues, rightValues);
  assert.ok(leftValues.some((value) => value !== leftValues[0]));
  const bounded = new SeededRandom(7);
  for (let index = 0; index < 1_000; index += 1) {
    const value = bounded.integer(-3, 4);
    assert.ok(value >= -3 && value <= 4);
  }
});

test("trace schema normalizes projections and rejects malformed operations", () => {
  const trace = validateTrace([
    { op: "put", record: { id: "a", score: 1 } },
    { op: "query", query: { projection: ["score", "score"], limit: 1 } },
  ]);
  assert.deepEqual(trace[1], {
    op: "query",
    query: { projection: ["id", "score"], limit: 1 },
  });
  assert.throws(() => validateTrace([]), /non-empty/);
  assert.throws(() => validateTrace([{ op: "delete", id: "" }]), /non-empty/);
  assert.throws(() => validateTrace([{ op: "query", query: { limit: -1 } }]), /non-negative/);
});

test("contract manifest validation is strict", () => {
  assert.throws(() => validateContractManifest({ id: "Bad ID" }), ValidationError);
  assert.throws(() => validateContractManifest({
    id: "valid-id",
    version: 1,
    title: "x",
    description: "x",
    invariant: "x",
    operationKinds: ["teleport"],
    defaultTarget: "reference",
    tags: [],
  }), /operationKinds/);
});

test("unknown target semantics are rejected instead of degrading to reference behavior", () => {
  assert.throws(() => createAdapter("typo-target" as never), /Unknown target semantics/);
});
