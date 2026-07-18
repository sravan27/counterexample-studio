import { ValidationError } from "./canonical.ts";
import { verifyEvidenceBundle } from "./bundle.ts";
import type { EvidenceBundle, Trace } from "./types.ts";

export interface VitestExportOptions {
  coreImport?: string;
  targetImport?: string;
  targetExport?: string;
  suiteName?: string;
}

function quote(value: string): string {
  return JSON.stringify(value);
}

export function exportVitestRegression(bundle: EvidenceBundle, options: VitestExportOptions = {}): string {
  const verification = verifyEvidenceBundle(bundle);
  if (!verification.valid) throw new ValidationError("Cannot export an invalid evidence bundle", { errors: verification.errors });
  const trace = (bundle.minimizedTrace ?? bundle.originalTrace) as Trace;
  const mismatch = bundle.minimizedResult?.mismatch ?? bundle.result.mismatch;
  if (!mismatch) throw new ValidationError("Bundle does not contain a counterexample");
  const coreImport = options.coreImport ?? "@counterexample-studio/core";
  const targetExport = options.targetExport ?? "createTargetAdapter";
  const targetSetup = options.targetImport
    ? `import { ${targetExport} } from ${quote(options.targetImport)};\n`
    : "";
  const targetExpression = options.targetImport
    ? `${targetExport}()`
    : `createAdapter(${quote(bundle.target)})`;
  const suiteName = options.suiteName ?? `${bundle.contract.id} regression`;
  return `import { describe, expect, it } from "vitest";
import { createAdapter, runDifferentialTrace, type Trace } from ${quote(coreImport)};
${targetSetup}
const counterexample: Trace = ${JSON.stringify(trace, null, 2)};

describe(${quote(suiteName)}, () => {
  it(${quote(`matches the reference semantics (${bundle.bundleId})`)}, () => {
    const result = runDifferentialTrace(
      counterexample,
      createAdapter("reference"),
      ${targetExpression},
    );

    expect(result.mismatch, ${quote(`Original mismatch: ${mismatch.kind} (${mismatch.fingerprint})`)}).toBeNull();
  });
});
`;
}
