import {
  AlertTriangle,
  ArrowRight,
  ArrowDownToLine,
  BadgeCheck,
  Braces,
  Bug,
  Check,
  CheckCircle2,
  CircleDot,
  Clipboard,
  Code2,
  Database,
  FileJson2,
  FlaskConical,
  ExternalLink,
  GitCompareArrows,
  History,
  Info,
  Minimize2,
  PackageCheck,
  Play,
  RefreshCcw,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  X,
  Zap,
} from "lucide-react";
import { listContractManifests } from "@counterexample-studio/core/catalog";
import { useMemo, useState } from "react";
import historicalReplay from "../../../evidence/historical/powersync-division-by-zero.json";
import { replayInDexie } from "./db";
import {
  formatOperation,
  pendingEvictionScenario,
  replay,
} from "./scenario";
import type { Operation, RunPhase, StepResult } from "./types";

const CONTRACT_JSON = {
  id: "pending-live-query-eviction",
  subject: "customer",
  transition: { from: "pending", to: "complete" },
  observation: { query: { status: "pending" } },
  invariant: "updated record is absent exactly once",
  comparator: "ordered-record-ids",
};

const CONTRACT_LIBRARY = listContractManifests();
const INITIAL_STEPS = replay(pendingEvictionScenario.trace, false);

function sleep(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

export function App() {
  const [phase, setPhase] = useState<RunPhase>("failed");
  const [trace, setTrace] = useState<Operation[]>(pendingEvictionScenario.trace);
  const [steps, setSteps] = useState<StepResult[]>(INITIAL_STEPS);
  const [fixed, setFixed] = useState(false);
  const [selectedStep, setSelectedStep] = useState(
    INITIAL_STEPS.findIndex((step) => step.mismatch),
  );
  const [copied, setCopied] = useState(false);
  const [exported, setExported] = useState(false);
  const [rightTab, setRightTab] = useState<"verdict" | "contract" | "upstream">("verdict");

  const mismatch = useMemo(
    () => steps.find((step) => step.mismatch),
    [steps],
  );
  const displayedStep = steps[selectedStep] ?? steps.at(-1);
  const observedReference = mismatch?.reference ?? pendingEvictionScenario.expected;
  const observedTarget = mismatch?.target ?? pendingEvictionScenario.actual;

  async function runLab(nextFixed = fixed, nextTrace = trace) {
    setPhase("running");
    await sleep(420);
    const results = await replayInDexie(
      nextTrace,
      nextFixed,
      pendingEvictionScenario.seed,
    );
    setSteps(results);
    const failureIndex = results.findIndex((step) => step.mismatch);
    setSelectedStep(failureIndex >= 0 ? failureIndex : results.length - 1);
    setPhase(results.some((step) => step.mismatch) ? "failed" : "passed");
  }

  async function minimizeFailure() {
    setPhase("running");
    await sleep(360);
    setTrace(pendingEvictionScenario.minimizedTrace);
    const results = await replayInDexie(
      pendingEvictionScenario.minimizedTrace,
      false,
      pendingEvictionScenario.seed,
    );
    setSteps(results);
    setSelectedStep(results.length - 1);
    setPhase("minimized");
  }

  async function applyFix() {
    setFixed(true);
    await runLab(true, pendingEvictionScenario.minimizedTrace);
  }

  function resetLab() {
    setFixed(false);
    setTrace(pendingEvictionScenario.trace);
    const results = replay(pendingEvictionScenario.trace, false);
    setSteps(results);
    setSelectedStep(results.findIndex((step) => step.mismatch));
    setPhase("failed");
  }

  function exportRegression() {
    const blob = new Blob([pendingEvictionScenario.exportedTest], {
      type: "text/typescript",
    });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = "pending-live-query.regression.test.ts";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setExported(true);
    window.setTimeout(() => {
      URL.revokeObjectURL(href);
      setExported(false);
    }, 1500);
  }

  async function copyContract() {
    await navigator.clipboard.writeText(JSON.stringify(CONTRACT_JSON, null, 2));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1300);
  }

  return (
    <div className="studio-shell">
      <header className="app-bar">
        <div className="product-name">
          <span className="product-mark"><ScanSearch /></span>
          <div>
            <strong>Counterexample Studio</strong>
            <span>Executable specifications for silent wrong data</span>
          </div>
        </div>
        <div className="app-status">
          <button
            className="upstream-header-badge"
            onClick={() => setRightTab("upstream")}
            type="button"
          >
            <PackageCheck /> Published replay verified
          </button>
          <span className="runtime-badge"><CircleDot /> Local deterministic runtime</span>
          <span className="build-badge"><Sparkles /> Built with Codex + GPT-5.6</span>
          <button
            aria-label="Reset lab"
            className="icon-button"
            onClick={resetLab}
            title="Reset lab"
            type="button"
          >
            <RefreshCcw />
          </button>
        </div>
      </header>

      <main className="lab-grid">
        <aside className="contract-pane">
          <div className="pane-heading">
            <span className="pane-icon"><Braces /></span>
            <div><span>Input</span><h1>Executable contract</h1></div>
          </div>

          <span className="field-label">Active demonstration</span>
          <div className="active-contract">
            <GitCompareArrows />
            <div><strong>Pending live-query eviction</strong><span>IndexedDB state transition</span></div>
            <BadgeCheck />
          </div>

          <label className="field-label" htmlFor="invariant">Behavior invariant</label>
          <textarea
            id="invariant"
            readOnly
            rows={6}
            value={pendingEvictionScenario.invariant}
          />
          <div className="compiler-note"><Sparkles /><span>Codex compiles this sentence into the contract shown in the evidence pane.</span></div>

          <div className="parameter-grid">
            <label><span>Seed</span><input readOnly value={pendingEvictionScenario.seed} /></label>
            <label><span>Operations</span><input readOnly value={trace.length} /></label>
          </div>

          <div className="adapter-block">
            <div className="adapter-title"><Database /><div><span>Target adapter</span><strong>Dexie + live-query cache</strong></div></div>
            <div className="adapter-meta"><span>IndexedDB</span><span>{fixed ? "corrected" : "fault injected"}</span></div>
          </div>

          <button
            className="run-button"
            disabled={phase === "running"}
            onClick={() => void runLab()}
            type="button"
          >
            {phase === "running" ? <Zap className="spin" /> : <Play />}
            {phase === "running" ? "Running differential lab" : `Run ${trace.length} operations`}
          </button>

          <section className="library-list" aria-label="Available contract templates">
            <div className="subheading"><span>Included contracts</span><strong>6</strong></div>
            {CONTRACT_LIBRARY.map((contract, index) => (
              <div className="library-row" key={contract.id} title={contract.description}>
                <span>{index + 1}</span><strong>{contract.title}</strong><Check />
              </div>
            ))}
          </section>
        </aside>

        <section className="experiment-pane">
          <ResultBanner
            divergenceStep={mismatch ? mismatch.index + 1 : null}
            phase={phase}
            traceLength={trace.length}
          />

          <button
            className="upstream-proof-strip"
            onClick={() => setRightTab("upstream")}
            type="button"
          >
            <PackageCheck />
            <span>
              <strong>Verified on published upstream code</strong>
              <small>PowerSync package replay: Infinity before the fix → SQLite NULL after it</small>
            </span>
            <ArrowRight />
          </button>

          <section className="application-state">
            <div className="section-title">
              <div><span>Observed application state</span><h2>Pending customer queue</h2></div>
              <span className="no-error"><CheckCircle2 /> Request completed · no exception</span>
            </div>
            <div className="comparison-grid">
              <ResultColumn label="Reference model" records={observedReference} tone="reference" />
              <ResultColumn label="Target adapter" records={observedTarget} tone={phase === "passed" ? "reference" : "target"} />
            </div>
          </section>

          <section className="trace-section">
            <div className="section-title">
              <div><span>Deterministic replay</span><h2>Operation timeline</h2></div>
              <div className="trace-legend"><span><i className="dot neutral" />same</span><span><i className="dot failed" />diverged</span></div>
            </div>
            <div className="trace-list" role="list">
              {steps.map((step) => (
                <button
                  className={`${step.mismatch ? "trace-row mismatch" : "trace-row"} ${selectedStep === step.index ? "selected" : ""}`}
                  key={step.operation.id}
                  onClick={() => setSelectedStep(step.index)}
                  role="listitem"
                  type="button"
                >
                  <span className="step-number">{String(step.index + 1).padStart(2, "0")}</span>
                  <OperationIcon type={step.operation.type} />
                  <span className="operation-copy"><strong>{formatOperation(step.operation)}</strong><small>{step.operation.noise ? "generated coverage" : "failure-relevant"}</small></span>
                  <span className={step.mismatch ? "step-state failed" : "step-state"}>{step.mismatch ? <><X /> mismatch</> : <><Check /> equal</>}</span>
                </button>
              ))}
            </div>
            {displayedStep && (
              <div className="step-inspector">
                <span>Step {displayedStep.index + 1}</span>
                <code>{JSON.stringify(displayedStep.operation)}</code>
              </div>
            )}
          </section>
        </section>

        <aside className="evidence-pane">
          <div className="tab-list" role="tablist">
            <button aria-selected={rightTab === "verdict"} className={rightTab === "verdict" ? "active" : ""} onClick={() => setRightTab("verdict")} role="tab" type="button">Verdict</button>
            <button aria-selected={rightTab === "contract"} className={rightTab === "contract" ? "active" : ""} onClick={() => setRightTab("contract")} role="tab" type="button">Contract</button>
            <button aria-selected={rightTab === "upstream"} className={rightTab === "upstream" ? "active" : ""} onClick={() => setRightTab("upstream")} role="tab" type="button">Upstream</button>
          </div>

          {rightTab === "verdict" ? (
            <>
              <Verdict phase={phase} />
              <section className="evidence-section">
                <div className="subheading"><span>Counterexample</span><strong>{trace.length} ops</strong></div>
                <div className="reduction-visual">
                  <div><span>Generated trace</span><strong>{pendingEvictionScenario.trace.length}</strong></div>
                  <span className="reduction-line"><Minimize2 /></span>
                  <div><span>Minimal proof</span><strong>{pendingEvictionScenario.minimizedTrace.length}</strong></div>
                </div>
                <button className="action-button" disabled={phase === "running" || phase === "passed"} onClick={() => void minimizeFailure()} type="button"><Minimize2 /> Minimize failure</button>
              </section>

              <section className="evidence-section">
                <div className="subheading"><span>Smallest replay</span><strong>{pendingEvictionScenario.minimizedTrace.length} steps</strong></div>
                <ol className="minimal-steps">
                  {pendingEvictionScenario.minimizedTrace.map((operation) => <li key={operation.id}><span>{operation.type}</span><code>{formatOperation(operation)}</code></li>)}
                </ol>
              </section>

              <section className="evidence-section">
                <div className="subheading"><span>Regression artifact</span><FileJson2 /></div>
                <div className="export-card"><Code2 /><div><strong>pending-live-query.regression.test.ts</strong><span>Runnable Vitest · 18 lines</span></div></div>
                <button className="action-button" onClick={exportRegression} type="button">{exported ? <Check /> : <ArrowDownToLine />} {exported ? "Regression downloaded" : "Export regression test"}</button>
              </section>

              {phase !== "passed" ? (
                <button className="fix-button" onClick={() => void applyFix()} type="button"><ShieldCheck /> Apply corrected invalidation and rerun</button>
              ) : (
                <div className="pass-proof"><BadgeCheck /><div><strong>Correction verified</strong><span>Reference and target agree across the minimized replay.</span></div></div>
              )}
            </>
          ) : rightTab === "contract" ? (
            <ContractPanel copied={copied} onCopy={() => void copyContract()} />
          ) : (
            <HistoricalReplayPanel />
          )}
        </aside>
      </main>

      <footer className="status-bar">
        <span><TerminalSquare /> counterexample-studio@0.1.0</span>
        <span><History /> Seed {pendingEvictionScenario.seed} · deterministic replay</span>
        <span><Database /> IndexedDB persisted locally</span>
        <span className="status-ready"><CircleDot /> ready</span>
      </footer>
    </div>
  );
}

function ResultBanner({
  divergenceStep,
  phase,
  traceLength,
}: {
  divergenceStep: number | null;
  phase: RunPhase;
  traceLength: number;
}) {
  if (phase === "running") {
    return <div className="result-banner running"><Zap className="spin" /><div><span>Executing reference and target</span><strong>Replaying {traceLength} seeded operations…</strong></div></div>;
  }
  if (phase === "passed") {
    return <div className="result-banner passed"><CheckCircle2 /><div><span>Invariant holds</span><strong>Reference and target agree after the correction</strong></div><em>0 divergences</em></div>;
  }
  return <div className="result-banner failed"><AlertTriangle /><div><span>Silent semantic divergence</span><strong>Query returned the wrong customer without any error</strong></div><em>{phase === "minimized" ? "3-step proof" : divergenceStep ? `first at op ${divergenceStep}` : "divergence found"}</em></div>;
}

function ResultColumn({ label, records, tone }: { label: string; records: typeof pendingEvictionScenario.expected; tone: "reference" | "target" }) {
  return (
    <div className={`result-column ${tone}`}>
      <header><span>{label}</span><strong>{records.length} rows</strong></header>
      <div className="customer-list">
        {records.map((record) => (
          <div className={record.status === "complete" ? "customer-row invalid" : "customer-row"} key={`${tone}-${record.id}`}>
            <span className="avatar">{record.name.slice(0, 2).toUpperCase()}</span>
            <div><strong>{record.name}</strong><small>{record.id} · priority {record.priority}</small></div>
            <span className={`status-chip ${record.status}`}>{record.status}</span>
          </div>
        ))}
      </div>
      {tone === "target" && records.some((record) => record.status === "complete") && <footer><Bug /> Soren no longer satisfies <code>status = pending</code></footer>}
    </div>
  );
}

function OperationIcon({ type }: { type: Operation["type"] }) {
  if (type === "query") return <GitCompareArrows className="operation-icon query" />;
  if (type === "update") return <Zap className="operation-icon update" />;
  if (type === "delete") return <X className="operation-icon delete" />;
  return <Database className="operation-icon insert" />;
}

function Verdict({ phase }: { phase: RunPhase }) {
  if (phase === "passed") {
    return <section className="verdict-card passed"><CheckCircle2 /><div><span>PASS</span><h2>Invariant preserved</h2><p>The corrected target evicts the completed customer before the next observation.</p></div></section>;
  }
  return <section className="verdict-card failed"><Bug /><div><span>FAIL · SILENT</span><h2>Stale membership</h2><p>The update commits, but the target query retains a record that no longer matches.</p><code>expected [c-203, c-101]\nactual   [c-203, c-101, c-314]</code></div></section>;
}

function ContractPanel({ copied, onCopy }: { copied: boolean; onCopy: () => void }) {
  return (
    <div className="contract-tab">
      <section className="contract-summary"><FlaskConical /><div><span>Compiled executable spec</span><h2>pending-live-query-eviction</h2><p>Codex mapped the behavior sentence to a transition, observation, and comparator. The deterministic runtime owns the verdict.</p></div></section>
      <div className="code-panel"><header><span>contract.json</span><button aria-label="Copy contract" onClick={onCopy} title="Copy contract" type="button">{copied ? <Check /> : <Clipboard />}</button></header><pre>{JSON.stringify(CONTRACT_JSON, null, 2)}</pre></div>
      <div className="boundary-note"><Info /><p><strong>Evidence boundary</strong><span>Natural language proposes the contract. Only executable replay can mark it pass or fail.</span></p></div>
      <section className="contract-properties"><div><span>Comparator</span><strong>ordered-record-ids</strong></div><div><span>Observation</span><strong>pending query</strong></div><div><span>Transition</span><strong>pending → complete</strong></div><div><span>Runtime</span><strong>deterministic</strong></div></section>
    </div>
  );
}

function HistoricalReplayPanel() {
  const directCase = historicalReplay.directCases.find(
    (candidate) => candidate.id === "real-zero",
  );
  const before = directCase?.before.value ?? "unknown";
  const after = directCase?.after.value === null
    ? "NULL"
    : String(directCase?.after.value ?? "unknown");

  return (
    <div className="upstream-tab">
      <section className="upstream-summary">
        <PackageCheck />
        <div>
          <span>Independent historical replay</span>
          <h2>Real published packages, same witness</h2>
          <p>The verifier executes two pinned PowerSync npm builds around merged PR #646. This is separate from the injected IndexedDB demonstration.</p>
        </div>
      </section>

      <section className="package-comparison" aria-label="PowerSync package replay comparison">
        <div className="package-result before">
          <span>Before fix · published May 15</span>
          <code>{historicalReplay.packages.before.version}</code>
          <strong>5 / 0 → {String(before)}</strong>
          <em>diverged from SQLite</em>
        </div>
        <ArrowRight />
        <div className="package-result after">
          <span>After fix · published Jun 2</span>
          <code>{historicalReplay.packages.after.version}</code>
          <strong>5 / 0 → {after}</strong>
          <em>matched SQLite</em>
        </div>
      </section>

      <section className="upstream-metrics">
        <div><span>Generated trace</span><strong>{historicalReplay.differentialReplay.originalTraceLength}</strong></div>
        <div><span>Minimal witness</span><strong>{historicalReplay.differentialReplay.minimizedTraceLength}</strong></div>
        <div><span>Evaluations</span><strong>{historicalReplay.differentialReplay.evaluations}</strong></div>
      </section>

      <div className="boundary-note upstream-boundary">
        <ShieldCheck />
        <p>
          <strong>Execution boundary</strong>
          <span>Both package versions and their registry integrity hashes are pinned in the lockfile. Verification needs no network after installation.</span>
        </p>
      </div>

      <div className="code-panel upstream-command">
        <header><span>reproduce locally</span><span>sha256:{historicalReplay.integrity.digest.slice(0, 12)}…</span></header>
        <pre>npm run verify:historical</pre>
      </div>

      <div className="upstream-links">
        <a href={historicalReplay.upstream.pullRequest} rel="noreferrer" target="_blank"><ExternalLink /> Merged upstream PR</a>
        <a href="https://github.com/sravan27/counterexample-studio/blob/main/evidence/historical/powersync-division-by-zero.json" rel="noreferrer" target="_blank"><FileJson2 /> Evidence JSON</a>
      </div>
    </div>
  );
}
