import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  CounterexamplePolicyError,
  normalizeToolInput,
} from "../src/policy.mjs";

const root = mkdtempSync(path.join(os.tmpdir(), "counterexample-policy-"));

test("normalizes run trace and bundle output paths", () => {
  const normalized = normalizeToolInput(
    "run",
    {
      contractId: "delete-removes-visible-state",
      tracePath: "traces/delete.json",
      outputPath: "artifacts/delete.evidence.json",
    },
    root,
  );
  assert.equal(normalized.tracePath, path.join(root, "traces/delete.json"));
  assert.equal(
    normalized.outputPath,
    path.join(root, "artifacts/delete.evidence.json"),
  );
});

test("confines exported regressions to the workspace", () => {
  assert.throws(
    () =>
      normalizeToolInput(
        "export",
        {
          bundlePath: "artifacts/failure.json",
          outputPath: "../outside.test.ts",
        },
        root,
      ),
    (error) =>
      error instanceof CounterexamplePolicyError &&
      error.code === "PATH_OUTSIDE_WORKSPACE",
  );
});

test("normalizes bundle and output paths before export", () => {
  const normalized = normalizeToolInput(
    "export",
    {
      bundlePath: "artifacts/failure.json",
      outputPath: "test/regression.test.ts",
    },
    root,
  );
  assert.equal(normalized.bundlePath, path.join(root, "artifacts/failure.json"));
  assert.equal(normalized.outputPath, path.join(root, "test/regression.test.ts"));
});

test("refuses to overwrite an existing regression by default", () => {
  const outputPath = path.join(root, "test/existing.test.ts");
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, "existing");
  assert.throws(
    () =>
      normalizeToolInput(
        "export",
        { bundlePath: "artifacts/failure.json", outputPath },
        root,
      ),
    (error) =>
      error instanceof CounterexamplePolicyError && error.code === "OUTPUT_EXISTS",
  );
});

test("rejects a workspace symlink that resolves outside the workspace", () => {
  const outside = mkdtempSync(path.join(os.tmpdir(), "counterexample-outside-"));
  const artifacts = path.join(root, "linked-artifacts");
  mkdirSync(outside, { recursive: true });
  symlinkSync(outside, artifacts);

  assert.throws(
    () =>
      normalizeToolInput(
        "verify",
        { bundlePath: "linked-artifacts/failure.json" },
        root,
      ),
    (error) =>
      error instanceof CounterexamplePolicyError &&
      error.code === "PATH_OUTSIDE_WORKSPACE",
  );
});
