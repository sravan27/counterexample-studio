import { ValidationError, clone } from "./canonical.ts";
import { getContractManifest } from "./catalog.ts";
import { SeededRandom } from "./prng.ts";
import { validateContractManifest, validateTrace } from "./schema.ts";
import type { ContractDefinition, ContractManifest, DataRecord, Trace } from "./types.ts";

function noise(seed: number, count: number): Trace {
  const random = new SeededRandom(seed);
  const trace: Trace = [];
  for (let index = 0; index < count; index += 1) {
    const record: DataRecord = {
      id: `noise-${String(index).padStart(4, "0")}-${random.nextUint32().toString(16).padStart(8, "0")}`,
      group: `g${random.integer(0, 4)}`,
      score: random.integer(-100, 100),
      active: random.next() >= 0.5,
      payload: `p${random.nextUint32().toString(36)}`,
    };
    trace.push({ op: "put", record });
  }
  return trace;
}

function generator(witness: Trace): (seed: number, steps?: number) => Trace {
  return (seed, steps = 12) => {
    if (!Number.isSafeInteger(seed)) throw new ValidationError("Seed must be a safe integer", { seed });
    if (!Number.isSafeInteger(steps) || steps < witness.length) {
      throw new ValidationError(`steps must be at least ${witness.length}`, { steps });
    }
    return validateTrace([...noise(seed, steps - witness.length), ...clone(witness)]);
  };
}

function define(manifest: ContractManifest, witness: Trace): ContractDefinition {
  return Object.freeze({
    manifest: Object.freeze(validateContractManifest(manifest)),
    generate: generator(validateTrace(witness)),
  });
}

const definitions: ContractDefinition[] = [
  define(getContractManifest("upsert-replaces-existing"), [
    { op: "put", record: { id: "witness", score: 1, payload: "old" } },
    { op: "put", record: { id: "witness", score: 2, payload: "new" } },
    { op: "query", label: "observe replacement", query: { where: { op: "eq", field: "id", value: "witness" } } },
  ]),
  define(getContractManifest("delete-removes-visible-state"), [
    { op: "put", record: { id: "deleted-witness", active: true } },
    { op: "delete", id: "deleted-witness" },
    { op: "query", label: "observe deletion", query: { where: { op: "eq", field: "id", value: "deleted-witness" } } },
  ]),
  define(getContractManifest("filter-before-pagination"), [
    { op: "put", record: { id: "000-blocker", active: false, score: 1 } },
    { op: "put", record: { id: "999-match", active: true, score: 2 } },
    {
      op: "query",
      label: "filter then page",
      query: {
        where: { op: "eq", field: "active", value: true },
        orderBy: [{ field: "id", direction: "asc" }],
        limit: 1,
      },
    },
  ]),
  define(getContractManifest("deterministic-order-ties"), [
    { op: "put", record: { id: "tie-z", group: "tie", score: 500 } },
    { op: "put", record: { id: "tie-a", group: "tie", score: 500 } },
    {
      op: "query",
      label: "stable ties",
      query: {
        where: { op: "eq", field: "group", value: "tie" },
        orderBy: [{ field: "score", direction: "asc" }],
      },
    },
  ]),
  define(getContractManifest("sql-null-comparison"), [
    { op: "put", record: { id: "null-witness", group: null } },
    { op: "put", record: { id: "value-witness", group: "present" } },
    {
      op: "query",
      label: "null equality is unknown",
      query: { where: { op: "eq", field: "group", value: null } },
    },
  ]),
  define(getContractManifest("inclusive-range-boundary"), [
    { op: "put", record: { id: "boundary", score: 10 } },
    { op: "put", record: { id: "below", score: 9 } },
    {
      op: "query",
      label: "inclusive boundary",
      query: {
        where: { op: "gte", field: "score", value: 10 },
        orderBy: [{ field: "id", direction: "asc" }],
      },
    },
  ]),
];

const byId = new Map(definitions.map((definition) => [definition.manifest.id, definition]));

export const CONTRACTS: readonly ContractDefinition[] = Object.freeze(definitions);

export function listContracts(): ContractManifest[] {
  return definitions.map((definition) => clone(definition.manifest));
}

export function getContract(id: string): ContractDefinition {
  const definition = byId.get(id);
  if (!definition) throw new ValidationError("Unknown contract", { id, available: [...byId.keys()] });
  return definition;
}
