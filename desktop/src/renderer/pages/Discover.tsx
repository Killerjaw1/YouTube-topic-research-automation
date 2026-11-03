import { useEffect, useRef, useState } from "react";
import type { Candidate, RedditPost, Report } from "../../core/types";
import { call } from "../api";
import { Icon } from "../components/Icon";
import { ideaModal } from "../components/IdeaModal";
import { analyzeLink, DemoBanner, Empty, FormatBadge, go, Loading, PageHead, type Route, ScorePill, useApp } from "../components/ui";
import { fmt, store } from "../format";

export function DiscoverPage({ route }: { route: Route }) {
  const tab = route.params.get("tab") ?? "youtube";
  return (
    <>
      <PageHead title="Discover ideas" desc="Find specific search phrases around a niche, then score the promising ones. Finding ideas uses no quota; scoring uses ≈102 units each." />
      <DemoBanner />
      <div className="tabs">
        <button className={tab === "youtube" ? "on" : ""} onClick={() => go("#/discover?tab=youtube")}>YouTube search suggestions</button>
        <button className={tab === "reddit" ? "on" : ""} onClick={() => go("#/discover?tab=reddit")}>Reddit</button>
      </div>
      {tab === "reddit" ? <RedditTab /> : <YouTubeTab seed={route.params.get("seed") ?? ""} />}
    </>
  );
}

interface Row extends Candidate { sel: boolean; loading?: boolean; result?: Report; error?: string }

function YouTubeTab({ seed: initial }: { seed: string }) {
  const { refresh, toast, fail, modal } = useApp();
  const [seed, setSeed] = useState(initial);
  const [mode, setMode] = useState<"full" | "alphabet" | "questions">("full");
  const [state, setState] = useState<{ loading?: boolean; error?: string }>({});
  const [rows, setRows] = useState<Row[] | null>(null);
  const [sortByScore, setSortByScore] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const cancel = useRef(false);

  const find = async (s = seed) => {
    if (!s.trim()) return;
    setState({ loading: true });
    history.replaceState(null, "", "#/discover?seed=" + encodeURIComponent(s.trim()));
    try {
      const c = await call("discover", s.trim(), mode);
      setRows(c.map((x, i) => ({ ...x, sel: i < 8 })));
      setSortByScore(false);
      setState({});
    } catch (e: any) { setState({ error: e.message }); }
  };
  useEffect(() => { if (initial) find(initial); }, []); // eslint-disable-line

  const update = (kw: string, patch: Partial<Row>) => setRows((rs) => rs!.map((r) => (r.keyword === kw ? { ...r, ...patch } : r)));
  const score = async (list: Row[]) => {
    if (progress || !list.length) return;
    cancel.current = false;
    let done = 0;
    setProgress({ done, total: list.length });
    for (const r of list) {
      if (cancel.current) break;
      update(r.keyword, { loading: true });
      try {
        update(r.keyword, { loading: false, result: await call("analyze", r.keyword, "quick"), error: undefined });
      } catch (e: any) {
        update(r.keyword, { loading: false, error: e.message });
        if (/quota|key/i.test(e.message)) { fail(e); break; }
      }
      done++;
      setProgress({ done, total: list.length });
      refresh();
    }
    setProgress(null);
    setSortByScore(true);
    toast(`Scored ${done} phrase${done === 1 ? "" : "s"}, sorted by score`);
  };

  const list = rows ? (sortByScore ? [...rows].sort((a, b) => (b.result?.score ?? -1) - (a.result?.score ?? -1)) : rows) : [];
  const pending = rows?.filter((r) => r.sel && !r.result) ?? [];
  const maxHits = Math.max(1, ...(rows ?? []).map((r) => r.hits));

  return (
    <>
      <div className="card" style={{ marginBottom: 16 }}>
        <form className="row" autoComplete="off" onSubmit={(e) => { e.preventDefault(); find(); }}>
          <input className="input" style={{ flex: 1, minWidth: 240 }} required value={seed} onChange={(e) => setSeed(e.target.value)}
            placeholder="Your niche, e.g. 'home workout', 'retro gaming', 'personal finance'" />
          <select className="select" value={mode} onChange={(e) => setMode(e.target.value as any)}>
            <option value="full">All suggestions</option><option value="alphabet">A–Z expansions</option><option value="questions">Questions only</option>
          </select>
          <button className="btn primary">Find ideas</button>
        </form>
      </div>
      {state.loading && <Loading title="Collecting search suggestions" rows={6} />}
      {state.error && <Empty icon="x" title="Suggestions couldn't be loaded">{state.error}</Empty>}
      {rows && !state.loading && (rows.length ? (
        <div className="card">
          <div className="card-head">
            <div><h3>{rows.length} search phrases</h3><p className="sub">Popularity shows how often a phrase appeared across suggestion lookups. Select phrases to score them.</p></div>
            <div className="row">
              <button className="btn sm ghost" onClick={() => setRows(rows.map((r) => ({ ...r, sel: false })))}>Clear</button>
              <button className="btn sm ghost" onClick={() => setRows(rows.map((r, i) => ({ ...r, sel: i < 10 })))}>Top 10</button>
              <button className="btn sm primary" disabled={!pending.length || Boolean(progress)} onClick={() => score(pending)}>Score {pending.length} selected</button>
            </div>
          </div>
          {progress && (
            <div className="row" style={{ marginBottom: 12 }}>
              <div className="progress-line" style={{ flex: 1 }}><i style={{ width: `${(progress.done / progress.total) * 100}%` }} /></div>
              <span className="small muted">{progress.done} / {progress.total}</span>
              <button className="btn sm" onClick={() => { cancel.current = true; }}>Stop</button>
            </div>
          )}
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th style={{ width: 36 }} /><th>Search phrase</th><th>Source</th><th>Popularity</th>
                <th className="sortable num" onClick={() => setSortByScore(!sortByScore)}>Score {sortByScore ? "▼" : ""}</th><th>Verdict</th>
                <th className="num">Small in top 10</th><th className="num">Large in top 10</th><th>Format</th><th /></tr></thead>
              <tbody>{list.map((r) => {
                const res = r.result;
                return (
                  <tr key={r.keyword}>
                    <td><input type="checkbox" checked={r.sel} onChange={(e) => update(r.keyword, { sel: e.target.checked })} /></td>
                    <td><b>{r.keyword}</b></td>
                    <td><span className="badge neutral">{r.source}</span></td>
                    <td><span className="hits">{Array.from({ length: 5 }, (_, k) => <i key={k} className={k < Math.ceil((r.hits / maxHits) * 5) ? "on" : ""} />)}</span></td>
                    <td className="num">{res ? <ScorePill score={res.score} /> : r.loading ? <div className="spinner" style={{ display: "inline-block" }} />
                      : r.error ? <span className="badge bad">error</span> : <span className="muted">–</span>}</td>
                    <td className="small">{res ? res.verdict : r.error ? <span className="muted">{r.error}</span> : ""}</td>
                    <td className="num">{res ? String(res.metrics.small_in_top10) : ""}</td>
                    <td className="num">{res ? String(res.metrics.big_in_top10) : ""}</td>
                    <td>{res && <FormatBadge format={res.formats.recommended?.format === "short" ? "short" : "long"} />}</td>
                    <td className="right nowrap">{res ? <>
                      <a className="btn sm ghost" href={`#/report/${res.scan_id}`}>Report</a>
                      <button className="btn sm ghost" title="Save idea" onClick={() => ideaModal(modal, { title: res.keyword, keyword: res.keyword, score: res.score, verdict: res.verdict, format: res.formats.recommended?.format, scan_id: res.scan_id })}><Icon name="bookmark" /></button>
                    </> : <button className="btn sm ghost" disabled={Boolean(progress)} onClick={() => score([r])}>Score</button>}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        </div>
      ) : <Empty icon="compass" title="No suggestions found">Try a broader or more common phrase.</Empty>)}
    </>
  );
}

function RedditTab() {
  const { modal } = useApp();
  const [sub, setSub] = useState(store<string>("reddit") ?? "");
  const [period, setPeriod] = useState("week");
  const [state, setState] = useState<{ loading?: boolean; posts?: RedditPost[]; error?: string }>({});
  const load = async () => {
    if (!sub.trim()) return;
    store("reddit", sub.trim());
    setState({ loading: true });
    try { setState({ posts: (await call("reddit", sub.trim(), period)).posts }); } catch (e: any) { setState({ error: e.message }); }
  };
  useEffect(() => { if (sub) load(); }, []); // eslint-disable-line
  const toTopic = (title: string) => modal((close) => <ThreadToTopic title={title} close={close} />);

  return (
    <>
      <div className="card" style={{ marginBottom: 16 }}>
        <p className="sub" style={{ marginTop: 0 }}>Popular threads show what an audience is asking about, often before it trends on YouTube. Uses no quota.</p>
        <form className="row" autoComplete="off" onSubmit={(e) => { e.preventDefault(); load(); }}>
          <div className="row" style={{ flex: 1, minWidth: 240, gap: 0 }}>
            <span className="input" style={{ display: "grid", placeItems: "center", borderRadius: "10px 0 0 10px", borderRight: 0, color: "var(--muted)" }}>r/</span>
            <input className="input" style={{ flex: 1, borderRadius: "0 10px 10px 0" }} placeholder="personalfinance" required value={sub} onChange={(e) => setSub(e.target.value)} />
          </div>
          <select className="select" value={period} onChange={(e) => setPeriod(e.target.value)}>
            <option value="week">Top this week</option><option value="day">Today</option><option value="month">This month</option><option value="year">This year</option>
          </select>
          <button className="btn primary">Load threads</button>
        </form>
      </div>
      {state.loading && <Loading title="Loading threads" rows={6} />}
      {state.error && <Empty icon="x" title="Couldn't load Reddit">{state.error}</Empty>}
      {state.posts && (
        <div className="card"><h3>{state.posts.length} threads</h3><p className="sub">Choose Analyze to turn a thread into a search phrase and score it.</p>
          <div className="list">
            {state.posts.map((p, i) => (
              <div key={i} className="list-row">
                <div style={{ width: 70 }} className="right"><b>{fmt(p.score)}</b><div className="small muted">upvotes</div></div>
                <div className="grow"><div style={{ fontWeight: 600 }}>{p.title}</div><div className="small muted">{fmt(p.comments)} comments {p.flair && "· " + p.flair}</div></div>
                {p.url && <a className="btn sm ghost" href={p.url} target="_blank" rel="noopener"><Icon name="external" /></a>}
                <button className="btn xs" onClick={() => toTopic(p.title)}>Analyze</button>
              </div>
            ))}
            {!state.posts.length && <div className="empty">No posts found.</div>}
          </div>
        </div>
      )}
    </>
  );
}

function ThreadToTopic({ title, close }: { title: string; close(): void }) {
  const [kw, setKw] = useState(title.replace(/[?!.]+$/, "").slice(0, 80));
  const goAnalyze = () => { close(); if (kw.trim()) go(analyzeLink(kw.trim())); };
  return (
    <>
      <h3>Analyze thread as a topic</h3>
      <p className="small muted" style={{ margin: 0 }}>Viewers search in short phrases. Shorten the thread title to what someone would type into YouTube.</p>
      <label className="field">Search phrase<input className="input" autoFocus value={kw} onChange={(e) => setKw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && goAnalyze()} /></label>
      <div className="foot"><button className="btn ghost" onClick={close}>Cancel</button><button className="btn primary" onClick={goAnalyze}>Analyze</button></div>
    </>
  );
}
