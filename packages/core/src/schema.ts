import { ValidationError, canonicalize } from "./canonical.ts";
import type {
  ContractManifest,
  DataRecord,
  JsonValue,
  Predicate,
  QuerySpec,
  Trace,
  TraceOperation,
} from "./types.ts";

export const CONTRACT_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://counterexample.studio/schemas/contract-manifest-v1.json",
  title: "Counterexample Studio semantic contract",
  type: "object",
  additionalProperties: false,
  required: ["id", "version", "title", "description", "invariant", "operationKinds", "defaultTarget", "tags"],
  properties: {
    id: { type: "string", pattern: "^[a-z][a-z0-9-]{2,63}$" },
    version: { type: "integer", minimum: 1 },
    title: { type: "string", minLength: 1 },
    description: { type: "string", minLength: 1 },
    invariant: { type: "string", minLength: 1 },
    operationKinds: {
      type: "array",
      minItems: 1,
      uniqueItems: true,
      items: { enum: ["put", "delete", "query"] },
    },
    defaultTarget: {
      enum: [
        "reference",
        "first-write-wins",
        "delete-noop",
        "limit-before-filter",
        "unstable-ties",
        "null-equals-null",
        "gte-exclusive",
      ],
    },
    tags: { type: "array", uniqueItems: true, items: { type: "string", minLength: 1 } },
  },
} as const;

function requireObject(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ValidationError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requireText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ValidationError(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function requireNonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new ValidationError(`${label} must be a non-negative safe integer`, { value });
  }
  return value as number;
}

export function validateContractManifest(value: unknown): ContractManifest {
  const manifest = requireObject(value, "contract");
  const id = requireText(manifest.id, "contract.id");
  if (!/^[a-z][a-z0-9-]{2,63}$/.test(id)) throw new ValidationError("contract.id has an invalid format", { id });
  if (!Number.isSafeInteger(manifest.version) || (manifest.version as number) < 1) {
    throw new ValidationError("contract.version must be a positive integer");
  }
  const operationKinds = manifest.operationKinds;
  if (!Array.isArray(operationKinds) || operationKinds.length === 0
      || operationKinds.some((kind) => !["put", "delete", "query"].includes(String(kind)))) {
    throw new ValidationError("contract.operationKinds is invalid");
  }
  const targets = ["reference", "first-write-wins", "delete-noop", "limit-before-filter", "unstable-ties", "null-equals-null", "gte-exclusive"];
  if (!targets.includes(String(manifest.defaultTarget))) throw new ValidationError("contract.defaultTarget is invalid");
  if (!Array.isArray(manifest.tags) || manifest.tags.some((tag) => typeof tag !== "string" || tag.trim() === "")) {
    throw new ValidationError("contract.tags must be non-empty strings");
  }
  return canonicalize({
    id,
    version: manifest.version,
    title: requireText(manifest.title, "contract.title"),
    description: requireText(manifest.description, "contract.description"),
    invariant: requireText(manifest.invariant, "contract.invariant"),
    operationKinds: [...new Set(operationKinds)],
    defaultTarget: manifest.defaultTarget,
    tags: [...new Set(manifest.tags)],
  }) as unknown as ContractManifest;
}

export function validateRecord(value: unknown): DataRecord {
  const record = requireObject(value, "record");
  const id = requireText(record.id, "record.id");
  const canonical = canonicalize({ ...record, id }) as Record<string, JsonValue>;
  return canonical as DataRecord;
}

function validatePredicate(value: unknown): Predicate {
  const predicate = requireObject(value, "predicate");
  const op = requireText(predicate.op, "predicate.op");
  if (["eq", "neq", "gt", "gte", "lt", "lte"].includes(op)) {
    return {
      op: op as "eq" | "neq" | "gt" | "gte" | "lt" | "lte",
      field: requireText(predicate.field, "predicate.field"),
      value: canonicalize(predicate.value),
    };
  }
  if (op === "isNull" || op === "isNotNull") {
    return { op, field: requireText(predicate.field, "predicate.field") };
  }
  if (op === "and" || op === "or") {
    if (!Array.isArray(predicate.predicates) || predicate.predicates.length === 0) {
      throw new ValidationError(`${op} requires at least one predicate`);
    }
    return { op, predicates: predicate.predicates.map(validatePredicate) };
  }
  if (op === "not") return { op, predicate: validatePredicate(predicate.predicate) };
  throw new ValidationError("Unsupported predicate operation", { op });
}

export function validateQuery(value: unknown): QuerySpec {
  const query = requireObject(value, "query");
  const output: QuerySpec = {};
  if (query.where !== undefined) output.where = validatePredicate(query.where);
  if (query.orderBy !== undefined) {
    if (!Array.isArray(query.orderBy)) throw new ValidationError("query.orderBy must be an array");
    output.orderBy = query.orderBy.map((item) => {
      const clause = requireObject(item, "order clause");
      const direction = requireText(clause.direction, "order direction");
      if (direction !== "asc" && direction !== "desc") throw new ValidationError("Invalid order direction");
      const nulls = clause.nulls;
      if (nulls !== undefined && nulls !== "first" && nulls !== "last") throw new ValidationError("Invalid null ordering");
      return {
        field: requireText(clause.field, "order field"),
        direction,
        ...(nulls === undefined ? {} : { nulls }),
      };
    });
  }
  if (query.offset !== undefined) output.offset = requireNonNegativeInteger(query.offset, "query.offset");
  if (query.limit !== undefined) output.limit = requireNonNegativeInteger(query.limit, "query.limit");
  if (query.projection !== undefined) {
    if (!Array.isArray(query.projection) || query.projection.some((field) => typeof field !== "string" || field.trim() === "")) {
      throw new ValidationError("query.projection must be an array of field names");
    }
    output.projection = [...new Set(["id", ...query.projection])];
  }
  return output;
}

export function validateOperation(value: unknown): TraceOperation {
  const operation = requireObject(value, "operation");
  const op = requireText(operation.op, "operation.op");
  if (op === "put") return { op, record: validateRecord(operation.record) };
  if (op === "delete") return { op, id: requireText(operation.id, "operation.id") };
  if (op === "query") {
    return {
      op,
      query: validateQuery(operation.query),
      ...(operation.label === undefined ? {} : { label: requireText(operation.label, "operation.label") }),
    };
  }
  throw new ValidationError("Unsupported operation", { op });
}

export function validateTrace(value: unknown): Trace {
  if (!Array.isArray(value) || value.length === 0) throw new ValidationError("Trace must be a non-empty array");
  return value.map(validateOperation);
}
