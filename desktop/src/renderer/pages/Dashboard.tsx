import { useEffect, useState } from "react";
import type { Idea, ScanMeta, Tracked } from "../../core/types";
import { call } from "../api";
import { Sparkline } from "../components/charts";
import { Button, Card, EmptyState, ListRow } from "../components/kit";
import { analyzeLink, Delta, DemoBanner, go, PageHead, ScorePill, SearchBox, useApp, Verdict } from "../components/ui";
import { ago } from "../format";

const EXAMPLES = ["home espresso on a budget", "beginner chess openings", "solo travel japan", "ai tools for students"];
const STAGES: [string, string, string][] = [["idea", "Ideas", "cat-1"], ["researching", "Researching", "cat-4"], ["scripting", "Scripting", "cat-2"], ["filming", "Filming and editing", "cat-1"], ["uploaded", "Uploaded", "cat-3"]];

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

  const recent = scans.slice(0, 10).map((s) => s.score ?? 0);
  const avg = recent.length ? Math.round(recent.reduce((a, b) => a + b, 0) / recent.length) : null;
  const strong = scans.filter((s) => (s.score ?? 0) >= 70).length;
  const inProd = ideas.filter((i) => i.status === "scripting" || i.status === "filming").length;
  const quota = status.quota_history;
  const maxQ = Math.max(1, ...quota.map((q) => q.units));

  return (
    <>
      <PageHead title="Overview" desc="Your recent research, the topics you’re tracking and what’s in production.">
        <Button href="#/discover" icon="compass">Find ideas</Button>
        <Button href="#/analyze" variant="primary" icon="search">Analyze a topic</Button>
      </PageHead>
      <DemoBanner />
      <Card className="search-card mb">
        <SearchBox onSubmit={(q) => go(analyzeLink(q))} placeholder="Analyze a topic or video idea" />
        {scans.length === 0 && (
          <div className="row mt-sm"><span className="secondary">Try</span>
            {EXAMPLES.map((k) => <button key={k} className="chip" onClick={() => go(analyzeLink(k))}>{k}</button>)}
          </div>
        )}
      </Card>

      <div className="kpis mb">
        <div className="kpi"><span className="label">Topics analyzed</span><div className="value">{status.counts.scans}</div><div className="secondary">{strong} rated strong</div></div>
        <div className="kpi"><span className="label">Average score</span><div className="value">{avg ?? "–"}</div><div className="secondary">{recent.length ? `Across the last ${recent.length}` : "No analyses yet"}</div></div>
        <div className="kpi"><span className="label">Tracked topics</span><div className="value">{status.counts.tracked}</div><div className="secondary">Re-score them from the watchlist</div></div>
        <div className="kpi"><span className="label">In production</span><div className="value">{inProd}</div><div className="secondary">{ideas.filter((i) => i.status === "uploaded").length} uploaded</div></div>
      </div>

      <div className="grid g-report">
        <Card flush title="Recent analyses" actions={<Button size="sm" variant="ghost" href="#/history">View all</Button>}>
          {scans.length ? (
            <div className="list">
              {scans.slice(0, 8).map((x) => (
                <ListRow key={x.id} href={`#/report/${x.id}`} leading={<ScorePill score={x.score} />} title={x.query}
                  secondary={`${ago(x.created)}${x.demo ? " · sample data" : ""}`}
                  end={<Verdict score={x.score}>{x.verdict}</Verdict>} />
              ))}
            </div>
          ) : <EmptyState card={false} icon="search" title="No analyses yet" action={<Button variant="primary" href="#/analyze">Analyze a topic</Button>}>
            Score a topic to see whether a small channel can rank for it.</EmptyState>}
        </Card>

        <div className="stack">
          <Card flush title="Watchlist" actions={<Button size="sm" variant="ghost" href="#/watchlist">Open</Button>}>
            {tracked.length ? (
              <div className="list">
                {tracked.slice(0, 6).map((t) => {
                  const h = t.history, last = h[h.length - 1];
                  return (
                    <ListRow key={t.keyword} href="#/watchlist" leading={<ScorePill score={last?.score} />} title={t.keyword}
                      secondary={last ? `Checked ${ago(last.t)}` : "Not scored yet"}
                      end={<><Sparkline values={h.map((p) => p.score)} /><Delta value={h.length > 1 ? last.score - h[h.length - 2].score : null} /></>} />
                  );
                })}
              </div>
            ) : <EmptyState card={false} icon="eye" title="Nothing tracked yet">Choose Track on a report to follow its score over time.</EmptyState>}
          </Card>

          <Card title="Pipeline" actions={<Button size="sm" variant="ghost" href="#/ideas">Open board</Button>}>
            <div className="stack tight">
              {STAGES.map(([k, l, cat]) => {
                const n = ideas.filter((i) => i.status === k).length;
                return (
                  <div key={k}>
                    <div className="row between small mb-sm"><span className="t2">{l}</span><span className="tabular">{n}</span></div>
                    <div className="meter"><i className={cat} style={{ width: `${ideas.length ? (n / ideas.length) * 100 : 0}%` }} /></div>
                  </div>
                );
              })}
            </div>
          </Card>

          {!status.demo && quota.length > 0 && (
            <Card title="Quota use" sub="Units used per day. Resets at midnight Pacific time.">
              <div className="minibars" role="img" aria-label="Quota use for recent days">
                {quota.map((d, i) => <i key={d.day} className={i === quota.length - 1 ? "current" : ""} title={`${d.day}: ${d.units.toLocaleString()} units`} style={{ height: `${Math.max(4, (d.units / maxQ) * 100)}%` }} />)}
              </div>
              <div className="legend"><span><span className="dot accent" />Today</span><span><span className="dot accent" style={{ opacity: 0.5 }} />Earlier days</span></div>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
