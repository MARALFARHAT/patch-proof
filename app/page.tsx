"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type RepairEvent = {
  at: string;
  phase?: string;
  type: string;
  message?: string;
  provider?: "Daytona" | "Bright Data" | "Anthropic";
  data?: Record<string, unknown>;
};

type CommandResult = {
  command: string;
  exitCode: number;
  output: string;
  durationMs: number;
};

type Evidence = {
  id: string;
  url: string;
  title: string;
  retrievedAt: string;
};

type RepairResult = {
  status: "succeeded" | "failed" | "unsupported";
  baseline?: CommandResult;
  finalVerification?: CommandResult;
  rootCause?: string;
  unresolvedRisks?: string[];
  evidence?: Evidence[];
  researchQuery?: string;
  diff?: string;
  error?: string;
  reason?: string;
};

type IntegrationStatus = {
  brightData: boolean;
  anthropic: boolean;
  daytona: boolean;
};

const providers: Array<{ key: keyof IntegrationStatus; label: string; role: string }> = [
  { key: "brightData", label: "Bright Data", role: "live evidence" },
  { key: "anthropic", label: "Anthropic", role: "Claude repair reasoning" },
  { key: "daytona", label: "Daytona", role: "isolated execution" },
];

const stages = [
  { phase: "sandboxing", label: "Sandbox", detail: "Create isolated runtime" },
  { phase: "reproducing", label: "Reproduce", detail: "Run the real test command" },
  { phase: "researching", label: "Research", detail: "Retrieve current migration evidence" },
  { phase: "planning", label: "Plan", detail: "Generate evidence-bound source edits" },
  { phase: "patching", label: "Repair", detail: "Validate edits and generate the exact diff" },
  { phase: "verifying", label: "Verify", detail: "Run the same tests again" },
];

const phaseOrder = [
  "queued",
  "sandboxing",
  "cloning",
  "installing",
  "reproducing",
  "diagnosing",
  "researching",
  "planning",
  "patching",
  "verifying",
  "complete",
  "cleanup",
];

function stripAnsi(value = "") {
  return value.replace(/[\u001b\u009b][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[-a-zA-Z\d/#&.:=?%@~_]+)*)?\u0007)|(?:(?:\d{1,4}(?:[;:]\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g, "");
}

function meaningfulOutput(value = "") {
  const cleaned = stripAnsi(value).trim();
  if (!cleaned) return "No command output.";
  const lines = cleaned.split("\n");
  return lines.slice(Math.max(0, lines.length - 16)).join("\n");
}

function eventExitCode(event: RepairEvent) {
  const value = event.data?.exitCode;
  return typeof value === "number" ? value : null;
}

function retrievedLabel(value: string) {
  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 60_000));
  return elapsedMinutes < 1 ? "retrieved just now" : `retrieved ${elapsedMinutes}m ago`;
}

function SourceIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M10.5 13.5a3.5 3.5 0 0 0 5 0l2-2a3.54 3.54 0 0 0-5-5l-1.15 1.15" />
      <path d="M13.5 10.5a3.5 3.5 0 0 0-5 0l-2 2a3.54 3.54 0 0 0 5 5l1.15-1.15" />
    </svg>
  );
}

export default function Home() {
  const [repoUrl, setRepoUrl] = useState("");
  const [commitSha, setCommitSha] = useState("");
  const [events, setEvents] = useState<RepairEvent[]>([]);
  const [result, setResult] = useState<RepairResult | null>(null);
  const [running, setRunning] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [integrations, setIntegrations] = useState<IntegrationStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/repair")
      .then((response) => response.json())
      .then((payload: {
        configured?: boolean;
        sampleRepo?: string | null;
        sampleCommit?: string | null;
        integrations?: IntegrationStatus;
      }) => {
        if (cancelled) return;
        setConfigured(Boolean(payload.configured));
        setIntegrations(payload.integrations ?? null);
        if (payload.sampleRepo) setRepoUrl((current) => current || payload.sampleRepo || "");
        if (payload.sampleCommit) {
          setCommitSha((current) => current || payload.sampleCommit || "");
        }
      })
      .catch(() => {
        if (!cancelled) setConfigured(false);
      });
    return () => { cancelled = true; };
  }, []);

  const latestPhase = useMemo(() => {
    let best = -1;
    for (const event of events) {
      const index = phaseOrder.indexOf(event.phase ?? "");
      if (index > best) best = index;
    }
    return best;
  }, [events]);

  async function startRepair(event: FormEvent) {
    event.preventDefault();
    if (!repoUrl.trim() || running) return;
    setEvents([]);
    setResult(null);
    setRequestError(null);
    setRunning(true);

    try {
      const response = await fetch("/api/repair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoUrl: repoUrl.trim(), commitSha: commitSha.trim() || undefined }),
      });

      if (!response.ok) {
        const payload = (await response.json()) as {
          message?: string;
          missing?: string[];
          error?: string;
        };
        const missing = payload.missing?.length
          ? ` Missing runtime settings: ${payload.missing.join(", ")}.`
          : "";
        throw new Error(`${payload.message ?? payload.error ?? "Repair request failed."}${missing}`);
      }
      if (!response.body) throw new Error("The repair stream did not start.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const item = JSON.parse(line) as RepairEvent & { result?: RepairResult };
          if (item.type === "RESULT" && item.result) {
            setResult(item.result);
          } else {
            setEvents((current) => [...current, item]);
          }
        }
        if (done) break;
      }
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : String(error));
    } finally {
      setRunning(false);
    }
  }

  const status = running
    ? "Repair running"
    : result?.status === "succeeded"
      ? "Repair proven"
      : result?.status === "failed"
        ? "Repair not proven"
        : configured === null
          ? "Checking runtime configuration"
          : configured
            ? "Ready for a repair job"
            : "Runtime configuration required";

  return (
    <main>
      <header className="topbar">
        <a href="#top" className="brand" aria-label="PatchProof home">
          <span className="brand-mark" aria-hidden="true"><span /><span /></span>
          PatchProof
        </a>
        <div className="specialty"><span className="specialty-dot" />Express 4 → 5 route migration</div>
      </header>

      <section className="hero" id="top">
        <div className="eyebrow">Autonomous migration agent</div>
        <h1>Don’t guess the fix.<br /><span>Prove it.</span></h1>
        <p className="hero-copy">
          PatchProof researches what changed, repairs the repository inside an isolated sandbox,
          and only claims success when the same failing test command passes.
        </p>

        <form className="repair-form" onSubmit={startRepair}>
          <div className="field-row">
            <label className="repo-field">
              <span>Public GitHub repository</span>
              <input type="url" value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)}
                placeholder="https://github.com/your-org/express5-broken" required disabled={running} />
            </label>
            <label className="commit-field">
              <span>Demo commit <em>pinned</em></span>
              <input type="text" value={commitSha} onChange={(e) => setCommitSha(e.target.value)}
                placeholder="Loading verified fixture…" pattern="[a-fA-F0-9]{40}"
                readOnly disabled={running} />
            </label>
          </div>
          <button className="repair-button" type="submit" disabled={running || !repoUrl.trim()}>
            <span>{running ? "Running verified workflow" : "Repair and prove"}</span>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          </button>
        </form>

        <div className={`system-status ${result?.status ?? "idle"}`}>
          <span className="pulse" />{status}<span className="separator">•</span>
          Every status below comes from backend execution
        </div>
        <div className="integration-strip" aria-label="Provider integration status">
          {providers.map((provider) => {
            const ready = integrations?.[provider.key] ?? false;
            return (
              <div className={`integration ${ready ? "ready" : "missing"}`} key={provider.key}>
                <span className="integration-dot" />
                <strong>{provider.label}</strong>
                <small>{provider.role}</small>
                <em>{integrations === null ? "checking" : ready ? "connected" : "needs key"}</em>
              </div>
            );
          })}
        </div>
        {requestError && <div className="request-error" role="alert">{requestError}</div>}
      </section>

      <section className="workflow-section" aria-labelledby="workflow-heading">
        <div className="section-heading">
          <div><div className="eyebrow">Live workflow</div><h2 id="workflow-heading">Observe → research → repair → verify</h2></div>
          <div className="hard-limits"><span>1 file</span><span>2 attempts max</span><span>npm test</span></div>
        </div>

        <div className="workflow-grid">
          <ol className="stage-list">
            {stages.map((stage, index) => {
              const phaseIndex = phaseOrder.indexOf(stage.phase);
              const hasEvent = events.some((item) => item.phase === stage.phase);
              const completed = latestPhase > phaseIndex || Boolean(result && hasEvent);
              const active = running && latestPhase === phaseIndex;
              const failed = events.some((item) => item.phase === stage.phase &&
                (item.type === "JOB_FAILED" || eventExitCode(item) === 1));
              return (
                <li className={failed ? "failed" : active ? "active" : completed ? "completed" : ""} key={stage.phase}>
                  <span className="stage-number">{completed ? "✓" : String(index + 1).padStart(2, "0")}</span>
                  <div><strong>{stage.label}</strong><span>{stage.detail}</span></div>
                  <span className="stage-state">{failed ? "failed" : active ? "running" : completed ? "done" : "waiting"}</span>
                </li>
              );
            })}
          </ol>

          <div className="activity-panel">
            <div className="panel-topline">
              <div><span className="terminal-dot red" /><span className="terminal-dot amber" /><span className="terminal-dot green" /></div>
              <span>repair-events.ndjson</span>
              <span className="live-label">{running ? "LIVE" : events.length ? "COMPLETE" : "IDLE"}</span>
            </div>
            <div className="activity-log" aria-live="polite">
              {!events.length && <div className="empty-log"><span>$</span>Submit an allowlisted demo repository to start a real repair run.</div>}
              {events.map((item, index) => (
                <div className={`log-row ${item.type.includes("FAILED") ? "log-error" : ""}`} key={`${item.at}-${index}`}>
                  <time>{new Date(item.at).toLocaleTimeString([], { hour12: false })}</time>
                  <span className="log-node" />
                  <div>
                    <div className="log-title">
                      {item.message}
                      {item.provider && <span className={`provider ${item.provider.toLowerCase().replace(" ", "-")}`}>{item.provider}</span>}
                    </div>
                    {typeof item.data?.command === "string" && <code>{item.data.command} → exit {String(item.data.exitCode)}</code>}
                  </div>
                </div>
              ))}
              {running && <div className="stream-cursor" aria-label="Waiting for next backend event" />}
            </div>
          </div>
        </div>
      </section>

      <section className="proof-section" aria-labelledby="proof-heading">
        <div className="section-heading">
          <div><div className="eyebrow">Deterministic proof</div><h2 id="proof-heading">One command. Before and after.</h2></div>
          <p>Success is impossible unless the final command exits with code 0.</p>
        </div>
        <div className="proof-grid">
          <article className={`proof-card before ${result?.baseline ? "populated" : ""}`}>
            <div className="proof-label"><span>Before</span><strong>{result?.baseline ? "Failed" : "Pending"}</strong></div>
            <div className="command-line"><span>$</span> npm test</div>
            <pre>{result?.baseline ? meaningfulOutput(result.baseline.output) : "Waiting for the baseline test run…"}</pre>
            <div className="exit-line"><span>Exit code</span><strong>{result?.baseline?.exitCode ?? "—"}</strong></div>
          </article>
          <div className="proof-arrow" aria-hidden="true"><span>PATCH</span><svg viewBox="0 0 52 24"><path d="M2 12h44M36 3l10 9-10 9" /></svg></div>
          <article className={`proof-card after ${result?.status ?? ""}`}>
            <div className="proof-label"><span>After</span><strong>{result?.status === "succeeded" ? "Passed" : result ? "Not proven" : "Pending"}</strong></div>
            <div className="command-line"><span>$</span> npm test</div>
            <pre>{result?.finalVerification ? meaningfulOutput(result.finalVerification.output) : "Waiting for final verification…"}</pre>
            <div className="exit-line"><span>Exit code</span><strong>{result?.finalVerification?.exitCode ?? "—"}</strong></div>
          </article>
        </div>
      </section>

      <section className="evidence-section" aria-labelledby="evidence-heading">
        <div className="evidence-copy">
          <div className="eyebrow">Repair receipt</div>
          <h2 id="evidence-heading">The claim comes with evidence.</h2>
          <p>PatchProof keeps the diagnosis, retrieved sources, exact diff, and test receipts together—so a developer can audit the repair instead of trusting a suggestion.</p>
          <div className="root-cause"><span>Root cause</span><p>{result?.rootCause ?? result?.reason ?? "Available after a supported failure is reproduced and researched."}</p></div>
          {result?.researchQuery && (
            <div className="research-query">
              <span>Bright Data live query</span>
              <code>{result.researchQuery}</code>
            </div>
          )}
          <div className="sources">
            {(result?.evidence ?? []).map((source) => (
              <a href={source.url} target="_blank" rel="noreferrer" key={source.id}>
                <span className="source-icon"><SourceIcon /></span>
                <span>
                  <strong>{source.title}</strong>
                  <small>{new URL(source.url).hostname} · {retrievedLabel(source.retrievedAt)}</small>
                </span>
                <span className="external">↗</span>
              </a>
            ))}
            {!result?.evidence?.length && <div className="source-placeholder">Current sources will appear here after Bright Data retrieves them.</div>}
          </div>
        </div>
        <div className="diff-panel">
          <div className="diff-header"><div><span className="file-icon">JS</span><strong>src/app.js</strong></div><span>{result?.diff ? "Verified diff" : "No patch yet"}</span></div>
          <pre className="diff-code">
            {result?.diff ? result.diff.split("\n").map((line, index) => (
              <span className={line.startsWith("+") ? "addition" : line.startsWith("-") ? "deletion" : "context"} key={index}>{line || " "}{"\n"}</span>
            )) : <span className="context">The exact sandbox diff will appear here only after a patch is applied.</span>}
          </pre>
        </div>
      </section>

      <footer>
        <div className="footer-brand"><span className="brand-mark small"><span /><span /></span>PatchProof</div>
        <p>Current web evidence. Isolated execution. Verifiable repair.</p>
        <div className="sponsor-line"><span>Powered by</span><strong>Bright Data</strong><strong>Anthropic</strong><strong>Daytona</strong></div>
      </footer>
    </main>
  );
}
