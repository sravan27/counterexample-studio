import { ValidationError, canonicalStringify, clone } from "./canonical.ts";
import { validateOperation } from "./schema.ts";
import type {
  Adapter,
  DataRecord,
  JsonValue,
  OperationResult,
  OrderClause,
  Predicate,
  QuerySpec,
  TargetSemantics,
  TraceOperation,
} from "./types.ts";

export const TARGET_SEMANTICS: readonly TargetSemantics[] = Object.freeze([
  "reference",
  "first-write-wins",
  "delete-noop",
  "limit-before-filter",
  "unstable-ties",
  "null-equals-null",
  "gte-exclusive",
]);

function fieldValue(record: DataRecord, field: string): JsonValue | undefined {
  const parts = field.split(".");
  let value: JsonValue | undefined = record;
  for (const part of parts) {
    if (value === null || Array.isArray(value) || typeof value !== "object") return undefined;
    value = value[part];
  }
  return value;
}

function scalarCompare(left: JsonValue | undefined, right: JsonValue): number | null {
  if (left === undefined || left === null || right === null) return null;
  if (typeof left !== typeof right) return null;
  if (typeof left !== "number" && typeof left !== "string" && typeof left !== "boolean") return null;
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function matches(record: DataRecord, predicate: Predicate, semantics: TargetSemantics): boolean {
  if (predicate.op === "and") return predicate.predicates.every((entry) => matches(record, entry, semantics));
  if (predicate.op === "or") return predicate.predicates.some((entry) => matches(record, entry, semantics));
  if (predicate.op === "not") return !matches(record, predicate.predicate, semantics);
  if (!("field" in predicate)) return false;
  const value = fieldValue(record, predicate.field);
  if (predicate.op === "isNull") return value === null || value === undefined;
  if (predicate.op === "isNotNull") return value !== null && value !== undefined;
  if (!("value" in predicate)) return false;
  if (semantics === "null-equals-null" && (predicate.op === "eq" || predicate.op === "neq")) {
    if ((value === null || value === undefined) && predicate.value === null) return predicate.op === "eq";
  }
  const comparison = scalarCompare(value, predicate.value);
  if (comparison === null) return false;
  if (predicate.op === "eq") return comparison === 0;
  if (predicate.op === "neq") return comparison !== 0;
  if (predicate.op === "gt") return comparison > 0;
  if (predicate.op === "gte") return semantics === "gte-exclusive" ? comparison > 0 : comparison >= 0;
  if (predicate.op === "lt") return comparison < 0;
  return comparison <= 0;
}

function compareByClause(left: DataRecord, right: DataRecord, clause: OrderClause): number {
  const leftValue = fieldValue(left, clause.field);
  const rightValue = fieldValue(right, clause.field);
  const leftNull = leftValue === null || leftValue === undefined;
  const rightNull = rightValue === null || rightValue === undefined;
  if (leftNull || rightNull) {
    if (leftNull && rightNull) return 0;
    const nulls = clause.nulls ?? "last";
    const result = leftNull ? -1 : 1;
    return nulls === "first" ? result : -result;
  }
  const comparison = scalarCompare(leftValue, rightValue as JsonValue) ?? 0;
  return clause.direction === "asc" ? comparison : -comparison;
}

function sortRows(rows: DataRecord[], query: QuerySpec, semantics: TargetSemantics): DataRecord[] {
  if (!query.orderBy || query.orderBy.length === 0) return rows;
  return rows.sort((left, right) => {
    for (const clause of query.orderBy ?? []) {
      const result = compareByClause(left, right, clause);
      if (result !== 0) return result;
    }
    if (semantics === "unstable-ties") return 0;
    return left.id.localeCompare(right.id);
  });
}

function project(record: DataRecord, fields: string[] | undefined): DataRecord {
  if (!fields) return clone(record);
  const output: DataRecord = { id: record.id };
  for (const field of fields) {
    if (field === "id") continue;
    const value = fieldValue(record, field);
    if (value !== undefined) output[field] = clone(value);
  }
  return output;
}

function queryRecords(records: DataRecord[], query: QuerySpec, semantics: TargetSemantics): DataRecord[] {
  let rows = records.map(clone);
  if (semantics === "limit-before-filter") {
    rows = sortRows(rows, query, semantics);
    rows = rows.slice(query.offset ?? 0, query.limit === undefined ? undefined : (query.offset ?? 0) + query.limit);
    if (query.where) rows = rows.filter((record) => matches(record, query.where as Predicate, semantics));
  } else {
    if (query.where) rows = rows.filter((record) => matches(record, query.where as Predicate, semantics));
    rows = sortRows(rows, query, semantics);
    rows = rows.slice(query.offset ?? 0, query.limit === undefined ? undefined : (query.offset ?? 0) + query.limit);
  }
  return rows.map((record) => project(record, query.projection));
}

export function createAdapter(semantics: TargetSemantics = "reference"): Adapter {
  if (!TARGET_SEMANTICS.includes(semantics)) {
    throw new ValidationError("Unknown target semantics", { semantics });
  }
  const records = new Map<string, DataRecord>();
  return {
    name: semantics,
    apply(rawOperation: TraceOperation): OperationResult {
      const operation = validateOperation(rawOperation);
      if (operation.op === "put") {
        if (semantics !== "first-write-wins" || !records.has(operation.record.id)) {
          records.set(operation.record.id, clone(operation.record));
        }
        return { kind: "mutation", ok: true };
      }
      if (operation.op === "delete") {
        if (semantics !== "delete-noop") records.delete(operation.id);
        return { kind: "mutation", ok: true };
      }
      return { kind: "query", rows: queryRecords([...records.values()], operation.query, semantics) };
    },
    snapshot(): DataRecord[] {
      return [...records.values()]
        .map(clone)
        .sort((left, right) => left.id.localeCompare(right.id)
          || canonicalStringify(left).localeCompare(canonicalStringify(right)));
    },
  };
}
