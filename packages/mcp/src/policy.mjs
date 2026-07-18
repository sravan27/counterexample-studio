import { existsSync } from "node:fs";

import { CounterexampleCliError, resolveWorkspacePath } from "./cli.mjs";

export class CounterexamplePolicyError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "CounterexamplePolicyError";
    this.code = code;
  }
}

function optionalPath(root, value, label) {
  return value === undefined ? undefined : resolveWorkspacePath(root, value, label);
}

export function normalizeToolInput(tool, input, root) {
  const normalized = { ...input };
  try {
    if (tool === "run") {
      normalized.tracePath = optionalPath(root, input.tracePath, "tracePath");
      normalized.outputPath = optionalPath(root, input.outputPath, "outputPath");
    } else if (tool === "minimize") {
      normalized.bundlePath = resolveWorkspacePath(root, input.bundlePath, "bundlePath");
      normalized.outputPath = optionalPath(root, input.outputPath, "outputPath");
    } else if (tool === "export") {
      normalized.bundlePath = resolveWorkspacePath(root, input.bundlePath, "bundlePath");
      normalized.outputPath = resolveWorkspacePath(root, input.outputPath, "outputPath");
      if (existsSync(normalized.outputPath) && input.overwrite !== true) {
        throw new CounterexamplePolicyError(
          "outputPath already exists; set overwrite=true only after inspecting the destination.",
          "OUTPUT_EXISTS",
        );
      }
    } else if (tool === "verify") {
      normalized.bundlePath = resolveWorkspacePath(root, input.bundlePath, "bundlePath");
    }
  } catch (error) {
    if (error instanceof CounterexamplePolicyError) throw error;
    if (error instanceof CounterexampleCliError) {
      throw new CounterexamplePolicyError(
        error.message,
        error.details.code ?? "INVALID_PATH",
      );
    }
    throw error;
  }
  return normalized;
}
