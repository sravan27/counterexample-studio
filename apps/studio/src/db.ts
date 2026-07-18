import Dexie, { type EntityTable } from "dexie";
import type { Customer, Operation, StepResult } from "./types";

interface RunRecord {
  id: string;
  createdAt: string;
  seed: number;
  fixed: boolean;
  operations: number;
  mismatch: boolean;
}

class StudioDatabase extends Dexie {
  customers!: EntityTable<Customer, "id">;
  runs!: EntityTable<RunRecord, "id">;

  constructor() {
    super("counterexample-studio");
    this.version(1).stores({
      customers: "id, status, priority",
      runs: "id, createdAt, seed, fixed, mismatch",
    });
  }
}

export const studioDb = new StudioDatabase();

const baseline: Customer[] = [
  { id: "c-101", name: "Ada", status: "pending", priority: 2 },
  { id: "c-203", name: "Mara", status: "pending", priority: 1 },
];

function sortPending(records: Customer[]): Customer[] {
  return records
    .filter((record) => record.status === "pending")
    .sort((left, right) => left.priority - right.priority || left.id.localeCompare(right.id));
}

function applyReference(state: Map<string, Customer>, operation: Operation) {
  if (operation.type === "insert" && operation.record) state.set(operation.record.id, { ...operation.record });
  if (operation.type === "update" && operation.recordId) {
    const current = state.get(operation.recordId);
    if (current) state.set(operation.recordId, { ...current, ...operation.patch });
  }
  if (operation.type === "delete" && operation.recordId) state.delete(operation.recordId);
}

export async function replayInDexie(
  trace: Operation[],
  fixed: boolean,
  seed: number,
): Promise<StepResult[]> {
  await studioDb.transaction("rw", studioDb.customers, async () => {
    await studioDb.customers.clear();
    await studioDb.customers.bulkPut(baseline);
  });

  const reference = new Map(baseline.map((record) => [record.id, { ...record }]));
  let cachedPending = sortPending(baseline);
  const results: StepResult[] = [];

  for (let index = 0; index < trace.length; index += 1) {
    const operation = trace[index];
    applyReference(reference, operation);

    if (operation.type === "insert" && operation.record) {
      await studioDb.customers.put(operation.record);
      if (operation.record.status === "pending") {
        cachedPending = sortPending([...cachedPending, operation.record]);
      }
    }
    if (operation.type === "update" && operation.recordId) {
      await studioDb.customers.update(operation.recordId, operation.patch ?? {});
      if (fixed) {
        cachedPending = sortPending(await studioDb.customers.toArray());
      }
    }
    if (operation.type === "delete" && operation.recordId) {
      await studioDb.customers.delete(operation.recordId);
      cachedPending = cachedPending.filter((record) => record.id !== operation.recordId);
    }

    const expected = sortPending([...reference.values()]);
    const target = operation.type === "query"
      ? [...cachedPending]
      : sortPending(await studioDb.customers.toArray());
    results.push({
      index,
      operation,
      reference: expected,
      target,
      mismatch: JSON.stringify(expected) !== JSON.stringify(target),
    });
  }

  await studioDb.runs.put({
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    seed,
    fixed,
    operations: trace.length,
    mismatch: results.some((result) => result.mismatch),
  });
  return results;
}
