import { ValidationError, canonicalStringify, clone, hashCanonical } from "./canonical.ts";
import { TARGET_SEMANTICS, createAdapter } from "./adapter.ts";
import { getContract } from "./contracts.ts";
import { validateTrace } from "./schema.ts";
import type {
  Adapter,
  ContractRun,
  DataRecord,
  DifferentialResult,
  JsonValue,
  Mismatch,
  MismatchKind,
  OperationResult,
  StepObservation,
  TargetSemantics,
  Trace,
  TraceOperation,
} from "./types.ts";

function safelyApply(adapter: Adapter, operation: TraceOperation): OperationResult {
  try {
    return adapter.apply(operation);
  } catch (error) {
    return {
      kind: "error",
      name: error instanceof Error ? error.name : "ThrownValue",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

function recordIds(rows: DataRecord[]): string[] {
  return rows.map((row) => row.id);
}

function difference(left: string[], right: string[]): string[] {
  const rightSet = new Set(right);
  return [...new Set(left.filter((value) => !rightSet.has(value)))].sort();
}

function createMismatch(
  kind: MismatchKind,
  step: number,
  operation: TraceOperation,
  summary: string,
  details: Record<string, JsonValue>,
): Mismatch {
  return {
    kind,
    step,
    operation: clone(operation),
    summary,
    details: clone(details),
    fingerprint: hashCanonical({ kind, operation: operation.op, details }),
  };
}

function classifyResults(
  step: number,
  operation: TraceOperation,
  reference: OperationResult,
  target: OperationResult,
  referenceState: DataRecord[],
  targetState: DataRecord[],
): Mismatch | null {
  if (reference.kind !== target.kind) {
    const kind: MismatchKind = reference.kind === "error" || target.kind === "error"
      ? "error_asymmetry"
      : "result_kind_mismatch";
    return createMismatch(kind, step, operation, `Reference returned ${reference.kind}; target returned ${target.kind}.`, {
      referenceKind: reference.kind,
      targetKind: target.kind,
    });
  }
  if (reference.kind === "error" && target.kind === "error") {
    if (reference.name !== target.name || reference.message !== target.message) {
      return createMismatch("value_mismatch", step, operation, "Reference and target raised different errors.", {
        reference: `${reference.name}: ${reference.message}`,
        target: `${target.name}: ${target.message}`,
      });
    }
    return null;
  }
  if (reference.kind === "query" && target.kind === "query") {
    const referenceIds = recordIds(reference.rows);
    const targetIds = recordIds(target.rows);
    const missing = difference(referenceIds, targetIds);
    if (missing.length > 0) {
      return createMismatch("missing_rows", step, operation, `Target omitted ${missing.length} reference row(s).`, {
        missing,
        referenceIds,
        targetIds,
      });
    }
    const unexpected = difference(targetIds, referenceIds);
    if (unexpected.length > 0) {
      return createMismatch("unexpected_rows", step, operation, `Target returned ${unexpected.length} unexpected row(s).`, {
        unexpected,
        referenceIds,
        targetIds,
      });
    }
    if (canonicalStringify(referenceIds) !== canonicalStringify(targetIds)) {
      return createMismatch("ordering_mismatch", step, operation, "Reference and target returned the same rows in different order.", {
        referenceIds,
        targetIds,
      });
    }
    if (canonicalStringify(reference.rows) !== canonicalStringify(target.rows)) {
      return createMismatch("value_mismatch", step, operation, "Reference and target returned different row values.", {
        referenceRows: reference.rows,
        targetRows: target.rows,
      });
    }
  }
  if (canonicalStringify(referenceState) !== canonicalStringify(targetState)) {
    return createMismatch("state_divergence", step, operation, "Reference and target states diverged.", {
      referenceIds: recordIds(referenceState),
      targetIds: recordIds(targetState),
      referenceState,
      targetState,
    });
  }
  return null;
}

export function runDifferentialTrace(
  rawTrace: Trace,
  reference: Adapter = createAdapter("reference"),
  target: Adapter = createAdapter("reference"),
): DifferentialResult {
  const trace = validateTrace(rawTrace);
  const observations: StepObservation[] = [];
  let mismatch: Mismatch | null = null;

  for (let step = 0; step < trace.length; step += 1) {
    const operation = trace[step] as TraceOperation;
    const referenceResult = safelyApply(reference, operation);
    const targetResult = safelyApply(target, operation);
    const referenceState = reference.snapshot();
    const targetState = target.snapshot();
    const observation: StepObservation = {
      step,
      operation: clone(operation),
      reference: clone(referenceResult),
      target: clone(targetResult),
      referenceState: clone(referenceState),
      targetState: clone(targetState),
    };
    observations.push(observation);
    mismatch = classifyResults(step, operation, referenceResult, targetResult, referenceState, targetState);
    if (mismatch) break;
  }

  return {
    match: mismatch === null,
    mismatch,
    observations,
    traceHash: hashCanonical(trace),
  };
}

export function runContract(input: {
  contractId: string;
  target?: TargetSemantics;
  seed?: number;
  steps?: number;
  trace?: Trace;
}): ContractRun {
  const contract = getContract(input.contractId);
  const seed = input.seed ?? 1;
  const target = input.target ?? contract.manifest.defaultTarget;
  if (!TARGET_SEMANTICS.includes(target)) {
    throw new ValidationError("Unknown target semantics", { target });
  }
  const trace = input.trace === undefined
    ? contract.generate(seed, input.steps)
    : validateTrace(input.trace);
  return {
    contract: clone(contract.manifest),
    target,
    seed,
    trace,
    result: runDifferentialTrace(trace, createAdapter("reference"), createAdapter(target)),
  };
}
