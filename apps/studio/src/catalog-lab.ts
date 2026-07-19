import {
  createAdapter,
  createEvidenceBundle,
  minimizeTrace,
  runContract,
  runDifferentialTrace,
  verifyEvidenceBundle,
} from "@counterexample-studio/core";

export const CATALOG_LAB_SEED = 1709;
export const CATALOG_LAB_STEPS = 12;

export function executeCatalogContract(contractId: string) {
  const run = runContract({
    contractId,
    seed: CATALOG_LAB_SEED,
    steps: CATALOG_LAB_STEPS,
  });

  if (run.result.match) {
    throw new Error(`Catalog mutant unexpectedly matched for ${contractId}`);
  }

  const minimized = minimizeTrace(
    run.trace,
    (candidate) => runDifferentialTrace(
      candidate,
      createAdapter("reference"),
      createAdapter(run.target),
    ),
    { preserve: "kind" },
  );
  const bundle = createEvidenceBundle(run, minimized);
  const verification = verifyEvidenceBundle(bundle);

  if (!verification.valid) {
    throw new Error(`Generated catalog evidence failed verification: ${verification.errors.join(", ")}`);
  }

  return { run, minimized, bundle, verification };
}

