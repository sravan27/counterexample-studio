import test from "node:test";
import assert from "node:assert/strict";
import {
  CONTRACTS,
  canonicalStringify,
  runContract,
} from "../src/index.ts";

test("all six contracts expose unique, valid semantic surfaces", () => {
  assert.equal(CONTRACTS.length, 6);
  assert.equal(new Set(CONTRACTS.map((entry) => entry.manifest.id)).size, 6);
  assert.equal(new Set(CONTRACTS.map((entry) => entry.manifest.defaultTarget)).size, 6);
  for (const definition of CONTRACTS) {
    assert.ok(definition.manifest.invariant.length > 20);
    assert.ok(definition.manifest.tags.length >= 3);
  }
});

test("seeded generation is deterministic and seed-sensitive", () => {
  for (const definition of CONTRACTS) {
    const first = definition.generate(1234, 16);
    const second = definition.generate(1234, 16);
    const different = definition.generate(1235, 16);
    assert.equal(canonicalStringify(first), canonicalStringify(second));
    assert.notEqual(canonicalStringify(first), canonicalStringify(different));
    assert.equal(first.length, 16);
  }
});

for (const definition of CONTRACTS) {
  test(`property: ${definition.manifest.id} distinguishes its mutant for 64 seeds`, () => {
    for (let seed = 1; seed <= 64; seed += 1) {
      const failed = runContract({
        contractId: definition.manifest.id,
        target: definition.manifest.defaultTarget,
        seed,
        steps: 20,
      });
      assert.equal(failed.result.match, false, `seed ${seed}`);
      assert.ok(failed.result.mismatch, `seed ${seed}`);

      const reference = runContract({
        contractId: definition.manifest.id,
        target: "reference",
        seed,
        steps: 20,
      });
      assert.equal(reference.result.match, true, `reference seed ${seed}`);
      assert.equal(reference.result.mismatch, null);
    }
  });
}
