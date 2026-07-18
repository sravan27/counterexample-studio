import type { Customer, Operation, Scenario, StepResult } from "./types";

const ada: Customer = { id: "c-101", name: "Ada", status: "pending", priority: 2 };
const mara: Customer = { id: "c-203", name: "Mara", status: "pending", priority: 1 };
const soren: Customer = { id: "c-314", name: "Soren", status: "pending", priority: 3 };

const decisive: Operation[] = [
  { id: "op-12", type: "insert", record: soren, recordId: soren.id },
  { id: "op-29", type: "update", recordId: soren.id, patch: { status: "complete" } },
  { id: "op-38", type: "query", query: "pending" },
];

function noise(index: number): Operation {
  const id = `noise-${index.toString().padStart(2, "0")}`;
  if (index % 3 === 0) {
    return {
      id,
      type: "insert",
      noise: true,
      recordId: id,
      record: { id, name: `Fixture ${index}`, status: "complete", priority: 9 },
    };
  }
  if (index % 3 === 1) return { id, type: "query", query: "pending", noise: true };
  return { id, type: "delete", recordId: `missing-${index}`, noise: true };
}

const longTrace: Operation[] = Array.from({ length: 40 }, (_, index) => noise(index + 1));
longTrace.splice(11, 1, decisive[0]);
longTrace.splice(28, 1, decisive[1]);
longTrace.splice(37, 1, decisive[2]);

export const pendingEvictionScenario: Scenario = {
  id: "pending-live-query-eviction",
  label: "Live query eviction",
  invariant:
    "When a customer changes from pending to complete, it must disappear from the pending queue exactly once.",
  summary: "A stale query cache keeps a completed customer visible without throwing an error.",
  classification: "stale-membership / missing invalidation",
  seed: 1709,
  trace: longTrace,
  minimizedTrace: decisive,
  expected: [ada, mara],
  actual: [ada, mara, { ...soren, status: "complete" }],
  exportedTest: `import { describe, expect, it } from "vitest";
import { createQueue } from "../src/queue";

describe("pending live query", () => {
  it("evicts a record after pending -> complete", async () => {
    const queue = createQueue();
    await queue.insert({ id: "c-314", name: "Soren", status: "pending", priority: 3 });
    await queue.update("c-314", { status: "complete" });

    const pending = await queue.query({ status: "pending" });

    expect(pending.map((record) => record.id)).not.toContain("c-314");
  });
});
`,
};

export const invariantPresets = [
  pendingEvictionScenario,
  {
    ...pendingEvictionScenario,
    id: "delete-disappearance",
    label: "Delete disappearance",
    invariant: "A deleted record must disappear from every live query before the next observation.",
  },
  {
    ...pendingEvictionScenario,
    id: "idempotent-upsert",
    label: "Idempotent upsert",
    invariant: "Replaying the same upsert must not duplicate a record or change query order.",
  },
  {
    ...pendingEvictionScenario,
    id: "stable-pagination",
    label: "Stable pagination",
    invariant: "Paging a stable dataset must return every record exactly once with no gaps.",
  },
  {
    ...pendingEvictionScenario,
    id: "unicode-casefold",
    label: "Unicode casefold",
    invariant: "Case-insensitive equality must not drop values whose case fold changes length.",
  },
  {
    ...pendingEvictionScenario,
    id: "range-order",
    label: "Range ordering",
    invariant: "Range filters and sort order must use the same comparison semantics.",
  },
];

function applyOperation(state: Map<string, Customer>, operation: Operation) {
  if (operation.type === "insert" && operation.record) {
    state.set(operation.record.id, { ...operation.record });
  }
  if (operation.type === "update" && operation.recordId) {
    const current = state.get(operation.recordId);
    if (current) state.set(operation.recordId, { ...current, ...operation.patch });
  }
  if (operation.type === "delete" && operation.recordId) state.delete(operation.recordId);
}

function pending(state: Map<string, Customer>): Customer[] {
  return [...state.values()]
    .filter((record) => record.status === "pending")
    .sort((left, right) => left.priority - right.priority || left.id.localeCompare(right.id));
}

export function replay(trace: Operation[], fixed: boolean): StepResult[] {
  const referenceState = new Map<string, Customer>([[ada.id, ada], [mara.id, mara]]);
  const targetState = new Map<string, Customer>([[ada.id, ada], [mara.id, mara]]);
  let staleTarget: Customer[] | null = null;

  return trace.map((operation, index) => {
    applyOperation(referenceState, operation);
    applyOperation(targetState, operation);

    if (
      fixed ||
      (operation.type === "insert" && operation.record?.status === "pending") ||
      (operation.type === "delete" && targetState.has(operation.recordId ?? ""))
    ) {
      staleTarget = null;
    }
    if (operation.type === "update" && !fixed) {
      const updated = targetState.get(operation.recordId ?? "");
      if (updated?.status === "complete") {
        const previous = { ...updated, status: "pending" as const };
        staleTarget = [...pending(targetState), previous].sort(
          (left, right) => left.priority - right.priority || left.id.localeCompare(right.id),
        );
      }
    }

    const reference = pending(referenceState);
    const target = operation.type === "query" && staleTarget ? staleTarget : pending(targetState);
    const mismatch = JSON.stringify(reference) !== JSON.stringify(target);
    return { index, operation, reference, target, mismatch };
  });
}

export function formatOperation(operation: Operation): string {
  if (operation.type === "insert") return `insert ${operation.record?.name ?? operation.recordId}`;
  if (operation.type === "update") return `update ${operation.recordId} → ${JSON.stringify(operation.patch)}`;
  if (operation.type === "delete") return `delete ${operation.recordId}`;
  return "query pending customers";
}
