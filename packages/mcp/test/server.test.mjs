import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const serverPath = path.join(packageRoot, "src/server.mjs");
const mockCli = `
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
  ok: true,
  command,
  flags,
}));
`;

async function withClient(run) {
  const root = await mkdtemp(path.join(os.tmpdir(), "counterexample-server-"));
  const scripts = path.join(root, "scripts");
  await mkdir(scripts);
  const cliPath = path.join(scripts, "counterexample.mjs");
  await writeFile(cliPath, mockCli);

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverPath],
    env: {
      ...process.env,
      COUNTEREXAMPLE_STUDIO_ROOT: root,
      COUNTEREXAMPLE_STUDIO_CLI_PATH: cliPath,
    },
    stderr: "pipe",
  });
  const client = new Client({ name: "counterexample-test", version: "0.1.0" });
  await client.connect(transport);
  try {
    await run(client, root);
  } finally {
    await client.close();
  }
}

test("publishes the five requested Counterexample Studio tools", async () => {
  await withClient(async (client) => {
    const response = await client.listTools();
    assert.deepEqual(
      response.tools.map((tool) => tool.name).sort(),
      [
        "compile_contract",
        "export_regression",
        "minimize_failure",
        "run_lab",
        "verify_bundle",
      ],
    );
  });
});

test("compiles an invariant only to an exact registered contract", async () => {
  await withClient(async (client) => {
    const response = await client.callTool({
      name: "compile_contract",
      arguments: {
        invariant: "a deleted record must be absent from the next query",
      },
    });
    assert.equal(response.isError, undefined);
    assert.equal(
      response.structuredContent.contract.id,
      "delete-removes-visible-state",
    );
    assert.equal(response.structuredContent.selection, "deterministic_term_match");
  });
});

test("routes a bounded run through the real CLI flag shape", async () => {
  await withClient(async (client, root) => {
    const response = await client.callTool({
      name: "run_lab",
      arguments: {
        contractId: "delete-removes-visible-state",
        target: "delete-noop",
        seed: 42,
        steps: 100,
        outputPath: "artifacts/delete.evidence.json",
      },
    });
    assert.equal(response.isError, undefined);
    assert.equal(response.structuredContent.command, "run");
    assert.equal(response.structuredContent.flags.contract, "delete-removes-visible-state");
    assert.equal(response.structuredContent.flags.target, "delete-noop");
    assert.equal(response.structuredContent.flags.seed, "42");
    assert.equal(response.structuredContent.flags.steps, "100");
    assert.equal(
      response.structuredContent.flags.output,
      path.join(root, "artifacts/delete.evidence.json"),
    );
  });
});

test("normalizes a verified bundle path before invoking the CLI", async () => {
  await withClient(async (client, root) => {
    const response = await client.callTool({
      name: "verify_bundle",
      arguments: { bundlePath: "artifacts/failure.json" },
    });
    assert.equal(response.isError, undefined);
    assert.equal(response.structuredContent.command, "verify");
    assert.equal(
      response.structuredContent.flags.input,
      path.join(root, "artifacts/failure.json"),
    );
  });
});

test("rejects regression output outside the workspace before CLI execution", async () => {
  await withClient(async (client) => {
    const response = await client.callTool({
      name: "export_regression",
      arguments: {
        bundlePath: "artifacts/failure.json",
        outputPath: "../outside.test.js",
      },
    });
    assert.equal(response.isError, true);
    assert.equal(response.structuredContent.error, "PATH_OUTSIDE_WORKSPACE");
  });
});
