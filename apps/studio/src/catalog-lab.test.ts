import { listContractManifests } from "@counterexample-studio/core/catalog";
import { describe, expect, test } from "vitest";

import {
  CATALOG_LAB_SEED,
  CATALOG_LAB_STEPS,
  executeCatalogContract,
} from "./catalog-lab";

describe("browser catalog lab", () => {
  test("every registered contract produces minimized, verified evidence", () => {
    for (const contract of listContractManifests()) {
      const evidence = executeCatalogContract(contract.id);

      expect(evidence.run.seed).toBe(CATALOG_LAB_SEED);
      expect(evidence.run.trace).toHaveLength(CATALOG_LAB_STEPS);
      expect(evidence.run.result.match).toBe(false);
      expect(evidence.minimized.trace.length).toBeLessThan(evidence.run.trace.length);
      expect(evidence.minimized.result.mismatch?.kind).toBe(evidence.run.result.mismatch?.kind);
      expect(evidence.verification.valid).toBe(true);
      expect(evidence.verification.replayedMismatch).toBe(evidence.run.result.mismatch?.kind);
      expect(evidence.bundle.integrity.digest).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  test("rerunning a contract produces the same bundle identity", () => {
    const first = executeCatalogContract("inclusive-range-boundary");
    const second = executeCatalogContract("inclusive-range-boundary");

    expect(second.bundle.bundleId).toBe(first.bundle.bundleId);
    expect(second.bundle.integrity.digest).toBe(first.bundle.integrity.digest);
    expect(second.minimized.trace).toEqual(first.minimized.trace);
  });
});

