import type { ContractManifest } from "./types.ts";

const manifests: ContractManifest[] = [
  {
    id: "upsert-replaces-existing",
    version: 1,
    title: "Upsert replacement semantics",
    description: "A later put for an existing identity replaces the complete visible record.",
    invariant: "After put(id, A) then put(id, B), every read of id observes B and no field from A survives unless present in B.",
    operationKinds: ["put", "query"],
    defaultTarget: "first-write-wins",
    tags: ["state", "upsert", "identity"],
  },
  {
    id: "delete-removes-visible-state",
    version: 1,
    title: "Delete visibility semantics",
    description: "Deletion removes a record from both point and collection reads until an explicit later put.",
    invariant: "After delete(id), no query may return id without a subsequent put(id, ...).",
    operationKinds: ["put", "delete", "query"],
    defaultTarget: "delete-noop",
    tags: ["state", "delete", "tombstone"],
  },
  {
    id: "filter-before-pagination",
    version: 1,
    title: "Filter-before-pagination semantics",
    description: "Predicates constrain the candidate set before offset and limit select a page.",
    invariant: "query(where=P, limit=N) equals take(N, filter(P, orderedRows)), never filter(P, take(N, orderedRows)).",
    operationKinds: ["put", "query"],
    defaultTarget: "limit-before-filter",
    tags: ["query", "pagination", "filter"],
  },
  {
    id: "deterministic-order-ties",
    version: 1,
    title: "Deterministic total ordering",
    description: "Ordered queries use record identity as a deterministic final tie-breaker.",
    invariant: "Rows equal on every requested sort key are returned in ascending id order on every execution.",
    operationKinds: ["put", "query"],
    defaultTarget: "unstable-ties",
    tags: ["query", "ordering", "determinism"],
  },
  {
    id: "sql-null-comparison",
    version: 1,
    title: "SQL-style null comparison",
    description: "Ordinary equality and inequality do not match null; null checks are explicit.",
    invariant: "where(field = null) returns no rows; callers must use isNull(field) to select null or missing values.",
    operationKinds: ["put", "query"],
    defaultTarget: "null-equals-null",
    tags: ["query", "null", "three-valued-logic"],
  },
  {
    id: "inclusive-range-boundary",
    version: 1,
    title: "Inclusive range boundaries",
    description: "Greater-than-or-equal predicates include values exactly on the boundary.",
    invariant: "For every scalar x, where(field >= x) includes records whose field equals x.",
    operationKinds: ["put", "query"],
    defaultTarget: "gte-exclusive",
    tags: ["query", "range", "boundary"],
  },
];

function copyManifest(manifest: ContractManifest): ContractManifest {
  return {
    ...manifest,
    operationKinds: [...manifest.operationKinds],
    tags: [...manifest.tags],
  };
}

export const CONTRACT_MANIFESTS: readonly ContractManifest[] = Object.freeze(
  manifests.map((manifest) => Object.freeze(copyManifest(manifest))),
);

export function listContractManifests(): ContractManifest[] {
  return CONTRACT_MANIFESTS.map(copyManifest);
}

export function getContractManifest(id: string): ContractManifest {
  const manifest = CONTRACT_MANIFESTS.find((candidate) => candidate.id === id);
  if (!manifest) throw new Error(`Unknown contract manifest: ${id}`);
  return copyManifest(manifest);
}
