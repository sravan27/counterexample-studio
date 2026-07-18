import { ValidationError, canonicalStringify, clone, hashCanonical } from "./canonical.ts";
import { TARGET_SEMANTICS } from "./adapter.ts";
import { getContract } from "./contracts.ts";
import { validateContractManifest, validateTrace } from "./schema.ts";
import { runContract } from "./runner.ts";
import type { ContractRun, DifferentialResult, EvidenceBundle, TargetSemantics, Trace } from "./types.ts";

function bundleBody(input: {
  contract: ContractRun["contract"];
  target: TargetSemantics;
  seed: number;
  originalTrace: Trace;
  minimizedTrace: Trace | null;
  result: DifferentialResult;
  minimizedResult: DifferentialResult | null;
}) {
  return {
    schemaVersion: "1.0" as const,
    contract: clone(input.contract),
    target: input.target,
    seed: input.seed,
    originalTrace: clone(input.originalTrace),
    minimizedTrace: clone(input.minimizedTrace),
    result: clone(input.result),
    minimizedResult: clone(input.minimizedResult),
  };
}

export function createEvidenceBundle(
  run: ContractRun,
  minimized?: { trace: Trace; result: DifferentialResult } | null,
): EvidenceBundle {
  const body = bundleBody({
    contract: run.contract,
    target: run.target,
    seed: run.seed,
    originalTrace: run.trace,
    minimizedTrace: minimized?.trace ?? null,
    result: run.result,
    minimizedResult: minimized?.result ?? null,
  });
  const bodyHash = hashCanonical(body);
  const bundleId = `cex-${bodyHash.slice(0, 24)}`;
  const digest = hashCanonical({ ...body, bundleId });
  return {
    ...body,
    bundleId,
    integrity: { algorithm: "sha256", digest },
  };
}

export interface BundleVerification {
  valid: boolean;
  errors: string[];
  digest: string | null;
  replayedMismatch: string | null;
}

export function verifyEvidenceBundle(value: unknown): BundleVerification {
  const errors: string[] = [];
  let digest: string | null = null;
  let replayedMismatch: string | null = null;
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value)) throw new ValidationError("Bundle must be an object");
    const bundle = value as EvidenceBundle;
    if (bundle.schemaVersion !== "1.0") throw new ValidationError("Unsupported bundle schemaVersion");
    if (typeof bundle.bundleId !== "string" || !/^cex-[a-f0-9]{24}$/.test(bundle.bundleId)) {
      throw new ValidationError("Invalid bundleId");
    }
    const manifest = validateContractManifest(bundle.contract);
    const currentManifest = getContract(manifest.id).manifest;
    if (canonicalStringify(manifest) !== canonicalStringify(currentManifest)) errors.push("Contract manifest differs from the executable registry");
    if (!TARGET_SEMANTICS.includes(bundle.target)) throw new ValidationError("Unknown target semantics");
    if (!Number.isSafeInteger(bundle.seed)) throw new ValidationError("Bundle seed must be a safe integer");
    const originalTrace = validateTrace(bundle.originalTrace);
    const minimizedTrace = bundle.minimizedTrace === null ? null : validateTrace(bundle.minimizedTrace);
    if (bundle.integrity?.algorithm !== "sha256" || typeof bundle.integrity.digest !== "string") {
      throw new ValidationError("Bundle integrity block is invalid");
    }
    const body = bundleBody({
      contract: manifest,
      target: bundle.target,
      seed: bundle.seed,
      originalTrace,
      minimizedTrace,
      result: bundle.result,
      minimizedResult: bundle.minimizedResult,
    });
    const expectedBundleId = `cex-${hashCanonical(body).slice(0, 24)}`;
    if (bundle.bundleId !== expectedBundleId) errors.push("bundleId does not match bundle content");
    digest = hashCanonical({ ...body, bundleId: bundle.bundleId });
    if (digest !== bundle.integrity.digest) errors.push("SHA-256 bundle digest mismatch");

    const originalReplay = runContract({ contractId: manifest.id, target: bundle.target, seed: bundle.seed, trace: originalTrace });
    if (canonicalStringify(originalReplay.result) !== canonicalStringify(bundle.result)) errors.push("Original trace replay does not match recorded result");
    if (minimizedTrace !== null) {
      const minimizedReplay = runContract({ contractId: manifest.id, target: bundle.target, seed: bundle.seed, trace: minimizedTrace });
      replayedMismatch = minimizedReplay.result.mismatch?.kind ?? null;
      if (bundle.minimizedResult === null
          || canonicalStringify(minimizedReplay.result) !== canonicalStringify(bundle.minimizedResult)) {
        errors.push("Minimized trace replay does not match recorded result");
      }
    } else {
      replayedMismatch = originalReplay.result.mismatch?.kind ?? null;
      if (bundle.minimizedResult !== null) errors.push("minimizedResult exists without minimizedTrace");
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  return { valid: errors.length === 0, errors, digest, replayedMismatch };
}
