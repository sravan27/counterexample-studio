import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import * as postFixRules from "powersync-sync-rules-post";
import * as preFixRules from "powersync-sync-rules-pre";

import { minimizeTrace } from "../packages/core/src/minimize.ts";
import { runDifferentialTrace } from "../packages/core/src/runner.ts";

const PRE_FIX_VERSION = "0.0.0-dev-20260515144844";
const POST_FIX_VERSION = "0.0.0-dev-20260602073133";
const EVIDENCE_URL = new URL(
  "../evidence/historical/powersync-division-by-zero.json",
  import.meta.url,
);

const PACKAGE_METADATA = {
  before: {
    alias: "powersync-sync-rules-pre",
    name: "@powersync/service-sync-rules",
    version: PRE_FIX_VERSION,
    publishedAt: "2026-05-15T14:49:02.026Z",
    registryIntegrity:
      "sha512-2HfBSQLSHTDJjzenQEUwIE9X5Nbc1xItoLA86GhBzb9ktXvSuXd7x599IHaSg3T/6EcDQ4w1MEPRVJxcD6CwNw==",
  },
  after: {
    alias: "powersync-sync-rules-post",
    name: "@powersync/service-sync-rules",
    version: POST_FIX_VERSION,
    publishedAt: "2026-06-02T07:31:52.850Z",
    registryIntegrity:
      "sha512-RmaHpc6vO+JkBoAGXTDWYi3A4+qIR0KhExAmgjW3AF3m5+yclSXxxJTu1eUobnuNh0ZGf0bzo+TFDCpMp//1ig==",
  },
};

const DIRECT_CASES = [
  { id: "real-zero", numerator: 5, denominator: 0, expected: null },
  { id: "zero-over-zero", numerator: 0, denominator: 0, expected: null },
  { id: "string-zero", numerator: 5, denominator: "0", expected: null },
  { id: "control", numerator: 6, denominator: 2, expected: 3 },
];

const TRACE = [
  { op: "put", record: { id: "noise-01", numerator: 8, denominator: 2 } },
  { op: "put", record: { id: "noise-02", numerator: 9, denominator: 3 } },
  { op: "put", record: { id: "noise-03", numerator: -8, denominator: 4 } },
  { op: "put", record: { id: "noise-04", numerator: 1, denominator: 5 } },
  { op: "put", record: { id: "noise-05", numerator: 12, denominator: -3 } },
  { op: "put", record: { id: "noise-06", numerator: 7, denominator: 2 } },
  { op: "put", record: { id: "noise-07", numerator: 0, denominator: 5 } },
  { op: "put", record: { id: "noise-08", numerator: 21, denominator: 7 } },
  {
    op: "put",
    record: { id: "powersync-zero-denominator", numerator: 5, denominator: 0 },
  },
  {
    op: "query",
    label: "rows where division result is SQL NULL",
    query: { where: { op: "isNull", field: "quotient" } },
  },
];

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

function canonicalStringify(value) {
  return JSON.stringify(canonicalize(value));
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function encodeOutcome(run) {
  try {
    const value = run();
    if (value === null) return { kind: "null", value: null };
    if (typeof value === "number" && Number.isNaN(value)) {
      return { kind: "number", value: "NaN" };
    }
    if (typeof value === "number" && !Number.isFinite(value)) {
      return { kind: "number", value: String(value) };
    }
    if (typeof value === "bigint") {
      return { kind: "bigint", value: value.toString() };
    }
    return { kind: typeof value, value };
  } catch (error) {
    return {
      kind: "error",
      name: error instanceof Error ? error.name : "ThrownValue",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

function divideWith(module, numerator, denominator) {
  return module.getOperatorFunction("/").call(numerator, denominator);
}

function sqliteDivision(numerator, denominator) {
  const numericDenominator = Number(denominator);
  if (numericDenominator === 0) return null;
  return Number(numerator) / numericDenominator;
}

class DivisionNullFilterAdapter {
  constructor(name, divide) {
    this.name = name;
    this.divide = divide;
    this.records = new Map();
  }

  apply(operation) {
    if (operation.op === "put") {
      this.records.set(operation.record.id, structuredClone(operation.record));
      return { kind: "mutation", ok: true };
    }
    if (operation.op === "delete") {
      this.records.delete(operation.id);
      return { kind: "mutation", ok: true };
    }

    const rows = [];
    for (const record of this.snapshot()) {
      if (
        typeof record.numerator !== "number" ||
        (typeof record.denominator !== "number" &&
          typeof record.denominator !== "string")
      ) {
        continue;
      }
      if (this.divide(record.numerator, record.denominator) === null) {
        rows.push(record);
      }
    }
    return { kind: "query", rows };
  }

  snapshot() {
    return [...this.records.values()]
      .map((record) => structuredClone(record))
      .sort((left, right) => left.id.localeCompare(right.id));
  }
}

function evaluateWith(divide, trace) {
  return runDifferentialTrace(
    trace,
    new DivisionNullFilterAdapter("sqlite-reference", sqliteDivision),
    new DivisionNullFilterAdapter("powersync-target", divide),
  );
}

async function sourceDigest(alias) {
  const sourceUrl = new URL(
    `../node_modules/${alias}/dist/sql_functions.js`,
    import.meta.url,
  );
  return sha256(await readFile(sourceUrl));
}

async function buildEvidence() {
  const preDivide = (numerator, denominator) =>
    divideWith(preFixRules, numerator, denominator);
  const postDivide = (numerator, denominator) =>
    divideWith(postFixRules, numerator, denominator);

  const directCases = DIRECT_CASES.map((testCase) => ({
    ...testCase,
    before: encodeOutcome(() =>
      preDivide(testCase.numerator, testCase.denominator),
    ),
    after: encodeOutcome(() =>
      postDivide(testCase.numerator, testCase.denominator),
    ),
  }));

  assert.deepEqual(directCases[0].before, {
    kind: "number",
    value: "Infinity",
  });
  assert.deepEqual(directCases[0].after, { kind: "null", value: null });
  assert.deepEqual(directCases[1].before, { kind: "number", value: "NaN" });
  assert.deepEqual(directCases[1].after, { kind: "null", value: null });
  assert.equal(directCases[3].before.value, 3);
  assert.equal(directCases[3].after.value, 3);

  const preFixRun = evaluateWith(preDivide, TRACE);
  const minimized = minimizeTrace(
    TRACE,
    (candidate) => evaluateWith(preDivide, candidate),
    { preserve: "kind" },
  );
  const postFixRun = evaluateWith(postDivide, minimized.trace);

  assert.equal(preFixRun.match, false);
  assert.equal(preFixRun.mismatch?.kind, "missing_rows");
  assert.deepEqual(preFixRun.mismatch?.details.missing, [
    "powersync-zero-denominator",
  ]);
  assert.equal(minimized.minimizedLength, 2);
  assert.equal(postFixRun.match, true);

  const payload = {
    schemaVersion: "1.0",
    title: "Published PowerSync division-by-zero replay",
    claim:
      "A published pre-fix PowerSync evaluator diverges from SQLite for division by zero; the published post-fix evaluator agrees on the minimized witness.",
    upstream: {
      repository: "powersync-ja/powersync-service",
      pullRequest: "https://github.com/powersync-ja/powersync-service/pull/646",
      affectedSource:
        "packages/sync-rules/src/sql_functions.ts",
      fixCommit: "64d2d0acd04c988a8dbf39c3ef8196b788ad4620",
      mergeCommit: "0aab0f9a145322df80a02398656fa8f3ef58a372",
    },
    packages: {
      before: {
        ...PACKAGE_METADATA.before,
        sourceSha256: await sourceDigest(PACKAGE_METADATA.before.alias),
      },
      after: {
        ...PACKAGE_METADATA.after,
        sourceSha256: await sourceDigest(PACKAGE_METADATA.after.alias),
      },
    },
    directCases,
    differentialReplay: {
      originalTraceLength: TRACE.length,
      minimizedTraceLength: minimized.minimizedLength,
      evaluations: minimized.evaluations,
      mismatchKind: preFixRun.mismatch?.kind ?? null,
      missingRows: preFixRun.mismatch?.details.missing ?? [],
      minimizedTrace: minimized.trace,
      beforeFixMatch: preFixRun.match,
      afterFixMatch: postFixRun.match,
    },
    verification: {
      command: "npm run verify:historical",
      networkRequired: false,
      executionBoundary:
        "The verifier imports the two npm packages pinned in package-lock.json and executes their exported division operator.",
    },
  };

  return {
    ...payload,
    integrity: {
      algorithm: "sha256",
      digest: sha256(canonicalStringify(payload)),
    },
  };
}

const evidence = await buildEvidence();

if (process.argv.includes("--write")) {
  await mkdir(dirname(fileURLToPath(EVIDENCE_URL)), { recursive: true });
  await writeFile(EVIDENCE_URL, `${JSON.stringify(evidence, null, 2)}\n`);
} else {
  const checkedIn = JSON.parse(await readFile(EVIDENCE_URL, "utf8"));
  assert.deepEqual(checkedIn, evidence);
}

const mainCase = evidence.directCases.find(
  (testCase) => testCase.id === "real-zero",
);
console.log("Verified published PowerSync replay");
console.log(
  `  before ${PRE_FIX_VERSION}: 5 / 0 -> ${mainCase.before.value}`,
);
console.log(
  `  after  ${POST_FIX_VERSION}: 5 / 0 -> ${String(mainCase.after.value).toUpperCase()}`,
);
console.log(
  `  trace: ${evidence.differentialReplay.originalTraceLength} -> ${evidence.differentialReplay.minimizedTraceLength} operations`,
);
console.log(`  evidence: sha256:${evidence.integrity.digest}`);
