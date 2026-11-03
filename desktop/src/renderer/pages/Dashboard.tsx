import { useEffect, useState } from "react";
import type { Idea, ScanMeta, Tracked } from "../../core/types";
import { call } from "../api";
import { Sparkline } from "../components/charts";
import { Icon } from "../components/Icon";
import { analyzeLink, Delta, DemoBanner, Empty, go, PageHead, ScorePill, SearchBox, useApp } from "../components/ui";
import { ago } from "../format";

const EXAMPLES = ["home espresso on a budget", "beginner chess openings", "solo travel japan", "ai tools for students"];

export function Dashboard() {
  const { status, refresh } = useApp();
  const [scans, setScans] = useState<ScanMeta[] | null>(null);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [tracked, setTracked] = useState<Tracked[]>([]);
  useEffect(() => {
    refresh();
    call("listScans", "analyze").then(setScans).catch(() => setScans([]));
    call("listIdeas").then((d) => setIdeas(d.ideas)).catch(() => undefined);
    call("listTracked").then(setTracked).catch(() => undefined);
  }, [refresh]);
  if (!status || !scans) return null;

  const recentScores = scans.slice(0, 10).map((s) => s.score ?? 0);
  const avg = recentScores.length ? Math.round(recentScores.reduce((a, b) => a + b, 0) / recentScores.length) : null;
  const strong = scans.filter((s) => (s.score ?? 0) >= 70).length;
  const inProd = ideas.filter((i) => i.status === "scripting" || i.status === "filming").length;
  const movers = tracked.map((t) => {
    const h = t.history;
    return { t, last: h[h.length - 1]?.score ?? null, change: h.length > 1 ? h[h.length - 1].score - h[h.length - 2].score : null };
  }).slice(0, 6);

  return (
    <>
      <PageHead title="Overview" desc="Research topics, track opportunities and plan your next uploads." />
      <DemoBanner />
      <div className="card search-card" style={{ marginBottom: 16 }}>
        <SearchBox onSubmit={(q) => go(analyzeLink(q))} placeholder="Analyze a topic or video idea" />
        {scans.length === 0 && (
          <div className="row small muted" style={{ marginTop: 10 }}>Examples
            {EXAMPLES.map((k) => <button key={k} className="chip" onClick={() => go(analyzeLink(k))}>{k}</button>)}
          </div>
        )}
      </div>

      <div className="kpis" style={{ marginBottom: 16 }}>
        <div className="kpi"><div className="label">Topics analyzed</div><div className="value">{status.counts.scans}</div><div className="foot">{strong} rated strong</div></div>
        <div className="kpi"><div className="label">Average score</div><div className="value">{avg ?? "–"}</div><div className="foot">Last {recentScores.length || 0} analyses</div></div>
        <div className="kpi"><div className="label">Tracked topics</div><div className="value">{status.counts.tracked}</div><div className="foot">Re-scored on demand</div></div>
        <div className="kpi"><div className="label">Ideas in production</div><div className="value">{inProd}</div><div className="foot">{ideas.filter((i) => i.status === "uploaded").length} uploaded</div></div>
      </div>

      <div className="grid g-report">
        <div className="card flush">
          <div className="card-head"><div><h3>Recent analyses</h3></div><a className="btn xs ghost" href="#/history">View all</a></div>
          {scans.length ? (
            <div className="table-wrap bare" style={{ marginTop: 8 }}>
              <table className="data">
                <thead><tr><th style={{ width: 56 }}>Score</th><th>Topic</th><th>Verdict</th><th className="num">Analyzed</th></tr></thead>
                <tbody>{scans.slice(0, 8).map((x) => (
                  <tr key={x.id} style={{ cursor: "pointer" }} onClick={() => go(`#/report/${x.id}`)}>
                    <td><ScorePill score={x.score} /></td>
                    <td><b style={{ fontWeight: 500 }}>{x.query}</b>{x.demo && <span className="badge demo" style={{ marginLeft: 8 }}>Sample</span>}</td>
                    <td className="t2">{x.verdict}</td>
                    <td className="num muted nowrap">{ago(x.created)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : <div className="empty"><b>No analyses yet</b>Analyze a topic to see its opportunity score here.</div>}
        </div>

        <div className="stack">
          <div className="card flush">
            <div className="card-head"><div><h3>Watchlist</h3></div><a className="btn xs ghost" href="#/watchlist">Open</a></div>
            {movers.length ? (
              <div className="table-wrap bare" style={{ marginTop: 8 }}>
                <table className="data"><tbody>{movers.map(({ t, last, change }) => (
                  <tr key={t.keyword} style={{ cursor: "pointer" }} onClick={() => go("#/watchlist")}>
                    <td><ScorePill score={last} /></td>
                    <td className="ellipsis" style={{ maxWidth: 160 }}>{t.keyword}</td>
                    <td><Sparkline values={t.history.map((p) => p.score)} /></td>
                    <td className="num"><Delta value={change} /></td>
                  </tr>
                ))}</tbody></table>
              </div>
            ) : <div className="empty" style={{ padding: 24 }}>Track a topic from its report to follow its score over time.</div>}
          </div>
          <div className="card">
            <h3 style={{ marginBottom: 10 }}>Pipeline</h3>
            {[["idea", "Ideas"], ["researching", "Researching"], ["scripting", "Scripting"], ["filming", "Filming and editing"], ["uploaded", "Uploaded"]].map(([k, l]) => (
              <div key={k} className="list-row"><span className="grow t2">{l}</span><b className="tabular">{ideas.filter((i) => i.status === k).length}</b></div>
            ))}
            <a className="btn sm" style={{ marginTop: 10, width: "100%" }} href="#/ideas"><Icon name="board" />Open idea board</a>
          </div>
        </div>
      </div>
      {scans.length === 0 && !status.demo && <div style={{ marginTop: 16 }}><Empty icon="target" title="Start with a topic">Use the search above, or open Discover to mine search suggestions around your niche.</Empty></div>}
    </>
  );
}
