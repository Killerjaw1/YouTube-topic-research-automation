import { useEffect, useState } from "react";
import type { Idea, ScanMeta } from "../../core/types";
import { call } from "../api";
import { Icon } from "../components/Icon";
import { analyzeLink, DemoBanner, Empty, go, ScorePill, SearchBox, useApp } from "../components/ui";
import { ago, fmt } from "../format";

const TRY = ["home espresso on a budget", "beginner chess openings", "solo travel japan", "ai tools for students"];

export function Dashboard() {
  const { status, refresh, tip } = useApp();
  const [scans, setScans] = useState<ScanMeta[] | null>(null);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  useEffect(() => {
    refresh();
    call("listScans", "analyze").then(setScans).catch(() => setScans([]));
    call("listIdeas").then((d) => setIdeas(d.ideas)).catch(() => undefined);
  }, [refresh]);
  if (!status || !scans) return null;
  const s = status, ch = s.my_channel;
  const left = Math.max(s.quota_limit - s.quota_used, 0);
  const by = (st: string) => ideas.filter((i) => i.status === st).length;
  const best = scans.filter((x) => x.score != null).sort((a, b) => b.score! - a.score!).slice(0, 5);
  const maxQ = Math.max(1, ...s.quota_history.map((q) => q.units));

  return (
    <>
      <DemoBanner />
      <div className="card" style={{ padding: 26, marginBottom: 16 }}>
        <h2 style={{ fontSize: 22, marginBottom: 6 }}>What should you make next?</h2>
        <p className="sub" style={{ fontSize: 14, marginBottom: 18 }}>
          Check whether a topic is winnable for a small channel <i>before</i> you film it. NicheRadar looks at who ranks today,
          whether small creators break through, and whether big channels already own the topic.
        </p>
        <SearchBox onSubmit={(q) => go(analyzeLink(q))} />
        <div className="row small muted" style={{ marginTop: 12 }}>Try:
          {TRY.map((k) => <button key={k} className="chip" onClick={() => go(analyzeLink(k))}>{k}</button>)}
        </div>
      </div>

      <div className="grid g4" style={{ marginBottom: 16 }}>
        <div className="card tile"><div className="label"><Icon name="bolt" />Quota left today</div><div className="value">{s.demo ? "∞" : fmt(left)}</div>
          <div className="foot">{s.demo ? "Demo mode" : `≈ ${Math.floor(left / 102)} quick or ${Math.floor(left / 204)} deep scans`}</div></div>
        <div className="card tile"><div className="label"><Icon name="search" />Topics analyzed</div><div className="value">{s.counts.scans}</div><div className="foot">All saved in History</div></div>
        <div className="card tile"><div className="label"><Icon name="board" />Ideas in pipeline</div><div className="value">{s.counts.ideas}</div>
          <div className="foot">{by("uploaded")} uploaded · {by("scripting") + by("filming")} in production</div></div>
        <div className="card tile"><div className="label"><Icon name="user" />Your channel</div>
          {ch ? <><div className="value">{fmt(ch.subs)}</div><div className="foot">{ch.title} · subscribers</div></>
            : <><div className="value" style={{ fontSize: 18, marginTop: 6 }}><a href="#/settings" className="btn sm">Connect channel</a></div><div className="foot">Tailors “small channel” to your size</div></>}
        </div>
      </div>

      <div className="grid g-report">
        <div className="card">
          <div className="card-head"><div><h3>Recent analyses</h3><p className="sub">Click one to reopen its full report</p></div><a className="btn sm ghost" href="#/history">View all</a></div>
          <div className="list">
            {scans.slice(0, 7).map((x) => (
              <a key={x.id} className="list-row" href={`#/report/${x.id}`}>
                <ScorePill score={x.score} />
                <div className="grow"><div className="title">{x.query}</div><div className="small muted">{x.verdict}</div></div>
                {x.demo && <span className="badge demo">demo</span>}
                <span className="small muted nowrap">{ago(x.created)}</span>
              </a>
            ))}
            {!scans.length && <Empty icon="search" title="No topics analyzed yet">Type an idea above to get your first score.</Empty>}
          </div>
        </div>
        <div className="stack">
          <div className="card">
            <h3>Best opportunities so far</h3><p className="sub">Your highest-scoring topics</p>
            <div className="list">
              {best.map((x) => <a key={x.id} className="list-row" href={`#/report/${x.id}`}><ScorePill score={x.score} /><div className="grow title">{x.query}</div></a>)}
              {!best.length && <div className="small muted">Scores appear here as you research.</div>}
            </div>
          </div>
          <div className="card">
            <h3>How the score works</h3>
            <p className="sub" style={{ marginBottom: 8 }}>A 0-100 Opportunity Score for small channels, built from four signals:</p>
            <div className="list small">
              {[["Demand", "Are people watching this topic now? (views/day)"], ["Breakout", "Do small channels rank and outperform here?"],
                ["Openness", "How much do big channels own the top results?"], ["Freshness", "Does YouTube surface new uploads, or is there a content gap?"]]
                .map(([k, v]) => <div key={k} className="list-row"><b style={{ width: 86 }}>{k}</b><span className="t2">{v}</span></div>)}
            </div>
          </div>
          {!s.demo && s.quota_history.length > 0 && (
            <div className="card">
              <h3>Quota use, last {s.quota_history.length} days</h3><p className="sub">Units per day (resets midnight Pacific)</p>
              <div className="bars">
                {s.quota_history.map((d) => (
                  <div key={d.day} className="b" style={{ height: `${Math.max(3, (d.units / maxQ) * 100)}%` }}
                    onMouseEnter={(e) => tip.show(<><b>{d.day}</b><br />{d.units.toLocaleString()} units</>, e)} onMouseMove={tip.move} onMouseLeave={tip.hide} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
