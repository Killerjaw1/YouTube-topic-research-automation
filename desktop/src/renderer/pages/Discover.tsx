import { useEffect, useRef, useState } from "react";
import type { Candidate, Focus, RedditPost, Report } from "../../core/types";
import { call } from "../api";
import { ideaModal } from "../components/IdeaModal";
import { Button, Card, Dialog, ListRow, Tag } from "../components/kit";
import { analyzeLink, DemoBanner, Empty, FormatBadge, go, Loading, PageHead, type Route, ScorePill, useApp, Verdict } from "../components/ui";
import { fmt, store } from "../format";

export function DiscoverPage({ route }: { route: Route }) {
  const tab = route.params.get("tab") ?? "youtube";
  return (
    <>
      <PageHead title="Discover ideas" desc="Find specific search phrases around a niche, then score the ones worth making. Finding phrases is free; each score uses about 102 quota units." />
      <DemoBanner />
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === "youtube"} onClick={() => go("#/discover?tab=youtube")}>YouTube search suggestions</button>
        <button role="tab" aria-selected={tab === "reddit"} onClick={() => go("#/discover?tab=reddit")}>Reddit</button>
      </div>
      {tab === "reddit" ? <RedditTab sub={route.params.get("sub") ?? ""} /> : <YouTubeTab seed={route.params.get("seed") ?? ""} initialMode={route.params.get("mode")} />}
    </>
  );
}

interface Row extends Candidate { sel: boolean; loading?: boolean; result?: Report; error?: string }

type Mode = "full" | "alphabet" | "questions";
const FOCUS_NOTE: Record<Focus, string> = { all: "", short: " Scores compare against Shorts only.", long: " Scores compare against long-form videos only." };

function YouTubeTab({ seed: initial, initialMode }: { seed: string; initialMode: string | null }) {
  const { refresh, toast, fail, modal } = useApp();
  const [seed, setSeed] = useState(initial);
  const [mode, setMode] = useState<Mode>(initialMode === "questions" || initialMode === "alphabet" ? initialMode : "full");
  const focus = store<Focus>("focus") ?? "all";
  const [state, setState] = useState<{ loading?: boolean; error?: string }>({});
  const [rows, setRows] = useState<Row[] | null>(null);
  const [sortByScore, setSortByScore] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const cancel = useRef(false);

  const find = async (s = seed) => {
    if (!s.trim()) return;
    setState({ loading: true });
    history.replaceState(null, "", "#/discover?seed=" + encodeURIComponent(s.trim()) + (mode !== "full" ? `&mode=${mode}` : ""));
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
        update(r.keyword, { loading: false, result: await call("analyze", r.keyword, "quick", focus), error: undefined });
      } catch (e: any) {
        update(r.keyword, { loading: false, error: e.message });
        if (/quota|key/i.test(e.message)) { fail(e, "Scoring stopped"); break; }
      }
      done++;
      setProgress({ done, total: list.length });
      refresh();
    }
    setProgress(null);
    setSortByScore(true);
    toast(`${done} ${done === 1 ? "phrase" : "phrases"} scored`, "ok", "The list is now sorted by score.");
  };

  const list = rows ? (sortByScore ? [...rows].sort((a, b) => (b.result?.score ?? -1) - (a.result?.score ?? -1)) : rows) : [];
  const pending = rows?.filter((r) => r.sel && !r.result) ?? [];
  const maxHits = Math.max(1, ...(rows ?? []).map((r) => r.hits));

  return (
    <>
      <Card className="mb">
        <form className="row" autoComplete="off" onSubmit={(e) => { e.preventDefault(); find(); }}>
          <input className="input grow" style={{ minWidth: 220 }} required value={seed} onChange={(e) => setSeed(e.target.value)} aria-label="Niche"
            placeholder="Your niche, such as home workouts, retro gaming or personal finance" />
          <select className="select" value={mode} onChange={(e) => setMode(e.target.value as any)} aria-label="Suggestions to collect">
            <option value="full">All suggestions</option><option value="alphabet">A–Z suggestions</option><option value="questions">Questions only</option>
          </select>
          <Button type="submit" variant="primary" busy={state.loading}>Find phrases</Button>
        </form>
      </Card>
      {state.loading && <Loading title="Collecting search suggestions" rows={6} />}
      {state.error && <Empty icon="warn" title="Suggestions couldn’t be loaded" actions={<Button onClick={() => find()}>Try again</Button>}>{state.error}</Empty>}
      {rows && !state.loading && (rows.length ? (
        <Card flush title={`${rows.length} search phrases`} sub={`Popularity shows how often a phrase came up across suggestion lookups.${FOCUS_NOTE[focus]}`}
          actions={<>
            <Button size="sm" variant="ghost" onClick={() => setRows(rows.map((r) => ({ ...r, sel: false })))}>Clear selection</Button>
            <Button size="sm" variant="ghost" onClick={() => setRows(rows.map((r, i) => ({ ...r, sel: i < 10 })))}>Select top 10</Button>
            <Button size="sm" variant="primary" icon="target" disabled={!pending.length || Boolean(progress)} onClick={() => score(pending)}>Score {pending.length} selected</Button>
          </>}>
          {progress && (
            <div className="card-toolbar">
              <div className="progress-line grow"><i style={{ width: `${(progress.done / progress.total) * 100}%` }} /></div>
              <span className="secondary tabular">{progress.done} of {progress.total}</span>
              <Button size="sm" onClick={() => { cancel.current = true; }}>Stop</Button>
            </div>
          )}
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th style={{ width: 36 }} /><th>Search phrase</th><th>Source</th><th>Popularity</th>
                <th className="sortable num" onClick={() => setSortByScore(!sortByScore)} aria-sort={sortByScore ? "descending" : "none"}>Score{sortByScore && <span className="arrow">▼</span>}</th><th>Verdict</th>
                <th className="num">Small in top 10</th><th className="num">Large in top 10</th><th>Format</th><th /></tr></thead>
              <tbody>{list.map((r) => {
                const res = r.result;
                return (
                  <tr key={r.keyword} aria-selected={r.sel}>
                    <td><input type="checkbox" aria-label={`Select ${r.keyword}`} checked={r.sel} onChange={(e) => update(r.keyword, { sel: e.target.checked })} /></td>
                    <td style={{ fontWeight: 600 }}>{r.keyword}</td>
                    <td><Tag>{({ autocomplete: "Suggestion", question: "Question", modifier: "Modifier", demo: "Sample" } as Record<string, string>)[r.source] ?? r.source}</Tag></td>
                    <td><span className="hits" aria-label={`Popularity ${r.hits}`}>{Array.from({ length: 5 }, (_, k) => <i key={k} className={k < Math.ceil((r.hits / maxHits) * 5) ? "on" : ""} />)}</span></td>
                    <td className="num">{res ? <ScorePill score={res.score} /> : r.loading ? <span className="spinner" /> : <span className="muted">–</span>}</td>
                    <td>{res ? <Verdict tone={res.tone}>{res.verdict}</Verdict> : r.error ? <span className="status"><span className="dot danger" />Couldn’t score</span> : null}</td>
                    <td className="num">{res ? String(res.metrics.small_in_top10) : ""}</td>
                    <td className="num">{res ? String(res.metrics.big_in_top10) : ""}</td>
                    <td>{res && <FormatBadge format={res.formats.recommended?.format === "short" ? "short" : "long"} />}</td>
                    <td className="right nowrap">{res ? <>
                      <Button size="sm" variant="ghost" href={`#/report/${res.scan_id}`}>Open report</Button>
                      <Button size="sm" variant="ghost" iconOnly icon="bookmark" label="Save idea" onClick={() => ideaModal(modal, { title: res.keyword, keyword: res.keyword, score: res.score, verdict: res.verdict, format: res.formats.recommended?.format, scan_id: res.scan_id })} />
                    </> : <Button size="sm" variant="ghost" disabled={Boolean(progress)} onClick={() => score([r])}>Score</Button>}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        </Card>
      ) : <Empty icon="compass" title="No suggestions found">Try a broader or more common phrase.</Empty>)}
      {!rows && !state.loading && !state.error && (
        <Empty icon="compass" title="Start from a niche">Enter a broad topic. NicheRadar collects the specific phrases people search for around it, which are usually easier to rank for.</Empty>
      )}
    </>
  );
}

/** Subreddits where people ask "why" and "how" questions, which make good explainer topics. */
const CURIOUS = ["todayilearned", "explainlikeimfive", "NoStupidQuestions", "askscience", "geography", "gaming", "retrogaming", "Minecraft"];

function RedditTab({ sub: fromLink }: { sub: string }) {
  const { modal } = useApp();
  const [sub, setSub] = useState(fromLink || store<string>("reddit") || "");
  const [period, setPeriod] = useState("week");
  const [state, setState] = useState<{ loading?: boolean; posts?: RedditPost[]; error?: string; blocked?: boolean }>({});
  const load = async (name = sub) => {
    if (!name.trim()) return;
    store("reddit", name.trim());
    setState({ loading: true });
    try { setState({ posts: (await call("reddit", name.trim(), period)).posts }); } catch (e: any) { setState({ error: e.message, blocked: e.kind === "RedditBlocked" }); }
  };
  const pick = (name: string) => { setSub(name); load(name); };
  useEffect(() => { if (sub) load(); }, []); // eslint-disable-line
  const toTopic = (title: string) => modal((close) => <ThreadToTopic title={title} close={close} />);

  return (
    <>
      <Card className="mb">
        <form className="row" autoComplete="off" onSubmit={(e) => { e.preventDefault(); load(); }}>
          <div className="input-group grow" style={{ minWidth: 220 }}>
            <span className="prefix" aria-hidden="true">r/</span>
            <input className="input" placeholder="personalfinance" required value={sub} onChange={(e) => setSub(e.target.value)} aria-label="Subreddit" />
          </div>
          <select className="select" value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Period">
            <option value="week">Top this week</option><option value="day">Top today</option><option value="month">Top this month</option><option value="year">Top this year</option>
          </select>
          <Button type="submit" variant="primary" busy={state.loading}>Show threads</Button>
        </form>
        <p className="secondary" style={{ margin: "8px 0 0" }}>Popular threads show what people are asking about, often before it trends on YouTube. This uses no quota.</p>
        <div className="row mt-sm"><span className="secondary">Good for explainer ideas:</span>
          <div className="chips">{CURIOUS.map((c) => <button key={c} type="button" className="chip" aria-pressed={sub === c} onClick={() => pick(c)}>r/{c}</button>)}</div>
        </div>
      </Card>
      {state.loading && <Loading title="Loading threads" rows={6} />}
      {state.error && <Empty icon="warn" title={state.blocked ? "Reddit didn’t send the threads" : "Reddit couldn’t be reached"}
        actions={<><Button onClick={() => load()}>Try again</Button>{state.blocked && <Button variant="primary" href="#/settings?s=reddit">Set up Reddit access…</Button>}</>}>{state.error}</Empty>}
      {state.posts && (state.posts.length ? (
        <Card flush title={`${state.posts.length} threads`} sub="Choose Analyze to turn a thread into a search phrase and score it.">
          <div className="list">
            {state.posts.map((p, i) => (
              <ListRow key={i} title={p.title}
                leading={p.score >= 0 ? <div className="right" style={{ width: 56 }}><div className="tabular" style={{ fontWeight: 600 }}>{fmt(p.score)}</div><div className="secondary">upvotes</div></div> : undefined}
                secondary={[p.comments >= 0 ? `${fmt(p.comments)} comments` : "", p.flair].filter(Boolean).join(" · ") || undefined}
                end={<>{p.url && <Button size="sm" variant="ghost" iconOnly icon="external" label="Open thread" href={p.url} target="_blank" rel="noopener" />}<Button size="sm" onClick={() => toTopic(p.title)}>Analyze…</Button></>} />
            ))}
          </div>
        </Card>
      ) : <Empty icon="reddit" title="No threads in this period">Choose a longer period or another subreddit.</Empty>)}
      {!state.posts && !state.loading && !state.error && (
        <Empty icon="reddit" title="Choose a community">Enter a subreddit your audience reads to see its most popular threads.</Empty>
      )}
    </>
  );
}

function ThreadToTopic({ title, close }: { title: string; close(): void }) {
  const [kw, setKw] = useState(title.replace(/[?!.]+$/, "").slice(0, 80));
  const goAnalyze = () => { close(); if (kw.trim()) go(analyzeLink(kw.trim())); };
  return (
    <Dialog title="Analyze this thread" desc="People search in short phrases. Shorten the thread title to what someone would type into YouTube."
      footer={<><Button onClick={close}>Cancel</Button><Button variant="primary" onClick={goAnalyze} disabled={!kw.trim()}>Analyze</Button></>}>
      <label className="field">Search phrase<input className="input" autoFocus value={kw} onChange={(e) => setKw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && goAnalyze()} /></label>
    </Dialog>
  );
}
