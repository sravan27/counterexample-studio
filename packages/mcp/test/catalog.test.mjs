import assert from "node:assert/strict";
import test from "node:test";

import { compileInvariant } from "../src/catalog.mjs";

test("deterministically maps a clear invariant to the registered manifest", () => {
  const result = compileInvariant(
    "After delete, the removed record must be absent from every query.",
  );
  assert.equal(result.status, "compiled");
  assert.equal(result.contract.id, "delete-removes-visible-state");
  assert.equal(result.contract.defaultTarget, "delete-noop");
  assert.match(result.contractDigest, /^[a-f0-9]{64}$/);
  assert.ok(result.matchedTerms.includes("delete"));
});

test("requires disambiguation instead of inventing an unregistered contract", () => {
  const result = compileInvariant(
    "Every replicated write is eventually visible in every region.",
  );
  assert.equal(result.status, "needs_disambiguation");
  assert.equal(result.candidates.length, 6);
  assert.equal(result.contract, undefined);
});

test("accepts an explicit registered contract ID", () => {
  const result = compileInvariant(
    "Rows should be stable.",
    "deterministic-order-ties",
  );
  assert.equal(result.status, "compiled");
  assert.equal(result.selection, "explicit_contract_id");
  assert.equal(result.contract.id, "deterministic-order-ties");
});

test("rejects an unknown explicit contract ID", () => {
  const result = compileInvariant("Anything", "unknown-contract");
  assert.equal(result.status, "needs_disambiguation");
  assert.match(result.reason, /Unknown built-in contract/);
});
