import { useEffect, useMemo, useState } from "react";
import type { AIAngles, AIMetadata, Report, RetentionPlan, VideoRow } from "../../core/types";
import { call, exportPdf, saveFile } from "../api";
import { ScoreRing, Scatter } from "../components/charts";
import { Icon } from "../components/Icon";
import { ideaModal } from "../components/IdeaModal";
import {
  analyzeLink, Checklist, Chips, CopyButton, DemoBanner, Empty, FormatBadge, go, Loading, PageHead, Reasons, type Route, Seg, SearchBox, useApp,
} from "../components/ui";
import { VideoTable } from "../components/VideoTable";
import { ago, fmt, store, TONE_COLOR, tone } from "../format";
import { OutlierGrid } from "./Outliers";

/** Navigate to an analysis; if we're already on that exact URL, run it again in place. */
function runFromUrl(q: string, depth: string, rerun: () => void) {
  const target = analyzeLink(q, depth);
  if (location.hash === target) rerun();
  else go(target);
}

export function scoringHelp(modal: ReturnType<typeof useApp>["modal"]) {
  modal((close) => (
    <>
      <h3>How the opportunity score works</h3>
      <p className="t2" style={{ margin: 0 }}>NicheRadar reads the current top 50 search results for a topic, measures each channel's size and how its video performed,
        and combines four signals into a score from 0 to 100.</p>
      <table className="data"><tbody>
        <tr><td style={{ width: 110 }}><b>Demand</b> <span className="muted">30%</span></td><td className="t2">Median views per day of the top results.</td></tr>
        <tr><td><b>Breakout</b> <span className="muted">30%</span></td><td className="t2">Small channels in the top 10, and small-channel videos that far outperformed their subscriber count.</td></tr>
        <tr><td><b>Openness</b> <span className="muted">25%</span></td><td className="t2">How little of the top 10 large channels hold, weighted by rank.</td></tr>
        <tr><td><b>Freshness</b> <span className="muted">15%</span></td><td className="t2">Share of recent uploads ranking, or a content gap where demand is high but top videos are old.</td></tr>
      </tbody></table>
      <p className="small muted" style={{ margin: 0 }}>Topics with very little demand are capped at 38, and topics fully held by large channels at 45. 70+ is strong, 55–69 good, 40–54 risky.</p>
      <div className="foot"><button className="btn" onClick={close}>Close</button></div>
    </>
  ));
}

export function AnalyzePage({ route }: { route: Route }) {
  const { refresh, modal } = useApp();
  const q = route.params.get("q") ?? "";
  const [depth, setDepth] = useState<"quick" | "deep">((route.params.get("depth") as any) || store<"quick" | "deep">("depth") || "quick");
  const [state, setState] = useState<{ loading?: boolean; report?: Report; error?: string }>({});
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!q || !route.params.get("run")) return;
    let live = true;
    setState({ loading: true });
    call("analyze", q, depth)
      .then((report) => { if (live) { setState({ report }); refresh(); } })
      .catch((e) => live && setState({ error: e.message }));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, nonce]);

  return (
    <>
      <PageHead title="Analyze topic" desc="Score a topic against what currently ranks on YouTube.">
        <button className="btn sm ghost" onClick={() => scoringHelp(modal)}><Icon name="info" />How scoring works</button>
      </PageHead>
      <DemoBanner />
      <div className="card search-card" style={{ marginBottom: 16 }}>
        <SearchBox value={q} autoFocus={!q} onSubmit={(kw) => runFromUrl(kw, depth, () => setNonce((n) => n + 1))} />
        <div className="row between" style={{ marginTop: 10 }}>
          <div className="row"><span className="small muted">Scan depth</span>
            <Seg value={depth} onChange={(d) => { setDepth(d); store("depth", d); }} options={[["quick", "Standard"], ["deep", "Deep"]]} />
            <span className="small muted">{depth === "deep" ? "≈204 quota units. Adds the most-viewed uploads from the last 90 days." : "≈102 quota units. Top 50 search results."}</span>
          </div>
        </div>
      </div>
      {state.loading && <Loading title="Analyzing" rows={6} steps={[`Searching YouTube for “${q}”`, depth === "deep" ? "Collecting recent top uploads" : "Collecting video statistics",
        "Measuring channel sizes", "Scoring and building the upload playbook"]} />}
      {state.error && (
        <Empty icon="x" title="The analysis couldn't be completed" actions={/key/i.test(state.error) ? <a className="btn sm" href="#/settings">Open settings</a> : undefined}>{state.error}</Empty>
      )}
      {state.report && <ReportView report={state.report} />}
      {!q && !state.loading && (
        <Empty icon="target" title="Enter a topic to analyze">You'll see who ranks for it today, whether smaller channels break through, which format performs better,
          and the titles, tags and description to upload with.</Empty>
      )}
    </>
  );
}

export function ReportPage({ id }: { id: number }) {
  const [scan, setScan] = useState<{ kind: string; payload: any } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { call("getScan", id).then(setScan).catch((e) => setError(e.message)); }, [id]);
  if (error) return <Empty icon="x" title="Report not found" actions={<a className="btn sm" href="#/history">Back to history</a>}>{error}</Empty>;
  if (!scan) return <Loading title="Loading report" />;
  if (scan.kind === "outliers") return <><PageHead title="Outlier search" desc={scan.payload.keyword} /><OutlierGrid data={scan.payload} /></>;
  const rep: Report = { ...scan.payload, scan_id: id };
  return (
    <>
      <div className="row no-print" style={{ marginBottom: 14 }}>
        <a className="btn xs ghost" href="#/history">← History</a>
        <span className="grow" />
        <a className="btn xs" href={analyzeLink(rep.keyword, rep.depth)}><Icon name="refresh" />Re-run with current data</a>
      </div>
      <ReportView report={rep} />
    </>
  );
}

const SUB_INFO: [keyof Report["subscores"], string, string][] = [
  ["demand", "Demand", "Views per day on the top results"],
  ["breakout", "Breakout", "Small channels ranking and outperforming"],
  ["openness", "Openness", "Room not held by large channels"],
  ["freshness", "Freshness", "New uploads ranking, or a content gap"],
];

type VFilter = "all" | "small" | "breakout" | "big" | "short" | "long";

function ReportView({ report: rep }: { report: Report }) {
  const { status, modal, fail, toast, refresh } = useApp();
  const [ai, setAI] = useState<AIAngles | undefined>(rep.ai);
  const [aiLoading, setAILoading] = useState(false);
  const [vf, setVF] = useState<VFilter>("all");
  const [tracked, setTracked] = useState(false);
  useEffect(() => { call("listTracked").then((t) => setTracked(t.some((x) => x.keyword === rep.keyword.toLowerCase()))).catch(() => undefined); }, [rep.keyword]);
  const t = rep.tone ?? tone(rep.score);
  const f = rep.formats, rec = f.recommended ?? { format: "either", why: "" };
  const m = rep.metrics, th = rep.thresholds;
  const all = useMemo(() => {
    const seen = new Set<string>();
    // Recent uploads that aren't in the main search results have no search rank of their own.
    const recent = rep.recent.map((v) => ({ ...v, rank: null }));
    return [...rep.videos, ...recent].filter((v) => (seen.has(v.id) ? false : (seen.add(v.id), true)));
  }, [rep]);
  const filter = useMemo(() => (v: VideoRow) =>
    vf === "all" || (vf === "breakout" ? Boolean(v.breakout) : vf === "short" || vf === "long" ? v.format === vf : v.size === vf), [vf]);

  const toggleTrack = async () => {
    try {
      if (tracked) { await call("untrack", rep.keyword); toast("Removed from watchlist"); }
      else { await call("track", rep.keyword, rep.scan_id ?? null); toast("Added to watchlist"); }
      setTracked(!tracked);
      refresh();
    } catch (e) { fail(e); }
  };
  const runAI = async () => {
    if (!status?.has_ai_key) {
      modal((close) => (
        <>
          <h3>Suggested angles</h3>
          <p className="t2" style={{ margin: 0 }}>Claude reviews this report and proposes differentiated angles, ready-to-use metadata and a retention plan,
            so your video doesn't compete head-on with large channels.</p>
          <p className="small muted" style={{ margin: 0 }}>{status?.desktop ? "Requires an Anthropic API key. Add one in Settings → AI assistant. Usage is billed to your Anthropic account." : "Available in the desktop app."}</p>
          <div className="foot"><button className="btn ghost" onClick={close}>Cancel</button>{status?.desktop && <a className="btn primary" href="#/settings" onClick={close}>Open settings</a>}</div>
        </>
      ));
      return;
    }
    setAILoading(true);
    try { setAI(await call("aiAngles", rep.scan_id!)); } catch (e) { fail(e); } finally { setAILoading(false); }
  };
  const exportCsv = async () => { try { const p = await saveFile(await call("scanCsv", rep.scan_id!)); if (p) toast(`Saved ${p}`); } catch (e) { fail(e); } };
  const exportReport = async () => {
    try { const p = await exportPdf(`NicheRadar - ${rep.keyword.replace(/[^\w -]+/g, "")}.pdf`); if (p) toast(`Saved ${p}`); } catch (e) { fail(e); }
  };

  return (
    <div className="stack">
      <div className="card">
        <div className="report-head">
          <ScoreRing score={rep.score} />
          <div style={{ minWidth: 0 }}>
            <div className="small muted" style={{ marginBottom: 2 }}>Opportunity score</div>
            <h2 className="report-title">{rep.keyword}</h2>
            <span className={`badge ${t}`}>{rep.verdict}</span>
            <div className="report-meta">
              <span>{Number(m.results ?? 0)} results</span>
              <span>{rep.depth === "deep" ? "Deep scan" : "Standard scan"}</span>
              <span>Small channel: under {fmt(th.small_max)} subscribers</span>
              {rep.quota_cost != null && !rep.demo && <span>{rep.quota_cost ? `${rep.quota_cost} quota units` : "Served from cache"}</span>}
              {rep.created && <span>{ago(rep.created)}</span>}
              {rep.demo && <span className="badge demo">Sample data</span>}
            </div>
          </div>
          <div className="report-actions">
            <button className={`btn sm ${tracked ? "on" : ""}`} onClick={toggleTrack} title="Follow this topic's score over time"><Icon name="eye" />{tracked ? "Tracking" : "Track"}</button>
            <button className="btn sm" onClick={() => ideaModal(modal, {
              title: rep.keyword, keyword: rep.keyword, score: rep.score, verdict: rep.verdict, format: rec.format, scan_id: rep.scan_id ?? null,
              notes: rep.reasons.filter((x) => x.type === "good").map((x) => "• " + x.text).join("\n"),
            })}><Icon name="bookmark" />Save idea</button>
            <div className="btn-group">
              {rep.scan_id && <button className="btn sm" onClick={exportCsv} title="Export results as CSV"><Icon name="download" />CSV</button>}
              <button className="btn sm" onClick={exportReport} title="Export this report as PDF"><Icon name="file" />PDF</button>
            </div>
            <a className="btn sm" target="_blank" rel="noopener" href={`https://www.youtube.com/results?search_query=${encodeURIComponent(rep.keyword)}`} title="Open this search on YouTube"><Icon name="external" /></a>
            <button className="btn sm primary" onClick={runAI} disabled={aiLoading}><Icon name="wand" />Suggest angles</button>
          </div>
        </div>
      </div>

      <div className="subscores">
        {SUB_INFO.map(([k, name, desc]) => {
          const v = rep.subscores[k] ?? 0;
          return (
            <div key={k} className="subscore">
              <div className="top"><span className="name">{name}</span><span className="val">{v}</span></div>
              <div className="bar"><i style={{ width: `${v}%`, background: TONE_COLOR[tone(v)] }} /></div>
              <p>{desc}</p>
            </div>
          );
        })}
      </div>

      <div className="grid g-report">
        <div className="card"><h3 style={{ marginBottom: 10 }}>Findings</h3><Reasons items={rep.reasons} /></div>
        <div className="card">
          <h3>Recommended format</h3><p className="sub">{rec.why}</p>
          <div className="format-cmp">
            {(["short", "long"] as const).map((k) => {
              const s = f[k];
              const win = rec.format === k || rec.format === "both";
              return (
                <div key={k} className={win ? "win" : ""}>
                  <h4><Icon name={k === "short" ? "phone" : "play"} />{k === "short" ? "Shorts" : "Long-form"} {win && <span className="badge great">Recommended</span>}</h4>
                  <dl>
                    <dt>Videos</dt><dd>{s?.count ?? 0}</dd><dt>Median views/day</dt><dd>{fmt(s?.median_vpd)}</dd>
                    <dt>Median views</dt><dd>{fmt(s?.median_views)}</dd><dt>Breakouts</dt><dd>{s?.breakouts ?? 0}</dd>
                    <dt>From small channels</dt><dd>{Math.round((s?.small_share ?? 0) * 100)}%</dd>
                  </dl>
                </div>
              );
            })}
          </div>
          <div className="small muted">Shorts are identified by length: 60 seconds or less, or up to 3 minutes when tagged #shorts.</div>
          {rep.title_words.length > 0 && <>
            <div className="section-title">Frequent words in top-performing titles</div>
            <div className="chips">{rep.title_words.map((w) => <span key={w.word} className="chip">{w.word} <b>{w.count}</b></span>)}</div>
          </>}
        </div>
      </div>

      <div className="card">
        <div className="card-head"><div><h3>Channel size vs. views</h3>
          <p className="sub">Each point is a ranking video. Points above the dashed line earned more than 3× the channel's subscriber count in views, a sign YouTube recommended them beyond their audience.</p></div></div>
        <Scatter videos={all} smallMax={th.small_max} bigMin={th.big_min} />
      </div>

      {rep.playbook && <Playbook rep={rep} />}

      {aiLoading && <Loading title="Generating angles" rows={5} steps={["Reviewing the ranking videos", "Comparing large-channel and breakout angles", "Drafting metadata and a retention plan"]} />}
      {ai && !aiLoading && <AIPanel ai={ai} />}

      <div className="card flush">
        <div className="card-head" style={{ alignItems: "center" }}>
          <div><h3>Search results</h3><p className="sub">Current top results{rep.recent.length ? ", plus the most-viewed recent uploads" : ""}. Click a column to sort.</p></div>
          <Chips value={vf} onChange={setVF} options={[["all", "All"], ["small", "Small channels"], ["breakout", "Breakouts"], ["big", "Large channels"], ["short", "Shorts"], ["long", "Long-form"]]} />
        </div>
        <VideoTable videos={all} showRank filter={filter} />
      </div>

      {(rep.suggestions ?? []).length > 0 && (
        <div className="card">
          <h3>Related searches</h3><p className="sub">What people search around this topic. Narrower phrases are usually easier to rank for.</p>
          <div className="chips">{rep.suggestions!.map((s) => <a key={s} className="chip" href={analyzeLink(s)}>{s}</a>)}</div>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ playbook
type PbTab = "titles" | "desc" | "tags" | "ctr" | "watch" | "shorts" | "meta";

function Playbook({ rep }: { rep: Report }) {
  const pb = rep.playbook!, L = pb.length;
  const [tab, setTab] = useState<PbTab>("titles");
  const [desc, setDesc] = useState(pb.description);
  const tabs: [PbTab, string][] = [["titles", "Titles"], ["desc", "Description"], ["tags", "Tags"], ["ctr", "Click-through"], ["watch", "Watch time"], ["shorts", "Shorts"], ["meta", "Metadata"]];
  return (
    <div className="card">
      <div className="card-head">
        <div><h3>Upload playbook</h3><p className="sub">Metadata and best practices derived from the videos that rank and break out for this topic.</p></div>
        <a className="btn sm" href={`#/optimizer?scan=${rep.scan_id ?? ""}&kw=${encodeURIComponent(rep.keyword)}`}>Check a draft<Icon name="arrowRight" /></a>
      </div>
      <div className="subscores-plain" style={{ marginBottom: 16 }}>
        <div className="subscore"><div className="name">Target length</div><div className="val" style={{ marginTop: 4 }}>{L.long ? `${L.long.low_min}–${L.long.high_min} min` : "–"}</div>
          <p style={{ marginTop: 4 }}>{L.long ? `Middle range of ${L.long.n} winning videos (median ${L.long.median_min} min)` : "Not enough long-form data"}</p></div>
        <div className="subscore"><div className="name">Shorts length</div><div className="val" style={{ marginTop: 4 }}>{L.short ? `${L.short.median_s}s` : "20–45s"}</div>
          <p style={{ marginTop: 4 }}>{L.short ? `Median of ${L.short.n} Shorts in the results` : "Typical range"}</p></div>
        <div className="subscore"><div className="name">Title length</div><div className="val" style={{ marginTop: 4 }}>40–60 characters</div>
          <p style={{ marginTop: 4 }}>Ranking titles here average {pb.title_length.avg ?? "–"}</p></div>
      </div>
      <div className="tabs" role="tablist">{tabs.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab === "titles" && <>
        <div className="list">{pb.titles.map((x) => (
          <div key={x} className="list-row"><div className="grow" style={{ fontWeight: 500 }}>{x}</div>
            <span className="small tabular" style={{ color: x.length > 60 ? "var(--warn)" : "var(--muted)" }}>{x.length}</span>
            <CopyButton text={x} what="Title copied" /></div>
        ))}</div>
        <div className="section-title">Patterns in top-performing titles</div>
        <div className="stack" style={{ gap: 8 }}>{pb.title_patterns.slice(0, 6).map((p) => (
          <div key={p.key} className="row" style={{ flexWrap: "nowrap" }}>
            <span className="small t2" style={{ width: 300, flex: "none" }}>{p.label[0].toUpperCase() + p.label.slice(1)}</span>
            <div className="meter" style={{ flex: 1 }}><i style={{ width: `${p.share * 100}%` }} /></div>
            <span className="small tabular" style={{ width: 40, textAlign: "right" }}>{Math.round(p.share * 100)}%</span>
          </div>
        ))}</div>
      </>}
      {tab === "desc" && <>
        <textarea className="input mono" style={{ width: "100%", minHeight: 320, fontSize: 12 }} value={desc} onChange={(e) => setDesc(e.target.value)} spellCheck={false} />
        <div className="row between" style={{ marginTop: 10 }}>
          <span className="small muted">Replace the bracketed text and adjust chapter times to your edit.</span>
          <CopyButton className="btn sm" text={() => desc} what="Description copied" label="Copy" />
        </div>
      </>}
      {tab === "tags" && <>
        <div className="row between"><span className="small t2">Tags · {pb.tags_chars} of 500 characters</span><CopyButton className="btn xs" text={pb.tags.join(", ")} what="Tags copied" label="Copy tags" /></div>
        <div className="chips" style={{ margin: "8px 0 18px" }}>{pb.tags.map((x) => <span key={x} className="chip">{x}</span>)}</div>
        <div className="row between"><span className="small t2">Hashtags · shown above the title, add at the end of the description</span><CopyButton className="btn xs" text={pb.hashtags.join(" ")} what="Hashtags copied" label="Copy hashtags" /></div>
        <div className="chips" style={{ marginTop: 8 }}>{pb.hashtags.map((x) => <span key={x} className="chip">{x}</span>)}</div>
      </>}
      {tab === "ctr" && <Checklist items={pb.checklist.ctr} />}
      {tab === "watch" && <Checklist items={pb.checklist.watch_time} />}
      {tab === "shorts" && <Checklist items={pb.checklist.shorts} />}
      {tab === "meta" && <Checklist items={pb.checklist.metadata} />}
    </div>
  );
}

// ------------------------------------------------------------------------ AI
export function MetadataBlock({ md, plan }: { md?: AIMetadata; plan?: RetentionPlan }) {
  const [desc, setDesc] = useState(md?.description ?? "");
  if (!md) return null;
  return (
    <>
      <div className="grid g2" style={{ marginTop: 4 }}>
        <div>
          <div className="section-title" style={{ marginTop: 0 }}>Titles</div>
          <div className="list">{md.title_options.map((x) => (
            <div key={x} className="list-row"><div className="grow" style={{ fontWeight: 500 }}>{x}</div><span className="small muted tabular">{x.length}</span><CopyButton text={x} what="Title copied" /></div>
          ))}</div>
          <div className="section-title">Thumbnail concepts</div>
          <ol className="steps-list">{md.thumbnail_concepts.map((x) => <li key={x}><span>{x}</span></li>)}</ol>
          <div className="section-title">Tags</div>
          <div className="chips" style={{ marginBottom: 8 }}>{md.tags.map((x) => <span key={x} className="chip">{x}</span>)}{md.hashtags.map((x) => <span key={x} className="chip">{x}</span>)}</div>
          <CopyButton className="btn xs" text={md.tags.join(", ")} what="Tags copied" label="Copy tags" />
          <div className="section-title">Pinned comment</div>
          <div className="small t2">{md.pinned_comment}</div>
        </div>
        <div>
          <div className="row between"><div className="section-title" style={{ marginTop: 0 }}>Description</div><CopyButton className="btn xs" text={() => desc} what="Description copied" label="Copy" /></div>
          <textarea className="input mono" style={{ width: "100%", minHeight: 300, fontSize: 12 }} value={desc} onChange={(e) => setDesc(e.target.value)} spellCheck={false} />
        </div>
      </div>
      {plan && <>
        <div className="sep" />
        <div className="row between"><h3>Retention plan</h3><span className="badge outline">{plan.target_length}</span></div>
        <div className="section-title">Opening (first 15 seconds)</div>
        <div className="small t2" style={{ padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--surface-2)" }}>{plan.hook_script}</div>
        <div className="grid g2">
          <div><div className="section-title">Structure</div><ol className="steps-list">{plan.outline.map((x) => <li key={x}><span>{x}</span></li>)}</ol></div>
          <div><div className="section-title">Retention notes</div><ol className="steps-list">{plan.tips.map((x) => <li key={x}><span>{x}</span></li>)}</ol></div>
        </div>
      </>}
    </>
  );
}

function AIPanel({ ai }: { ai: AIAngles }) {
  const { modal } = useApp();
  return (
    <div className="card">
      <div className="card-head"><div><h3>Suggested angles</h3><p className="sub">{ai.summary}</p></div><span className="badge outline">Generated with Claude</span></div>
      <div className="grid g2">
        {ai.angles.map((a, i) => (
          <div key={i} className="ai-angle">
            <h4><span className="idx">{i + 1}</span><span className="grow">{a.angle}</span><FormatBadge format={a.format === "short" ? "short" : "long"} /></h4>
            <div className="small t2">{a.why_it_can_win}</div>
            <ul className="small">{a.titles.map((x) => <li key={x}>{x}</li>)}</ul>
            <div className="small hook"><span className="muted">Opening: </span>{a.hook}</div>
            <div className="row"><span className="small muted">Thumbnail text</span><span className="badge neutral">{a.thumbnail_text}</span>
              <button className="btn xs ghost" style={{ marginLeft: "auto" }} onClick={() => ideaModal(modal, {
                title: a.titles[0] || a.angle, keyword: a.angle, format: a.format,
                notes: `Angle: ${a.angle}\nWhy: ${a.why_it_can_win}\nOpening: ${a.hook}\nThumbnail: ${a.thumbnail_text}\nTitles:\n${a.titles.map((x) => "• " + x).join("\n")}`,
              })}><Icon name="bookmark" />Save idea</button></div>
          </div>
        ))}
      </div>
      <div className="grid g3" style={{ marginTop: 8 }}>
        <div><div className="section-title">Avoid</div><ol className="steps-list">{ai.avoid.map((x) => <li key={x}><span>{x}</span></li>)}</ol></div>
        <div><div className="section-title">Shorts ideas</div><ol className="steps-list">{ai.shorts_ideas.map((x) => <li key={x}><span>{x}</span></li>)}</ol></div>
        <div><div className="section-title">Research next</div><div className="chips">{ai.keywords_to_research.map((k) => <a key={k} className="chip" href={analyzeLink(k)}>{k}</a>)}</div></div>
      </div>
      {ai.metadata && <><div className="sep" /><h3 style={{ marginBottom: 8 }}>Metadata for the strongest angle</h3><MetadataBlock md={ai.metadata} plan={ai.retention_plan} /></>}
    </div>
  );
}
