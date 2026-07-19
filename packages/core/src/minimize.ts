import { ValidationError, clone } from "./canonical.ts";
import { validateTrace } from "./schema.ts";
import type { DifferentialResult, JsonValue, MinimizeResult, Predicate, QuerySpec, Trace, TraceOperation } from "./types.ts";

export interface MinimizeOptions {
  preserve?: "kind" | "fingerprint";
  maxEvaluations?: number;
}

function failureIdentity(result: DifferentialResult, mode: "kind" | "fingerprint"): string | null {
  if (!result.mismatch) return null;
  return mode === "fingerprint" ? result.mismatch.fingerprint : result.mismatch.kind;
}

function chunks(length: number, count: number): Array<[number, number]> {
  const output: Array<[number, number]> = [];
  const size = Math.ceil(length / count);
  for (let start = 0; start < length; start += size) output.push([start, Math.min(length, start + size)]);
  return output;
}

function simplifiedValues(value: JsonValue): JsonValue[] {
  if (typeof value === "number") {
    if (value === 0) return [];
    if (value === 1 || value === -1) return [0];
    return [0, 1, -1];
  }
  if (typeof value === "string") {
    if (value === "") return [];
    if (value === "a") return [""];
    return ["", "a"];
  }
  if (typeof value === "boolean") return value ? [false] : [];
  if (Array.isArray(value) && value.length > 0) {
    return value.length === 1 ? [[]] : [[], value.slice(0, 1)];
  }
  return [];
}

function predicateCandidates(predicate: Predicate): Predicate[] {
  if (predicate.op === "and" || predicate.op === "or") {
    const candidates = [...predicate.predicates];
    if (predicate.predicates.length > 1) {
      for (let index = 0; index < predicate.predicates.length; index += 1) {
        candidates.push({ ...predicate, predicates: predicate.predicates.filter((_, item) => item !== index) });
      }
    }
    return candidates;
  }
  if (predicate.op === "not") return [predicate.predicate];
  if ("value" in predicate) {
    return simplifiedValues(predicate.value).map((value) => ({ ...predicate, value }));
  }
  return [];
}

function queryCandidates(query: QuerySpec): QuerySpec[] {
  const candidates: QuerySpec[] = [];
  if (query.projection !== undefined) {
    const candidate = { ...query };
    delete candidate.projection;
    candidates.push(candidate);
  }
  if (query.offset !== undefined) {
    const candidate = { ...query };
    delete candidate.offset;
    candidates.push(candidate);
  }
  if (query.limit !== undefined) {
    const candidate = { ...query };
    delete candidate.limit;
    candidates.push(candidate);
    if (query.limit > 1) candidates.push({ ...query, limit: 1 });
  }
  if (query.orderBy !== undefined) {
    const candidate = { ...query };
    delete candidate.orderBy;
    candidates.push(candidate);
  }
  if (query.where !== undefined) {
    for (const where of predicateCandidates(query.where)) candidates.push({ ...query, where });
  }
  return candidates.map((candidate) => JSON.parse(JSON.stringify(candidate)) as QuerySpec);
}

function operationCandidates(operation: TraceOperation): TraceOperation[] {
  if (operation.op === "put") {
    const output: TraceOperation[] = [];
    for (const key of Object.keys(operation.record).filter((key) => key !== "id").sort()) {
      const record = { ...operation.record };
      delete record[key];
      output.push({ op: "put", record });
      for (const value of simplifiedValues(operation.record[key] as JsonValue)) {
        output.push({ op: "put", record: { ...operation.record, [key]: value } });
      }
    }
    return output;
  }
  if (operation.op === "query") {
    const output = queryCandidates(operation.query).map((query): TraceOperation => ({
      op: "query",
      query,
      ...(operation.label === undefined ? {} : { label: operation.label }),
    }));
    if (operation.label !== undefined) output.unshift({ op: "query", query: operation.query });
    return output;
  }
  return [];
}

export function minimizeTrace(
  rawTrace: Trace,
  evaluate: (trace: Trace) => DifferentialResult,
  options: MinimizeOptions = {},
): MinimizeResult {
  let trace = validateTrace(rawTrace);
  let result = evaluate(trace);
  if (!result.mismatch) throw new ValidationError("Cannot minimize a trace that does not fail");
  const mode = options.preserve ?? "kind";
  const identity = failureIdentity(result, mode) as string;
  const maxEvaluations = options.maxEvaluations ?? 10_000;
  let evaluations = 1;

  const preserves = (candidate: Trace): DifferentialResult | null => {
    if (candidate.length === 0 || evaluations >= maxEvaluations) return null;
    let valid: Trace;
    try {
      valid = validateTrace(candidate);
    } catch {
      return null;
    }
    evaluations += 1;
    const candidateResult = evaluate(valid);
    return failureIdentity(candidateResult, mode) === identity ? candidateResult : null;
  };

  let granularity = 2;
  while (trace.length >= 2 && evaluations < maxEvaluations) {
    let reduced = false;
    for (const [start, end] of chunks(trace.length, granularity)) {
      const candidate = [...trace.slice(0, start), ...trace.slice(end)];
      const candidateResult = preserves(candidate);
      if (candidateResult) {
        trace = candidate;
        result = candidateResult;
        granularity = Math.max(2, granularity - 1);
        reduced = true;
        break;
      }
    }
    if (reduced) continue;
    if (granularity >= trace.length) break;
    granularity = Math.min(trace.length, granularity * 2);
  }

  let changed = true;
  while (changed && evaluations < maxEvaluations) {
    changed = false;
    for (let index = 0; index < trace.length && !changed; index += 1) {
      for (const operation of operationCandidates(trace[index] as TraceOperation)) {
        const candidate = trace.map((entry, item) => item === index ? operation : entry);
        const candidateResult = preserves(candidate);
        if (candidateResult) {
          trace = validateTrace(candidate);
          result = candidateResult;
          changed = true;
          break;
        }
      }
    }
  }

  return {
    trace: clone(trace),
    result: clone(result),
    originalLength: rawTrace.length,
    minimizedLength: trace.length,
    evaluations,
  };
}
