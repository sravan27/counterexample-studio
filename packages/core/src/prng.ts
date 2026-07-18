import { ValidationError } from "./canonical.ts";

/** Small deterministic PRNG with identical output across JS runtimes. */
export class SeededRandom {
  #state: number;

  constructor(seed: number) {
    if (!Number.isSafeInteger(seed)) throw new ValidationError("Seed must be a safe integer", { seed });
    this.#state = seed >>> 0;
    if (this.#state === 0) this.#state = 0x9e3779b9;
  }

  nextUint32(): number {
    let value = this.#state;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.#state = value >>> 0;
    return this.#state;
  }

  next(): number {
    return this.nextUint32() / 0x1_0000_0000;
  }

  integer(min: number, max: number): number {
    if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || max < min) {
      throw new ValidationError("Invalid integer range", { min, max });
    }
    return min + Math.floor(this.next() * ((max - min) + 1));
  }

  pick<T>(values: readonly T[]): T {
    if (values.length === 0) throw new ValidationError("Cannot pick from an empty array");
    return values[this.integer(0, values.length - 1)] as T;
  }
}
