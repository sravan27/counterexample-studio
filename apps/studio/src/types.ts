export type RunPhase = "ready" | "running" | "failed" | "minimized" | "passed";

export type OperationType = "insert" | "update" | "delete" | "query";

export interface Customer {
  id: string;
  name: string;
  status: "pending" | "complete";
  priority: number;
}

export interface Operation {
  id: string;
  type: OperationType;
  recordId?: string;
  record?: Customer;
  patch?: Partial<Customer>;
  query?: "pending";
  noise?: boolean;
}

export interface StepResult {
  index: number;
  operation: Operation;
  reference: Customer[];
  target: Customer[];
  mismatch: boolean;
}

export interface Scenario {
  id: string;
  label: string;
  invariant: string;
  summary: string;
  classification: string;
  seed: number;
  trace: Operation[];
  minimizedTrace: Operation[];
  expected: Customer[];
  actual: Customer[];
  exportedTest: string;
}
