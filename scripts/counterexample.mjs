#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { basename, dirname, extname, resolve } from "node:path";
import {
  CONTRACTS,
  CounterexampleError,
  ValidationError,
  canonicalStringify,
  createAdapter,
  createEvidenceBundle,
  exportVitestRegression,
  minimizeTrace,
  runContract,
  runDifferentialTrace,
  validateTrace,
  verifyEvidenceBundle,
} from "../packages/core/src/index.ts";

const HELP = `Counterexample Studio - deterministic executable-spec lab

Usage:
  counterexample run      --contract ID [--target NAME] [--seed N] [--steps N] [--trace FILE] [--output FILE]
  counterexample minimize --input BUNDLE [--output FILE] [--preserve kind|fingerprint]
  counterexample export   --input BUNDLE --output TEST.ts [--target-import MODULE] [--target-export NAME]
  counterexample verify   --input BUNDLE
  counterexample demo     [--seed N] [--steps N] [--output DIRECTORY]

Common flags:
  --json          Emit machine-readable output.
  --help          Show this help.

Built-in contracts:
${CONTRACTS.map(({ manifest }) => `  ${manifest.id.padEnd(31)} ${manifest.defaultTarget}`).join("\n")}
`;

function parse(argv) {
  const positional = [];
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      positional.push(token);
      continue;
    }
    const separator = token.indexOf("=");
    const key = token.slice(2, separator === -1 ? undefined : separator);
    if (!key) throw new ValidationError("Empty flag name");
    let value;
    if (separator !== -1) value = token.slice(separator + 1);
    else if (argv[index + 1] !== undefined && !argv[index + 1].startsWith("--")) value = argv[++index];
    else value = true;
    if (flags[key] !== undefined) throw new ValidationError(`--${key} may only be supplied once`);
    flags[key] = value;
  }
  return { command: positional[0], flags };
}

function required(flags, key) {
  const value = flags[key];
  if (typeof value !== "string" || value.trim() === "") throw new ValidationError(`--${key} requires a value`);
  return value.trim();
}

function optional(flags, key) {
  const value = flags[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim() === "") throw new ValidationError(`--${key} requires a value`);
  return value.trim();
}

function integer(flags, key, fallback) {
  const value = optional(flags, key);
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new ValidationError(`--${key} must be a safe integer`);
  return parsed;
}

function booleanFlag(flags, key) {
  const value = flags[key];
  if (value === undefined) return false;
  if (value === true) return true;
  if (["1", "true", "yes"].includes(value.toLowerCase())) return true;
  if (["0", "false", "no"].includes(value.toLowerCase())) return false;
  throw new ValidationError(`--${key} must be boolean`);
}

async function readJson(file) {
  const path = resolve(file);
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new ValidationError(`Could not read JSON from ${path}`, {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}

async function atomicWrite(file, content) {
  const path = resolve(file);
  const directory = dirname(path);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temporary = resolve(directory, `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`);
  let handle;
  try {
    handle = await open(temporary, "wx", 0o600);
    await handle.writeFile(content, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporary, path);
    const directoryHandle = await open(directory, "r");
    try {
      await directoryHandle.sync();
    } finally {
      await directoryHandle.close();
    }
  } catch (error) {
    if (handle) await handle.close().catch(() => {});
    await rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
  return path;
}

async function writeBundle(file, bundle) {
  return atomicWrite(file, `${JSON.stringify(bundle, null, 2)}\n`);
}

function emit(value, json, human) {
  process.stdout.write(json ? `${JSON.stringify(value, null, 2)}\n` : `${human}\n`);
}

function summarize(run) {
  return {
    contract: run.contract.id,
    target: run.target,
    seed: run.seed,
    traceLength: run.trace.length,
    match: run.result.match,
    mismatch: run.result.mismatch,
    traceHash: run.result.traceHash,
  };
}

async function main() {
  const { command, flags } = parse(process.argv.slice(2));
  const json = booleanFlag(flags, "json");
  if (command === undefined || command === "help" || booleanFlag(flags, "help")) {
    process.stdout.write(HELP);
    return;
  }

  if (command === "run") {
    const contractId = required(flags, "contract");
    const seed = integer(flags, "seed", 1);
    const steps = integer(flags, "steps", 12);
    const traceFile = optional(flags, "trace");
    const trace = traceFile === undefined ? undefined : validateTrace(await readJson(traceFile));
    const run = runContract({
      contractId,
      target: optional(flags, "target"),
      seed,
      steps,
      trace,
    });
    const bundle = createEvidenceBundle(run);
    const output = optional(flags, "output");
    const path = output === undefined ? undefined : await writeBundle(output, bundle);
    const result = { ...summarize(run), bundleId: bundle.bundleId, output: path ?? null };
    emit(result, json, `${result.match ? "MATCH" : `MISMATCH ${result.mismatch.kind}`} ${result.contract} (${result.traceLength} operations)${path ? ` -> ${path}` : ""}`);
    if (result.match) process.exitCode = 2;
    return;
  }

  if (command === "minimize") {
    const input = resolve(required(flags, "input"));
    const bundle = await readJson(input);
    const verification = verifyEvidenceBundle(bundle);
    if (!verification.valid) throw new ValidationError("Input bundle failed verification", { errors: verification.errors });
    const run = runContract({
      contractId: bundle.contract.id,
      target: bundle.target,
      seed: bundle.seed,
      trace: bundle.originalTrace,
    });
    const minimized = minimizeTrace(
      run.trace,
      (trace) => runDifferentialTrace(trace, createAdapter("reference"), createAdapter(run.target)),
      { preserve: optional(flags, "preserve") ?? "kind" },
    );
    const outputBundle = createEvidenceBundle(run, minimized);
    const output = resolve(optional(flags, "output") ?? input.replace(/\.json$/i, "") + ".min.json");
    await writeBundle(output, outputBundle);
    emit({
      bundleId: outputBundle.bundleId,
      contract: run.contract.id,
      mismatch: minimized.result.mismatch,
      originalLength: minimized.originalLength,
      minimizedLength: minimized.minimizedLength,
      evaluations: minimized.evaluations,
      output,
    }, json, `Minimized ${minimized.originalLength} -> ${minimized.minimizedLength} operations (${minimized.evaluations} evaluations) -> ${output}`);
    return;
  }

  if (command === "export") {
    const input = resolve(required(flags, "input"));
    const output = resolve(required(flags, "output"));
    const bundle = await readJson(input);
    const source = exportVitestRegression(bundle, {
      coreImport: optional(flags, "core-import"),
      targetImport: optional(flags, "target-import"),
      targetExport: optional(flags, "target-export"),
      suiteName: optional(flags, "suite"),
    });
    await atomicWrite(output, source);
    emit({ ok: true, bundleId: bundle.bundleId, output }, json, `Exported Vitest regression -> ${output}`);
    return;
  }

  if (command === "verify") {
    const input = resolve(required(flags, "input"));
    const result = verifyEvidenceBundle(await readJson(input));
    emit({ input, ...result }, json, result.valid
      ? `VERIFIED ${result.digest} (${result.replayedMismatch ?? "no mismatch"})`
      : `INVALID: ${result.errors.join("; ")}`);
    if (!result.valid) process.exitCode = 1;
    return;
  }

  if (command === "demo") {
    const baseSeed = integer(flags, "seed", 20260718);
    const steps = integer(flags, "steps", 12);
    const outputDirectory = optional(flags, "output");
    const results = [];
    for (let index = 0; index < CONTRACTS.length; index += 1) {
      const definition = CONTRACTS[index];
      const run = runContract({
        contractId: definition.manifest.id,
        target: definition.manifest.defaultTarget,
        seed: baseSeed + index,
        steps,
      });
      const minimized = minimizeTrace(
        run.trace,
        (trace) => runDifferentialTrace(trace, createAdapter("reference"), createAdapter(run.target)),
      );
      const bundle = createEvidenceBundle(run, minimized);
      let bundlePath = null;
      let testPath = null;
      if (outputDirectory !== undefined) {
        bundlePath = resolve(outputDirectory, `${definition.manifest.id}.evidence.json`);
        testPath = resolve(outputDirectory, `${definition.manifest.id}.regression.test.ts`);
        await writeBundle(bundlePath, bundle);
        await atomicWrite(testPath, exportVitestRegression(bundle));
      }
      results.push({
        contract: definition.manifest.id,
        target: run.target,
        mismatch: minimized.result.mismatch?.kind ?? null,
        originalLength: run.trace.length,
        minimizedLength: minimized.trace.length,
        bundleId: bundle.bundleId,
        bundlePath,
        testPath,
      });
    }
    emit({ seed: baseSeed, steps, results }, json,
      results.map((result) => `${result.contract}: ${result.mismatch} (${result.originalLength} -> ${result.minimizedLength})`).join("\n"));
    return;
  }

  throw new ValidationError(`Unknown command: ${command}`);
}

main().catch((error) => {
  const json = process.argv.includes("--json");
  const payload = error instanceof CounterexampleError
    ? { ok: false, error: { code: error.code, message: error.message, details: error.details } }
    : { ok: false, error: { code: "UNEXPECTED_ERROR", message: error instanceof Error ? error.message : String(error) } };
  process.stderr.write(json ? `${JSON.stringify(payload, null, 2)}\n` : `Error [${payload.error.code}]: ${payload.error.message}\n`);
  process.exitCode = 1;
});
