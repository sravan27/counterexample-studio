import { createHash } from "node:crypto";

const DEFINITIONS = [
  {
    manifest: {
      id: "upsert-replaces-existing",
      version: 1,
      title: "Upsert replacement semantics",
      description: "A later put for an existing identity replaces the complete visible record.",
      invariant: "After put(id, A) then put(id, B), every read of id observes B and no field from A survives unless present in B.",
      operationKinds: ["put", "query"],
      defaultTarget: "first-write-wins",
      tags: ["state", "upsert", "identity"],
    },
    terms: ["upsert", "replace", "replacement", "overwrite", "same id", "existing identity", "later put"],
  },
  {
    manifest: {
      id: "delete-removes-visible-state",
      version: 1,
      title: "Delete visibility semantics",
      description: "Deletion removes a record from both point and collection reads until an explicit later put.",
      invariant: "After delete(id), no query may return id without a subsequent put(id, ...).",
      operationKinds: ["put", "delete", "query"],
      defaultTarget: "delete-noop",
      tags: ["state", "delete", "tombstone"],
    },
    terms: ["delete", "deleted", "remove", "removed", "disappear", "absent", "tombstone"],
  },
  {
    manifest: {
      id: "filter-before-pagination",
      version: 1,
      title: "Filter-before-pagination semantics",
      description: "Predicates constrain the candidate set before offset and limit select a page.",
      invariant: "query(where=P, limit=N) equals take(N, filter(P, orderedRows)), never filter(P, take(N, orderedRows)).",
      operationKinds: ["put", "query"],
      defaultTarget: "limit-before-filter",
      tags: ["query", "pagination", "filter"],
    },
    terms: ["filter", "pagination", "paginate", "limit", "offset", "page"],
  },
  {
    manifest: {
      id: "deterministic-order-ties",
      version: 1,
      title: "Deterministic total ordering",
      description: "Ordered queries use record identity as a deterministic final tie-breaker.",
      invariant: "Rows equal on every requested sort key are returned in ascending id order on every execution.",
      operationKinds: ["put", "query"],
      defaultTarget: "unstable-ties",
      tags: ["query", "ordering", "determinism"],
    },
    terms: ["order", "ordering", "sort", "tie", "ties", "stable", "deterministic"],
  },
  {
    manifest: {
      id: "sql-null-comparison",
      version: 1,
      title: "SQL-style null comparison",
      description: "Ordinary equality and inequality do not match null; null checks are explicit.",
      invariant: "where(field = null) returns no rows; callers must use isNull(field) to select null or missing values.",
      operationKinds: ["put", "query"],
      defaultTarget: "null-equals-null",
      tags: ["query", "null", "three-valued-logic"],
    },
    terms: ["null", "isnull", "missing value", "three-valued", "sql equality"],
  },
  {
    manifest: {
      id: "inclusive-range-boundary",
      version: 1,
      title: "Inclusive range boundaries",
      description: "Greater-than-or-equal predicates include values exactly on the boundary.",
      invariant: "For every scalar x, where(field >= x) includes records whose field equals x.",
      operationKinds: ["put", "query"],
      defaultTarget: "gte-exclusive",
      tags: ["query", "range", "boundary"],
    },
    terms: ["inclusive", "boundary", "range", "greater than or equal", ">=", "gte"],
  },
];

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function digest(manifest) {
  return createHash("sha256").update(canonical(manifest)).digest("hex");
}

export function compileInvariant(invariant, requestedId) {
  const text = invariant.toLowerCase();
  if (requestedId !== undefined) {
    const definition = DEFINITIONS.find(({ manifest }) => manifest.id === requestedId);
    if (definition === undefined) {
      return {
        status: "needs_disambiguation",
        reason: `Unknown built-in contract: ${requestedId}`,
        candidates: DEFINITIONS.map(({ manifest }) => manifest),
      };
    }
    return {
      status: "compiled",
      contract: definition.manifest,
      contractDigest: digest(definition.manifest),
      matchedTerms: definition.terms.filter((term) => text.includes(term)),
      selection: "explicit_contract_id",
    };
  }

  const ranked = DEFINITIONS
    .map((definition) => ({
      definition,
      matchedTerms: definition.terms.filter((term) => text.includes(term)),
    }))
    .filter(({ matchedTerms }) => matchedTerms.length > 0)
    .sort((left, right) => right.matchedTerms.length - left.matchedTerms.length);
  if (ranked.length === 0 || (ranked[1] && ranked[0].matchedTerms.length === ranked[1].matchedTerms.length)) {
    return {
      status: "needs_disambiguation",
      reason: ranked.length === 0
        ? "The invariant does not uniquely match a registered executable contract."
        : "The invariant matches multiple registered contracts equally.",
      candidates: (ranked.length === 0 ? DEFINITIONS : ranked.map(({ definition }) => definition))
        .map(({ manifest }) => manifest),
    };
  }
  const winner = ranked[0];
  return {
    status: "compiled",
    contract: winner.definition.manifest,
    contractDigest: digest(winner.definition.manifest),
    matchedTerms: winner.matchedTerms,
    selection: "deterministic_term_match",
  };
}
