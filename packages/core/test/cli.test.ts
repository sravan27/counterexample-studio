import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const cli = resolve(import.meta.dirname, "../../../scripts/counterexample.mjs");

function invoke(args: string[]) {
  return spawnSync(process.execPath, ["--experimental-strip-types", cli, ...args], {
    encoding: "utf8",
  });
}

test("CLI run/minimize/verify/export pipeline is executable", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "counterexample-cli-"));
  const original = resolve(directory, "run.json");
  const minimized = resolve(directory, "run.min.json");
  const regression = resolve(directory, "regression.test.ts");

  const run = invoke(["run", "--contract", "sql-null-comparison", "--seed", "5", "--steps", "15", "--output", original, "--json"]);
  assert.equal(run.status, 0, run.stderr);
  assert.equal(JSON.parse(run.stdout).mismatch.kind, "unexpected_rows");

  const minimize = invoke(["minimize", "--input", original, "--output", minimized, "--json"]);
  assert.equal(minimize.status, 0, minimize.stderr);
  const minimizeOutput = JSON.parse(minimize.stdout);
  assert.ok(minimizeOutput.minimizedLength < minimizeOutput.originalLength);

  const verify = invoke(["verify", "--input", minimized, "--json"]);
  assert.equal(verify.status, 0, verify.stderr);
  assert.equal(JSON.parse(verify.stdout).valid, true);

  const exportResult = invoke(["export", "--input", minimized, "--output", regression, "--json"]);
  assert.equal(exportResult.status, 0, exportResult.stderr);
  assert.match(await readFile(regression, "utf8"), /sql-null-comparison regression/);
});

test("CLI demo emits six evidence bundles and six Vitest regressions", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "counterexample-demo-"));
  const result = invoke(["demo", "--seed", "88", "--steps", "10", "--output", directory, "--json"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).results.length, 6);
  const files = await readdir(directory);
  assert.equal(files.filter((file) => file.endsWith(".evidence.json")).length, 6);
  assert.equal(files.filter((file) => file.endsWith(".regression.test.ts")).length, 6);
});
