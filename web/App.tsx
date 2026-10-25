// The consultant "war room" for one client.
// It imports the API's response type, so front end and back end share one contract.
import { useCallback, useEffect, useState } from "react";
import type { Overview } from "../src/insights";

const CLIENT = "nova-pay";
const COLORS = { accurate: "var(--good)", outdated: "var(--warn)", false: "var(--bad)" };

export function App() {
  const [data, setData] = useState<Overview | null>(null);

  const load = useCallback(async () => {
    setData(await (await fetch(`/api/clients/${CLIENT}/overview`)).json());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Poll while a run is in progress (production: a websocket or server-sent events).
  useEffect(() => {
    if (!data?.progress.running) return;
    const timer = setTimeout(load, 700);
    return () => clearTimeout(timer);
  }, [data, load]);

  const post = async (path: string) => {
    await fetch(path, { method: "POST" });
    await load();
  };

  if (!data) return <main>Loading…</main>;
  const { latest, progress } = data;

  return (
    <main>
      <header>
        <div>
          <h1>Nova Pay · AI reputation war room</h1>
          <div className="muted">Monitor → Explain → Act → Report, for a fictional client</div>
        </div>
        <div className="actions">
          <button disabled={progress.running} onClick={() => post(`/api/clients/${CLIENT}/runs`)}>
            {progress.running ? `Running ${progress.done}/${progress.total}…` : "1. Run monitoring"}
          </button>
          <button className="secondary" onClick={() => post("/api/interventions/publish-correction")}>
            2. Publish correction
          </button>
          <button className="secondary" onClick={() => post("/api/reset")}>
            Reset demo
          </button>
        </div>
      </header>

      {!latest ? (
        <div className="card">No runs yet. Click “Run monitoring” to ask every AI model every question.</div>
      ) : (
        <>
          <div className="grid">
            <Trend runs={data.runs} />
            <ModelTable models={latest.models} />
          </div>
          <div className="grid">
            <Narratives narratives={latest.narratives} />
            <Citations citations={latest.citations} />
          </div>
          <Examples examples={latest.examples} />
        </>
      )}
      <Sources pages={data.pages} />
    </main>
  );
}

function pct(part: number, whole: number) {
  return whole ? Math.round((100 * part) / whole) : 0;
}

// Report: share of answers with a false or outdated claim, run over run.
function Trend({ runs }: Pick<Overview, "runs">) {
  const points = runs.filter((r) => r.answers > 0).map((r) => ({ id: r.id, value: pct(r.riskyAnswers, r.answers) }));
  const w = 520, h = 160, pad = 28, left = 56;
  const x = (i: number) => left + (points.length < 2 ? (w - left - pad) / 2 : (i * (w - left - pad)) / (points.length - 1));
  const y = (v: number) => h - pad - (v / 100) * (h - 2 * pad);
  return (
    <div className="card">
      <h2>Answers with a false or outdated claim, per run</h2>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" role="img" aria-label="Risky answer share per run">
        <line x1={left - 16} x2={w - pad} y1={y(0)} y2={y(0)} stroke="var(--line)" />
        <line x1={left - 16} x2={w - pad} y1={y(100)} y2={y(100)} stroke="var(--line)" strokeDasharray="4 4" />
        <text x={4} y={y(100) + 4} fontSize="11" fill="var(--muted)">100%</text>
        <text x={4} y={y(0) + 4} fontSize="11" fill="var(--muted)">0%</text>
        <polyline fill="none" stroke="var(--accent)" strokeWidth="2.5" points={points.map((p, i) => `${x(i)},${y(p.value)}`).join(" ")} />
        {points.map((p, i) => (
          <g key={p.id}>
            <circle cx={x(i)} cy={y(p.value)} r="4" fill="var(--accent)" />
            <text x={x(i)} y={y(p.value) - 10} fontSize="12" textAnchor="middle" fill="var(--ink)">{p.value}%</text>
            <text x={x(i)} y={h - 8} fontSize="11" textAnchor="middle" fill="var(--muted)">run {p.id}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function ModelTable({ models }: { models: NonNullable<Overview["latest"]>["models"] }) {
  return (
    <div className="card">
      <h2>By AI model (latest run)</h2>
      <table>
        <thead><tr><th>Model</th><th>Answers</th><th>With false or outdated claim</th></tr></thead>
        <tbody>
          {models.map((m) => (
            <tr key={m.model}><td>{m.model}</td><td>{m.answers}</td><td>{pct(m.risky, m.answers)}%</td></tr>
          ))}
        </tbody>
      </table>
      <p className="muted">Each question is asked several times per model, because answers vary run to run.</p>
    </div>
  );
}

function Narratives({ narratives }: { narratives: NonNullable<Overview["latest"]>["narratives"] }) {
  return (
    <div className="card">
      <h2>What the AI says, scored against the facts</h2>
      <div className="legend">
        {Object.entries(COLORS).map(([k, c]) => <span key={k}><span className="dot" style={{ background: c }} />{k}</span>)}
      </div>
      {narratives.map((n) => {
        const counts = { accurate: n.accurate ?? 0, outdated: n.outdated ?? 0, false: n.false_ ?? 0 };
        const mentioned = counts.accurate + counts.outdated + counts.false;
        return (
          <div className="row" key={n.id}>
            <div className="row-head"><b>{n.label}</b><span className="muted">mentioned in {pct(mentioned, n.answers)}% of answers</span></div>
            <div className="bar">
              {(Object.keys(counts) as (keyof typeof counts)[]).map((k) =>
                counts[k] ? <div key={k} title={`${k}: ${counts[k]}`} style={{ width: `${pct(counts[k], n.answers)}%`, background: COLORS[k] }} /> : null,
              )}
            </div>
            <div className="muted">Truth: {n.truth}</div>
          </div>
        );
      })}
    </div>
  );
}

function Citations({ citations }: { citations: NonNullable<Overview["latest"]>["citations"] }) {
  return (
    <div className="card">
      <h2>Share of voice: which sites the AI relies on</h2>
      {citations.map((c) => (
        <div className="row" key={c.domain}>
          <div className="row-head"><span>{c.domain}</span><b>{c.share}%</b></div>
          <div className="bar"><div style={{ width: `${c.share}%`, background: "var(--ink)" }} /></div>
        </div>
      ))}
    </div>
  );
}

function Examples({ examples }: { examples: NonNullable<Overview["latest"]>["examples"] }) {
  if (examples.length === 0) return <div className="card"><h2>Risky answers</h2><p className="muted">None in the latest run.</p></div>;
  return (
    <div className="card">
      <h2>Example risky answers (evidence)</h2>
      {examples.map((e, i) => (
        <div className="row" key={i}>
          <div className="row-head"><span><b>{e.model}</b> · {e.question}</span><span className="tag">{e.verdicts}</span></div>
          <blockquote>{e.answer}</blockquote>
        </div>
      ))}
    </div>
  );
}

function Sources({ pages }: Pick<Overview, "pages">) {
  return (
    <div className="card">
      <h2>The “web” the AI tools read</h2>
      <table>
        <thead><tr><th>Page</th><th>Domain</th><th>Authority</th><th>Published</th></tr></thead>
        <tbody>
          {pages.map((p) => (
            <tr key={p.url}>
              <td>{p.title} {p.addedByUs ? <span className="tag new">placed by our team</span> : null}</td>
              <td>{p.domain}</td><td>{p.authority}</td><td>{p.published}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
