import { spawn } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_TIMEOUT_MS = 300_000;
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;
const MAX_INPUT_BYTES = 2 * 1024 * 1024;

export class CounterexampleCliError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "CounterexampleCliError";
    this.details = details;
  }
}

function requireInsideRoot(root, candidate, label) {
  const relative = path.relative(root, candidate);
  if (
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new CounterexampleCliError(`${label} must be inside the Counterexample Studio workspace.`, {
      code: "PATH_OUTSIDE_WORKSPACE",
    });
  }

  const realRoot = realpathSync(root);
  let existingAncestor = candidate;
  while (!existsSync(existingAncestor)) {
    const parent = path.dirname(existingAncestor);
    if (parent === existingAncestor) break;
    existingAncestor = parent;
  }
  const realAncestor = realpathSync(existingAncestor);
  const realRelative = path.relative(realRoot, realAncestor);
  if (
    realRelative === ".." ||
    realRelative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(realRelative)
  ) {
    throw new CounterexampleCliError(`${label} resolves outside the Counterexample Studio workspace.`, {
      code: "PATH_OUTSIDE_WORKSPACE",
    });
  }
}

export function resolveWorkspacePath(root, value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new CounterexampleCliError(`${label} must be a non-empty path.`, {
      code: "INVALID_PATH",
    });
  }
  const resolved = path.resolve(root, value);
  requireInsideRoot(root, resolved, label);
  return resolved;
}

export function resolveConfiguration(options = {}) {
  const env = options.env ?? process.env;
  const root = path.resolve(options.root ?? env.COUNTEREXAMPLE_STUDIO_ROOT ?? DEFAULT_ROOT);
  const cliPath = path.resolve(
    options.cliPath ??
      env.COUNTEREXAMPLE_STUDIO_CLI_PATH ??
      path.join(root, "scripts/counterexample.mjs"),
  );
  if (env.COUNTEREXAMPLE_STUDIO_ALLOW_EXTERNAL_CLI !== "1") {
    requireInsideRoot(root, cliPath, "CLI path");
  }
  return { root, cliPath };
}

function childEnvironment(source) {
  const allowed = ["HOME", "LANG", "LC_ALL", "PATH", "TMPDIR", "TZ", "SystemRoot"];
  return Object.fromEntries(
    allowed
      .filter((key) => typeof source[key] === "string")
      .map((key) => [key, source[key]]),
  );
}

export function buildCliInvocation(command, flags, options = {}) {
  const config = resolveConfiguration(options);
  const args = [config.cliPath, command, "--json"];
  for (const [name, value] of Object.entries(flags ?? {})) {
    if (value === undefined || value === null || value === false) continue;
    args.push(`--${name}`);
    if (value !== true) args.push(String(value));
  }
  if (Buffer.byteLength(JSON.stringify(args), "utf8") > MAX_INPUT_BYTES) {
    throw new CounterexampleCliError("CLI arguments exceeded the 2 MiB limit.", {
      code: "INPUT_LIMIT",
    });
  }
  return { ...config, executable: process.execPath, args };
}

export async function invokeCounterexample(command, flags = {}, options = {}) {
  const invocation = buildCliInvocation(command, flags, options);
  const sourceEnv = options.env ?? process.env;
  const timeoutMs = Math.min(
    MAX_TIMEOUT_MS,
    Math.max(1_000, options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
  );
  const successExitCodes = new Set(options.successExitCodes ?? [0]);

  return await new Promise((resolve, reject) => {
    const child = spawn(invocation.executable, invocation.args, {
      cwd: invocation.root,
      env: childEnvironment(sourceEnv),
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    let outputBytes = 0;
    let settled = false;

    const finish = (callback) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback();
    };
    const capture = (target, chunk) => {
      outputBytes += chunk.length;
      if (outputBytes > MAX_OUTPUT_BYTES) {
        child.kill("SIGKILL");
        finish(() =>
          reject(
            new CounterexampleCliError("CLI output exceeded the 2 MiB limit.", {
              code: "OUTPUT_LIMIT",
            }),
          ),
        );
        return;
      }
      target.push(chunk);
    };

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(() =>
        reject(
          new CounterexampleCliError(`CLI timed out after ${timeoutMs} ms.`, {
            code: "TIMEOUT",
          }),
        ),
      );
    }, timeoutMs);

    child.stdout.on("data", (chunk) => capture(stdout, chunk));
    child.stderr.on("data", (chunk) => capture(stderr, chunk));
    child.on("error", (error) => {
      finish(() =>
        reject(
          new CounterexampleCliError(`Unable to start CLI: ${error.message}`, {
            code: "SPAWN_FAILED",
          }),
        ),
      );
    });
    child.on("close", (exitCode, signal) => {
      finish(() => {
        const out = Buffer.concat(stdout).toString("utf8").trim();
        const err = Buffer.concat(stderr).toString("utf8").trim();
        if (!successExitCodes.has(exitCode)) {
          reject(
            new CounterexampleCliError(err || `CLI exited with code ${exitCode}.`, {
              code: "CLI_FAILED",
              exitCode,
              signal,
            }),
          );
          return;
        }
        if (out.length === 0) {
          reject(
            new CounterexampleCliError("CLI returned no JSON output.", {
              code: "EMPTY_OUTPUT",
            }),
          );
          return;
        }
        try {
          resolve(JSON.parse(out));
        } catch {
          reject(
            new CounterexampleCliError("CLI returned invalid JSON.", {
              code: "INVALID_JSON",
            }),
          );
        }
      });
    });
  });
}
