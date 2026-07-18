import { describe, expect, it } from "vitest";
import { pendingEvictionScenario, replay } from "./scenario";

describe("pending queue scenario", () => {
  it("reproduces silent divergence on the faulty adapter", () => {
    const steps = replay(pendingEvictionScenario.minimizedTrace, false);
    expect(steps.at(-1)?.mismatch).toBe(true);
  });

  it("passes with the corrected invalidation behavior", () => {
    const steps = replay(pendingEvictionScenario.minimizedTrace, true);
    expect(steps.every((step) => !step.mismatch)).toBe(true);
  });
});
