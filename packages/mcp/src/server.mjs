#!/usr/bin/env node
import { fileURLToPath } from "node:url";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import {
  CounterexampleCliError,
  invokeCounterexample,
  resolveConfiguration,
} from "./cli.mjs";
import { compileInvariant } from "./catalog.mjs";
import {
  CounterexamplePolicyError,
  normalizeToolInput,
} from "./policy.mjs";

const pathDescription = "Workspace-local path; absolute paths outside the workspace are rejected.";
const contractId = z.string().regex(/^[a-z][a-z0-9-]{2,63}$/);
const targetSemantics = z.enum([
  "reference",
  "first-write-wins",
  "delete-noop",
  "limit-before-filter",
  "unstable-ties",
  "null-equals-null",
  "gte-exclusive",
]);

const compileContractInput = {
  invariant: z.string().min(1).max(20_000),
  contractId: contractId.optional().describe("Explicit built-in contract ID when Codex has resolved ambiguity."),
};

const runLabInput = {
  contractId,
  target: targetSemantics.optional(),
  seed: z.number().int().safe().default(1),
  steps: z.number().int().min(3).max(1_000_000).default(12),
  tracePath: z.string().min(1).optional().describe("Optional JSON trace that replaces generated operations."),
  outputPath: z.string().min(1).optional().describe("Optional evidence-bundle JSON destination."),
  timeoutMs: z.number().int().min(1_000).max(300_000).default(120_000),
};

const minimizeFailureInput = {
  bundlePath: z.string().min(1).describe("Verified failing evidence bundle."),
  outputPath: z.string().min(1).optional().describe("Minimized bundle destination; defaults beside the input."),
  preserve: z.enum(["kind", "fingerprint"]).default("fingerprint"),
  timeoutMs: z.number().int().min(1_000).max(300_000).default(120_000),
};

const exportRegressionInput = {
  bundlePath: z.string().min(1).describe("Verified original or minimized bundle path."),
  outputPath: z.string().min(1).describe(pathDescription),
  coreImport: z.string().min(1).optional(),
  targetImport: z.string().min(1).optional(),
  targetExport: z.string().min(1).optional(),
  suiteName: z.string().min(1).optional(),
  overwrite: z.boolean().default(false),
};

const verifyBundleInput = {
  bundlePath: z.string().min(1).describe(pathDescription),
  timeoutMs: z.number().int().min(1_000).max(300_000).default(120_000),
};

function successResult(data) {
  const structuredContent =
    data !== null && typeof data === "object" && !Array.isArray(data)
      ? data
      : { data };
  return {
    content: [{ type: "text", text: JSON.stringify(structuredContent, null, 2) }],
    structuredContent,
  };
}

function errorResult(error) {
  const code =
    error instanceof CounterexamplePolicyError
      ? error.code
      : error instanceof CounterexampleCliError
        ? error.details.code ?? "CLI_ERROR"
        : "INTERNAL_ERROR";
  const body = {
    ok: false,
    error: code,
    message: error instanceof Error ? error.message : String(error),
  };
  return {
    isError: true,
    content: [{ type: "text", text: JSON.stringify(body, null, 2) }],
    structuredContent: body,
  };
}

async function execute(command, input, flags, options = {}) {
  try {
    const { root } = resolveConfiguration();
    const normalized = normalizeToolInput(command, input, root);
    const result = await invokeCounterexample(
      command,
      flags(normalized),
      {
        timeoutMs: input.timeoutMs,
        successExitCodes: options.successExitCodes,
      },
    );
    return successResult(result);
  } catch (error) {
    return errorResult(error);
  }
}

export function createServer() {
  const server = new McpServer(
    { name: "counterexample-studio", version: "0.1.0" },
    {
      instructions:
        "Compile only to registered executable contracts, preserve deterministic provenance, minimize only replaying failures, verify bundles before export, and never claim correctness beyond the recorded search evidence.",
    },
  );

  server.registerTool(
    "compile_contract",
    {
      title: "Compile an invariant contract",
      description:
        "Map a plain-English invariant to one exact registered executable contract. Returns disambiguation instead of inventing unsupported semantics.",
      inputSchema: compileContractInput,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    ({ invariant, contractId: requestedId }) =>
      successResult(compileInvariant(invariant, requestedId)),
  );

  server.registerTool(
    "run_lab",
    {
      title: "Run the deterministic lab",
      description:
        "Run one registered contract against target semantics with a fixed seed and trace bound. Exit code 2 is a valid bounded pass, not a tool failure.",
      inputSchema: runLabInput,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    (input) =>
      execute(
        "run",
        input,
        (value) => ({
          contract: value.contractId,
          target: value.target,
          seed: value.seed,
          steps: value.steps,
          trace: value.tracePath,
          output: value.outputPath,
        }),
        { successExitCodes: [0, 2] },
      ),
  );

  server.registerTool(
    "minimize_failure",
    {
      title: "Minimize a counterexample",
      description:
        "Verify and shrink a failing evidence bundle while preserving its mismatch fingerprint by default.",
      inputSchema: minimizeFailureInput,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    (input) =>
      execute("minimize", input, (value) => ({
        input: value.bundlePath,
        output: value.outputPath,
        preserve: value.preserve,
      })),
  );

  server.registerTool(
    "export_regression",
    {
      title: "Export a regression test",
      description:
        "Export a verified bundle as a workspace-local Vitest regression. This covers the witness and does not certify the full invariant.",
      inputSchema: exportRegressionInput,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    (input) =>
      execute("export", input, (value) => ({
        input: value.bundlePath,
        output: value.outputPath,
        "core-import": value.coreImport,
        "target-import": value.targetImport,
        "target-export": value.targetExport,
        suite: value.suiteName,
      })),
  );

  server.registerTool(
    "verify_bundle",
    {
      title: "Verify a counterexample bundle",
      description:
        "Verify bundle digest, registered contract identity, and deterministic replay before interpretation or export.",
      inputSchema: verifyBundleInput,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    (input) =>
      execute("verify", input, (value) => ({ input: value.bundlePath })),
  );

  return server;
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  const server = createServer();
  await server.connect(new StdioServerTransport());
}
