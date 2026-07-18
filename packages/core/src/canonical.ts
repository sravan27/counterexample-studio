import { createHash } from "node:crypto";
import type { JsonValue } from "./types.ts";

export class CounterexampleError extends Error {
  readonly code: string;
  readonly details: Record<string, unknown>;

  constructor(message: string, code = "COUNTEREXAMPLE_ERROR", details: Record<string, unknown> = {}) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.details = details;
  }
}

export class ValidationError extends CounterexampleError {
  constructor(message: string, details: Record<string, unknown> = {}) {
    super(message, "VALIDATION_ERROR", details);
  }
}

export function canonicalize(value: unknown, path = "$"): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new ValidationError("Only finite numbers are supported", { path });
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) return value.map((entry, index) => canonicalize(entry, `${path}[${index}]`));
  if (typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new ValidationError("Only plain objects are supported", { path });
    }
    const output: Record<string, JsonValue> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const entry = (value as Record<string, unknown>)[key];
      if (entry === undefined) throw new ValidationError("Undefined is not serializable", { path: `${path}.${key}` });
      output[key] = canonicalize(entry, `${path}.${key}`);
    }
    return output;
  }
  throw new ValidationError("Unsupported value", { path, type: typeof value });
}

export function canonicalStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function hashCanonical(value: unknown): string {
  return sha256(canonicalStringify(value));
}

export function clone<T>(value: T): T {
  return JSON.parse(canonicalStringify(value)) as T;
}
