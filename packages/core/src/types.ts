export type JsonPrimitive = null | boolean | number | string;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface DataRecord {
  id: string;
  [field: string]: JsonValue;
}

export type ComparisonOperator = "eq" | "neq" | "gt" | "gte" | "lt" | "lte";

export type Predicate =
  | { op: ComparisonOperator; field: string; value: JsonValue }
  | { op: "isNull" | "isNotNull"; field: string }
  | { op: "and" | "or"; predicates: Predicate[] }
  | { op: "not"; predicate: Predicate };

export interface OrderClause {
  field: string;
  direction: "asc" | "desc";
  nulls?: "first" | "last";
}

export interface QuerySpec {
  where?: Predicate;
  orderBy?: OrderClause[];
  offset?: number;
  limit?: number;
  projection?: string[];
}

export type TraceOperation =
  | { op: "put"; record: DataRecord }
  | { op: "delete"; id: string }
  | { op: "query"; query: QuerySpec; label?: string };

export type Trace = TraceOperation[];

export type OperationResult =
  | { kind: "mutation"; ok: true }
  | { kind: "query"; rows: DataRecord[] }
  | { kind: "error"; name: string; message: string };

export interface Adapter {
  readonly name: string;
  apply(operation: TraceOperation): OperationResult;
  snapshot(): DataRecord[];
}

export type MismatchKind =
  | "error_asymmetry"
  | "missing_rows"
  | "unexpected_rows"
  | "ordering_mismatch"
  | "value_mismatch"
  | "state_divergence"
  | "result_kind_mismatch";

export interface Mismatch {
  kind: MismatchKind;
  step: number;
  operation: TraceOperation;
  summary: string;
  details: Record<string, JsonValue>;
  fingerprint: string;
}

export interface StepObservation {
  step: number;
  operation: TraceOperation;
  reference: OperationResult;
  target: OperationResult;
  referenceState: DataRecord[];
  targetState: DataRecord[];
}

export interface DifferentialResult {
  match: boolean;
  mismatch: Mismatch | null;
  observations: StepObservation[];
  traceHash: string;
}

export interface ContractManifest {
  id: string;
  version: number;
  title: string;
  description: string;
  invariant: string;
  operationKinds: Array<TraceOperation["op"]>;
  defaultTarget: TargetSemantics;
  tags: string[];
}

export interface ContractDefinition {
  manifest: ContractManifest;
  generate(seed: number, steps?: number): Trace;
}

export type TargetSemantics =
  | "reference"
  | "first-write-wins"
  | "delete-noop"
  | "limit-before-filter"
  | "unstable-ties"
  | "null-equals-null"
  | "gte-exclusive";

export interface ContractRun {
  contract: ContractManifest;
  target: TargetSemantics;
  seed: number;
  trace: Trace;
  result: DifferentialResult;
}

export interface MinimizeResult {
  trace: Trace;
  result: DifferentialResult;
  originalLength: number;
  minimizedLength: number;
  evaluations: number;
}

export interface EvidenceBundle {
  schemaVersion: "1.0";
  bundleId: string;
  contract: ContractManifest;
  target: TargetSemantics;
  seed: number;
  originalTrace: Trace;
  minimizedTrace: Trace | null;
  result: DifferentialResult;
  minimizedResult: DifferentialResult | null;
  integrity: {
    algorithm: "sha256";
    digest: string;
  };
}
