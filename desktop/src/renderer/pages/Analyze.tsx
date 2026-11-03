import { useEffect, useMemo, useState } from "react";
import type { AIAngles, AIMetadata, Report, RetentionPlan, VideoRow } from "../../core/types";
import { call, saveFile } from "../api";
import { ScoreRing, Scatter } from "../components/charts";
import { Icon } from "../components/Icon";
import { ideaModal } from "../components/IdeaModal";
import {
  analyzeLink, Checklist, Chips, CopyButton, DemoBanner, Empty, FormatBadge, go, Loading, Reasons, type Route, Seg, SearchBox, useApp,
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

export function AnalyzePage({ route }: { route: Route }) {
  const { refresh } = useApp();
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
      <DemoBanner />
      <div className="card" style={{ marginBottom: 16 }}>
        <SearchBox value={q} onSubmit={(kw) => runFromUrl(kw, depth, () => setNonce((n) => n + 1))} />
        <div className="row" style={{ marginTop: 12, justifyContent: "space-between" }}>
          <div className="row"><span className="small muted">Depth</span>
            <Seg value={depth} onChange={(d) => { setDepth(d); store("depth", d); }} options={[["quick", "Quick · ~102 units"], ["deep", "Deep · ~204 units"]]} />
          </div>
          <span className="small muted">Deep adds the most-viewed uploads from the last 90 days, a better read on what YouTube pushes <i>right now</i>.</span>
        </div>
      </div>
      {state.loading && (
        <Loading title={`Researching “${q}”`} steps={["Searching YouTube the way a viewer would", depth === "deep" ? "Pulling the most-viewed recent uploads" : "Collecting top-ranking videos",
          "Measuring channel sizes and breakouts", "Scoring the opportunity and building your upload playbook"]} />
      )}
      {state.error && (
        <Empty icon="x" title="Couldn't analyze that topic">{state.error}
          {/key/i.test(state.error) && <div className="row" style={{ justifyContent: "center", marginTop: 12 }}><a className="btn" href="#/settings">Open Settings</a></div>}
        </Empty>
      )}
      {state.report && <ReportView report={state.report} />}
      {!q && !state.loading && (
        <Empty icon="target" title="Score any video idea">Enter a topic above. You'll see who currently wins that search, whether small channels can break in,
          what format to use, and the titles, tags and description to upload with.</Empty>
      )}
    </>
  );
}

export function ReportPage({ id }: { id: number }) {
  const [scan, setScan] = useState<{ kind: string; payload: any } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { call("getScan", id).then(setScan).catch((e) => setError(e.message)); }, [id]);
  if (error) return <Empty icon="x" title="Couldn't open report">{error}</Empty>;
  if (!scan) return <Loading title="Loading report" />;
  if (scan.kind === "outliers") return <OutlierGrid data={scan.payload} />;
  const rep: Report = { ...scan.payload, scan_id: id };
  return (
    <>
      <div className="row" style={{ marginBottom: 14 }}>
        <a className="btn sm ghost" href="#/history">← History</a>
        <a className="btn sm" href={analyzeLink(rep.keyword, rep.depth)}><Icon name="refresh" />Re-run with fresh data</a>
      </div>
      <ReportView report={rep} />
    </>
  );
}

const SUB_INFO: [keyof Report["subscores"], string, string][] = [
  ["demand", "Demand", "Views per day the top videos are getting."],
  ["breakout", "Breakout", "Small channels ranking and outperforming their size."],
  ["openness", "Openness", "Room left at the top that big channels don't hold."],
  ["freshness", "Freshness", "YouTube surfaces new uploads, or there's a content gap."],
];

type VFilter = "all" | "small" | "breakout" | "big" | "short" | "long";

function ReportView({ report: rep }: { report: Report }) {
  const { status, modal, fail, toast } = useApp();
  const [ai, setAI] = useState<AIAngles | undefined>(rep.ai);
  const [aiLoading, setAILoading] = useState(false);
  const [vf, setVF] = useState<VFilter>("all");
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

  const runAI = async () => {
    if (!status?.has_ai_key) {
      modal((close) => (
        <>
          <h3>AI angles need an Anthropic API key</h3>
          <p className="t2" style={{ margin: 0 }}>Claude reads this report (who ranks, what small channels did differently) and suggests differentiated angles,
            ready-to-paste metadata and a retention plan, so you don't copy what big channels already own.</p>
          <p className="small muted" style={{ margin: 0 }}>{status?.desktop ? "Add your key under Settings → AI assistant. Each request costs a few cents on your Anthropic account." : "AI features are available in the desktop app."}</p>
          <div className="foot"><button className="btn ghost" onClick={close}>Not now</button>{status?.desktop && <a className="btn primary" href="#/settings" onClick={close}>Open Settings</a>}</div>
        </>
      ));
      return;
    }
    setAILoading(true);
    try { setAI(await call("aiAngles", rep.scan_id!)); } catch (e) { fail(e); } finally { setAILoading(false); }
  };

  const exportCsv = async () => {
    try { const p = await saveFile(await call("scanCsv", rep.scan_id!)); if (p) toast("Saved " + p); } catch (e) { fail(e); }
  };

  return (
    <div className="stack">
      <div className="card">
        <div className="report-head">
          <ScoreRing score={rep.score} />
          <div style={{ minWidth: 0 }}>
            <div className="small muted" style={{ marginBottom: 4 }}>Opportunity score for</div>
            <h2 className="report-title">{rep.keyword}</h2>
            <span className={`badge ${t}`} style={{ fontSize: 13, padding: "4px 12px" }}><Icon name={t === "bad" ? "x" : t === "warn" ? "info" : "check"} />{rep.verdict}</span>
            <div className="report-meta">
              <span>{Number(m.results ?? 0)} results analyzed</span>
              <span>{rep.depth === "deep" ? "Deep scan" : "Quick scan"}</span>
              <span>Small = under {fmt(th.small_max)} subs</span>
              {rep.quota_cost != null && !rep.demo && <span>{rep.quota_cost} quota units{rep.quota_cost === 0 ? " (cached)" : ""}</span>}
              {rep.created && <span>{ago(rep.created)}</span>}
              {rep.demo && <span className="badge demo">Demo data</span>}
            </div>
          </div>
          <div className="report-actions">
            <button className="btn primary" onClick={() => ideaModal(modal, {
              title: rep.keyword, keyword: rep.keyword, score: rep.score, verdict: rep.verdict, format: rec.format, scan_id: rep.scan_id ?? null,
              notes: rep.reasons.filter((x) => x.type === "good").map((x) => "• " + x.text).join("\n"),
            })}><Icon name="bookmark" />Save to idea board</button>
            <button className="btn" onClick={runAI} disabled={aiLoading}><Icon name="sparkle" />AI angles & metadata</button>
            <div className="row" style={{ gap: 8 }}>
              {rep.scan_id && <button className="btn sm" style={{ flex: 1 }} onClick={exportCsv}><Icon name="download" />CSV</button>}
              <a className="btn sm" style={{ flex: 1 }} target="_blank" rel="noopener" href={`https://www.youtube.com/results?search_query=${encodeURIComponent(rep.keyword)}`}><Icon name="external" />YouTube</a>
            </div>
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
        <div className="card"><h3>What we found</h3><p className="sub">Why this topic scored {rep.score}</p><Reasons items={rep.reasons} /></div>
        <div className="card">
          <h3>Best format</h3><p className="sub">{rec.why}</p>
          <div className="format-cmp">
            {(["short", "long"] as const).map((k) => {
              const s = f[k];
              const win = rec.format === k || rec.format === "both";
              return (
                <div key={k} className={win ? "win" : ""}>
                  <h4><Icon name={k === "short" ? "phone" : "play"} />{k === "short" ? "Shorts" : "Long-form"} {win && <span className="badge great">Pick</span>}</h4>
                  <dl>
                    <dt>Videos</dt><dd>{s?.count ?? 0}</dd><dt>Median views/day</dt><dd>{fmt(s?.median_vpd)}</dd>
                    <dt>Median views</dt><dd>{fmt(s?.median_views)}</dd><dt>Small-channel breakouts</dt><dd>{s?.breakouts ?? 0}</dd>
                    <dt>From small channels</dt><dd>{Math.round((s?.small_share ?? 0) * 100)}%</dd>
                  </dl>
                </div>
              );
            })}
          </div>
          <div className="small muted">Shorts are detected by length (60s or less, or up to 3 min tagged #shorts).</div>
          {rep.title_words.length > 0 && <>
            <h3 style={{ marginTop: 16 }}>Words in the best-performing titles</h3><p className="sub">From the videos that most outperformed their channel size</p>
            <div className="chips">{rep.title_words.map((w) => <span key={w.word} className="chip">{w.word} <b>{w.count}</b></span>)}</div>
          </>}
        </div>
      </div>

      <div className="card">
        <div className="card-head"><div><h3>Who wins this search</h3>
          <p className="sub">Each dot is a video: channel size vs views. Dots above the dashed line got 3× more views than the channel has subscribers, which means YouTube pushed them to new viewers.</p></div></div>
        <Scatter videos={all} smallMax={th.small_max} bigMin={th.big_min} />
      </div>

      {rep.playbook && <Playbook rep={rep} />}

      {aiLoading && <Loading title="Claude is studying the results and drafting angles, metadata and a retention plan…" />}
      {ai && !aiLoading && <AIPanel ai={ai} />}

      <div className="card">
        <div className="card-head">
          <div><h3>Top results</h3><p className="sub">What a viewer sees when they search this today{rep.recent.length ? ", plus recent top uploads" : ""}</p></div>
          <Chips value={vf} onChange={setVF} options={[["all", "All"], ["small", "Small channels"], ["breakout", "Breakouts"], ["big", "Big channels"], ["short", "Shorts"], ["long", "Long-form"]]} />
        </div>
        <VideoTable videos={all} showRank filter={filter} />
      </div>

      {(rep.suggestions ?? []).length > 0 && (
        <div className="card">
          <h3>Related searches to check</h3><p className="sub">What people type into YouTube around this topic. Narrower phrases are often easier to win.</p>
          <div className="chips">{rep.suggestions!.map((s) => <a key={s} className="chip" href={analyzeLink(s)}><Icon name="search" />{s}</a>)}</div>
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
  const tabs: [PbTab, string][] = [["titles", "Titles"], ["desc", "Description"], ["tags", "Tags & hashtags"], ["ctr", "Click-through"], ["watch", "Watch time"], ["shorts", "Shorts"], ["meta", "Metadata tips"]];
  return (
    <div className="card">
      <div className="card-head">
        <div><h3><Icon name="wand" /> Upload playbook</h3>
          <p className="sub">Metadata and best practices built from what the winning videos for “{rep.keyword}” do. Copy, then adapt to your own angle.</p></div>
        <a className="btn sm" href={`#/optimizer?scan=${rep.scan_id ?? ""}&kw=${encodeURIComponent(rep.keyword)}`}><Icon name="check" />Check my draft</a>
      </div>
      <div className="grid g3" style={{ marginBottom: 16 }}>
        <div className="subscore"><div className="name">Target length</div><div className="val" style={{ marginTop: 6 }}>{L.long ? `${L.long.low_min}–${L.long.high_min} min` : "–"}</div>
          <p style={{ marginTop: 6 }}>{L.long ? `Median of ${L.long.n} winning long videos: ${L.long.median_min} min` : "Not enough long-form data"}</p></div>
        <div className="subscore"><div className="name">Shorts length</div><div className="val" style={{ marginTop: 6 }}>{L.short ? `~${L.short.median_s}s` : "20–45s"}</div>
          <p style={{ marginTop: 6 }}>{L.short ? `Median of ${L.short.n} Shorts in the results` : "Typical sweet spot"}</p></div>
        <div className="subscore"><div className="name">Title length</div><div className="val" style={{ marginTop: 6 }}>40–60 chars</div>
          <p style={{ marginTop: 6 }}>Winners here average {pb.title_length.avg ?? "–"} characters</p></div>
      </div>
      <div className="tabs">{tabs.map(([k, l]) => <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab === "titles" && <>
        <div className="list">{pb.titles.map((x) => (
          <div key={x} className="list-row"><div className="grow" style={{ fontWeight: 600 }}>{x}</div>
            <span className="small" style={{ color: x.length > 60 ? "var(--warn)" : "var(--muted)" }}>{x.length} chars</span>
            <CopyButton text={x} what="Title copied" /></div>
        ))}</div>
        <h3 style={{ marginTop: 18 }}>Patterns in winning titles</h3><p className="sub">Share of the top and breakout titles for this topic that use each pattern</p>
        <div className="stack" style={{ gap: 8 }}>{pb.title_patterns.slice(0, 6).map((p) => (
          <div key={p.key} className="row" style={{ flexWrap: "nowrap" }}>
            <span className="small" style={{ width: 280, flex: "none" }}>{p.label}</span>
            <div className="meter" style={{ flex: 1, height: 8 }}><i style={{ width: `${p.share * 100}%`, background: "var(--s-small)" }} /></div>
            <b className="small" style={{ width: 42, textAlign: "right" }}>{Math.round(p.share * 100)}%</b>
          </div>
        ))}</div>
      </>}
      {tab === "desc" && <>
        <textarea className="input mono" style={{ width: "100%", minHeight: 330, fontSize: 12.5 }} value={desc} onChange={(e) => setDesc(e.target.value)} />
        <div className="row" style={{ marginTop: 10, justifyContent: "space-between" }}>
          <span className="small muted">Replace the [bracketed] parts. Adjust chapter times to your edit.</span>
          <CopyButton className="btn sm" text={() => desc} what="Description copied" label="Copy description" />
        </div>
      </>}
      {tab === "tags" && <>
        <h3>Tags <span className="muted small">({pb.tags_chars}/500 characters)</span></h3>
        <div className="chips" style={{ margin: "8px 0 10px" }}>{pb.tags.map((x) => <span key={x} className="chip">{x}</span>)}</div>
        <CopyButton className="btn sm" text={pb.tags.join(", ")} what="Tags copied" label="Copy tags" />
        <h3 style={{ marginTop: 20 }}>Hashtags</h3><p className="sub">Up to 3 appear above your title. Put them at the end of the description.</p>
        <div className="chips" style={{ marginBottom: 10 }}>{pb.hashtags.map((x) => <span key={x} className="chip"><b>{x}</b></span>)}</div>
        <CopyButton className="btn sm" text={pb.hashtags.join(" ")} what="Hashtags copied" label="Copy hashtags" />
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
      <div className="grid g2" style={{ marginTop: 16 }}>
        <div className="stack" style={{ gap: 12 }}>
          <div><h3>Title options</h3><div className="list">{md.title_options.map((x) => (
            <div key={x} className="list-row"><div className="grow" style={{ fontWeight: 600 }}>{x}</div><span className="small muted">{x.length}</span><CopyButton text={x} what="Title copied" /></div>
          ))}</div></div>
          <div><h3>Thumbnail concepts</h3><ul className="small t2">{md.thumbnail_concepts.map((x) => <li key={x}>{x}</li>)}</ul></div>
          <div><h3>Tags</h3><div className="chips" style={{ margin: "6px 0 8px" }}>{md.tags.map((x) => <span key={x} className="chip">{x}</span>)}</div>
            <div className="row"><CopyButton className="btn sm" text={md.tags.join(", ")} what="Tags copied" label="Copy tags" />
              {md.hashtags.map((x) => <span key={x} className="chip"><b>{x}</b></span>)}</div></div>
          <div><h3>Pinned comment</h3><div className="small t2">{md.pinned_comment}</div></div>
        </div>
        <div><h3>Description</h3>
          <textarea className="input mono" style={{ width: "100%", minHeight: 280, fontSize: 12.5, marginTop: 6 }} value={desc} onChange={(e) => setDesc(e.target.value)} />
          <div style={{ marginTop: 8 }}><CopyButton className="btn sm" text={() => desc} what="Description copied" label="Copy description" /></div></div>
      </div>
      {plan && (
        <div className="card" style={{ marginTop: 16, boxShadow: "none", background: "var(--panel-2)" }}>
          <h3><Icon name="clock" /> Retention plan · {plan.target_length}</h3>
          <p className="small" style={{ margin: "8px 0" }}><b>Hook (first 15s):</b> <span className="t2" style={{ fontStyle: "italic" }}>“{plan.hook_script}”</span></p>
          <div className="grid g2">
            <div><h3 style={{ fontSize: 13 }}>Structure</h3><ol className="small t2" style={{ paddingLeft: 18 }}>{plan.outline.map((x) => <li key={x}>{x}</li>)}</ol></div>
            <div><h3 style={{ fontSize: 13 }}>Watch-time tips</h3><ul className="small t2" style={{ paddingLeft: 18 }}>{plan.tips.map((x) => <li key={x}>{x}</li>)}</ul></div>
          </div>
        </div>
      )}
    </>
  );
}

function AIPanel({ ai }: { ai: AIAngles }) {
  const { modal } = useApp();
  return (
    <div className="card">
      <div className="card-head"><div><h3><Icon name="sparkle" /> AI angles for a small channel</h3><p className="sub">{ai.summary}</p></div></div>
      <div className="grid g2">
        {ai.angles.map((a, i) => (
          <div key={i} className="ai-angle">
            <h4><span className="score-pill good">{i + 1}</span>{a.angle} <FormatBadge format={a.format === "short" ? "short" : "long"} />{a.format === "both" && <FormatBadge format="short" />}</h4>
            <div className="small t2">{a.why_it_can_win}</div>
            <ul className="small">{a.titles.map((x) => <li key={x}>{x}</li>)}</ul>
            <div className="small hook">Hook: “{a.hook}”</div>
            <div className="row"><span className="small muted">Thumbnail text:</span><span className="badge neutral">{a.thumbnail_text}</span>
              <button className="btn sm ghost" style={{ marginLeft: "auto" }} onClick={() => ideaModal(modal, {
                title: a.titles[0] || a.angle, keyword: a.angle, format: a.format,
                notes: `Angle: ${a.angle}\nWhy: ${a.why_it_can_win}\nHook: ${a.hook}\nThumbnail: ${a.thumbnail_text}\nTitles:\n${a.titles.map((x) => "• " + x).join("\n")}`,
              })}><Icon name="bookmark" />Save</button></div>
          </div>
        ))}
      </div>
      <div className="grid g3" style={{ marginTop: 16 }}>
        <div><h3>Don't copy these</h3><ul className="small t2">{ai.avoid.map((x) => <li key={x}>{x}</li>)}</ul></div>
        <div><h3>Shorts ideas</h3><ul className="small t2">{ai.shorts_ideas.map((x) => <li key={x}>{x}</li>)}</ul></div>
        <div><h3>Research next</h3><div className="chips">{ai.keywords_to_research.map((k) => <a key={k} className="chip" href={analyzeLink(k)}>{k}</a>)}</div></div>
      </div>
      {ai.metadata && <><h3 style={{ marginTop: 20, fontSize: 16 }}><Icon name="wand" /> Ready-to-paste metadata for the strongest angle</h3><MetadataBlock md={ai.metadata} plan={ai.retention_plan} /></>}
    </div>
  );
}
