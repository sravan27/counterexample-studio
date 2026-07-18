import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  CounterexampleCliError,
  buildCliInvocation,
  invokeCounterexample,
} from "../src/cli.mjs";

async function workspaceWithCli(source) {
  const root = await mkdtemp(path.join(os.tmpdir(), "counterexample-mcp-"));
  const scripts = path.join(root, "scripts");
  await mkdir(scripts);
  const cliPath = path.join(scripts, "counterexample.mjs");
  await writeFile(cliPath, source);
  return { root, cliPath };
}

const echoCli = `
const args = process.argv.slice(2);
const command = args.shift();
const flags = {};
for (let index = 0; index < args.length; index += 1) {
  if (!args[index].startsWith("--")) continue;
  const name = args[index].slice(2);
  flags[name] = args[index + 1] && !args[index + 1].startsWith("--")
    ? args[++index]
    : true;
}
console.log(JSON.stringify({
  command,
  flags,
}));
`;

test("invokes the deterministic CLI through its public flag contract", async () => {
  const { root, cliPath } = await workspaceWithCli(echoCli);
  const result = await invokeCounterexample(
    "run",
    { contract: "delete-removes-visible-state", seed: 17, steps: 40 },
    { root, cliPath },
  );

  assert.deepEqual(result, {
    command: "run",
    flags: {
      json: true,
      contract: "delete-removes-visible-state",
      seed: "17",
      steps: "40",
    },
  });
});

test("preserves spaces and metacharacters as data rather than shell syntax", async () => {
  const { root, cliPath } = await workspaceWithCli(echoCli);
  const result = await invokeCounterexample(
    "run-lab",
    { trace: "contracts/a; echo unsafe.json" },
    { root, cliPath },
  );

  assert.equal(result.flags.trace, "contracts/a; echo unsafe.json");
});

test("rejects a CLI path outside the workspace", async () => {
  const { root } = await workspaceWithCli(echoCli);
  assert.throws(
    () =>
      buildCliInvocation("run-lab", {}, {
        root,
        cliPath: path.join(root, "../counterexample.mjs"),
      }),
    (error) =>
      error instanceof CounterexampleCliError &&
      error.details.code === "PATH_OUTSIDE_WORKSPACE",
  );
});

test("fails closed when the CLI emits malformed JSON", async () => {
  const { root, cliPath } = await workspaceWithCli(`console.log("not-json");`);
  await assert.rejects(
    invokeCounterexample("verify-bundle", {}, { root, cliPath }),
    (error) =>
      error instanceof CounterexampleCliError &&
      error.details.code === "INVALID_JSON",
  );
});

test("returns a non-zero CLI failure as a structured adapter error", async () => {
  const { root, cliPath } = await workspaceWithCli(
    `console.error("bundle replay failed"); process.exit(9);`,
  );
  await assert.rejects(
    invokeCounterexample("verify-bundle", {}, { root, cliPath }),
    (error) =>
      error instanceof CounterexampleCliError &&
      error.details.code === "CLI_FAILED" &&
      error.details.exitCode === 9 &&
      error.message === "bundle replay failed",
  );
});

test("can treat the CLI's bounded-pass exit code 2 as a successful result", async () => {
  const { root, cliPath } = await workspaceWithCli(
    `console.log(JSON.stringify({ match: true, traceLength: 12 })); process.exit(2);`,
  );
  const result = await invokeCounterexample(
    "run",
    { contract: "upsert-replaces-existing" },
    { root, cliPath, successExitCodes: [0, 2] },
  );
  assert.deepEqual(result, { match: true, traceLength: 12 });
});
