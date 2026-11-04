import { useEffect, useMemo, useState } from "react";
import type { AIAngles, AIMetadata, Focus, Report, RetentionPlan, VideoRow } from "../../core/types";
import { call, exportPdf, openExternal, saveFile } from "../api";
import { ScoreRing, Scatter } from "../components/charts";
import { Icon } from "../components/Icon";
import { scriptDialog } from "../components/ClaudeHelpers";
import { ideaModal } from "../components/IdeaModal";
import { Button, Card, ChipGroup, Dialog, Menu, Segmented, Tag } from "../components/kit";
import {
  analyzeLink, Checklist, CopyButton, DemoBanner, useCopyForClaude, Empty, FormatBadge, go, Loading, PageHead, Reasons, type Route, SearchBox, useApp, Verdict,
} from "../components/ui";
import { VideoTable } from "../components/VideoTable";
import { ago, fmt, store, tone } from "../format";
import { OutlierGrid } from "./Outliers";

/** Navigate to an analysis; if we're already on that exact URL, run it again in place. */
function runFromUrl(q: string, depth: string, focus: Focus, rerun: () => void) {
  const target = analyzeLink(q, depth, focus);
  if (location.hash === target) rerun();
  else go(target);
}

export function scoringHelp(modal: ReturnType<typeof useApp>["modal"]) {
  modal((close) => (
    <Dialog title="How the opportunity score works" desc="It reflects how likely a new upload from a small channel is to be found for this topic."
      footer={<Button variant="primary" onClick={close}>Done</Button>}>
      <p className="t2" style={{ margin: 0 }}>NicheRadar reads the top 50 search results, checks how big each channel is and how its video did, then combines four signals into a score from 0 to 100.</p>
      <div className="list">
        {[["Demand", "30%", "How many views a day the top results get."],
          ["Breakout", "30%", "Whether small channels rank, and how far their videos beat their subscriber count."],
          ["Openness", "25%", "How little of the top 10 large channels hold, weighted by position."],
          ["Freshness", "15%", "Whether recent uploads rank, or the top videos are old while demand is high."]].map(([k, w, d]) => (
          <div key={k} className="list-row" style={{ paddingLeft: 0, paddingRight: 0 }}>
            <div className="body"><div className="title">{k}</div><div className="secondary">{d}</div></div><span className="tag">{w}</span>
          </div>
        ))}
      </div>
      <p className="secondary" style={{ margin: 0 }}>Topics with very little demand can’t score above 38, and topics held entirely by large channels can’t score above 45. 70 and above is strong, 55–69 good, 40–54 needs a distinct angle.</p>
    </Dialog>
  ));
}

const FOCUS_LABEL: Record<Focus, string> = { all: "All videos", short: "Shorts only", long: "Long-form only" };

/** The format to score against: the link's, then the last one chosen, then Shorts for channels that mostly post Shorts. */
function initialFocus(param: string | null, shortsShare?: number): Focus {
  if (param === "short" || param === "long" || param === "all") return param;
  const saved = store<Focus>("focus");
  if (saved) return saved;
  return shortsShare != null && shortsShare >= 0.6 ? "short" : "all";
}

export function AnalyzePage({ route }: { route: Route }) {
  const { refresh, modal, status } = useApp();
  const q = route.params.get("q") ?? "";
  const [depth, setDepth] = useState<"quick" | "deep">((route.params.get("depth") as any) || store<"quick" | "deep">("depth") || "quick");
  const [focus, setFocus] = useState<Focus>(() => initialFocus(route.params.get("focus"), status?.my_channel?.shorts_share));
  const [state, setState] = useState<{ loading?: boolean; report?: Report; error?: string }>({});
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!q || !route.params.get("run")) return;
    let live = true;
    setState({ loading: true });
    call("analyze", q, depth, focus)
      .then((report) => { if (live) { setState({ report }); refresh(); } })
      .catch((e) => live && setState({ error: e.message }));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, nonce]);

  return (
    <>
      <PageHead title="Analyze topic" desc="See who ranks for a topic today and whether a small channel can compete.">
        <Button variant="ghost" icon="info" onClick={() => scoringHelp(modal)}>How scoring works</Button>
      </PageHead>
      <DemoBanner />
      <Card className="search-card mb">
        <SearchBox value={q} autoFocus={!q} onSubmit={(kw) => runFromUrl(kw, depth, focus, () => setNonce((n) => n + 1))} />
        <div className="row mt-sm">
          <Segmented label="Scan depth" value={depth} onChange={(d) => { setDepth(d); store("depth", d); }} options={[["quick", "Standard"], ["deep", "Deep"]]} />
          <Segmented label="Compare with" value={focus} onChange={(f) => { setFocus(f); store("focus", f); }} options={[["all", "All videos"], ["short", "Shorts"], ["long", "Long-form"]]} />
          <span className="secondary">{depth === "deep" ? "About 204 quota units. Also looks at the most-viewed uploads from the last 90 days." : "About 102 quota units. Looks at the top 50 search results."}
            {focus === "short" ? " Scores against Shorts only." : focus === "long" ? " Scores against long-form videos only." : ""}</span>
        </div>
      </Card>
      {state.loading && <Loading title="Analyzing" rows={6} steps={[`Searching YouTube for “${q}”`, depth === "deep" ? "Collecting recent top uploads" : "Collecting video statistics",
        "Checking channel sizes", "Scoring the topic and building your upload playbook"]} />}
      {state.error && (
        <Empty icon="warn" title="This topic couldn’t be analyzed" actions={/key/i.test(state.error) ? <Button variant="primary" href="#/settings">Open settings</Button> : <Button onClick={() => setNonce((n) => n + 1)}>Try again</Button>}>{state.error}</Empty>
      )}
      {state.report && <ReportView report={state.report} />}
      {!q && !state.loading && (
        <Empty icon="target" title="Enter a topic to analyze">You’ll see who ranks for it, whether small channels break through, which format does better, and titles, tags and a description to upload with.</Empty>
      )}
    </>
  );
}

export function ReportPage({ id }: { id: number }) {
  const [scan, setScan] = useState<{ kind: string; payload: any } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { call("getScan", id).then(setScan).catch((e) => setError(e.message)); }, [id]);
  if (error) return <Empty icon="warn" title="This report isn’t available" actions={<Button variant="primary" href="#/history">Go to history</Button>}>{error}</Empty>;
  if (!scan) return <Loading title="Opening report" />;
  if (scan.kind === "outliers") return <><PageHead title="Outlier search" desc={`Saved results for “${scan.payload.keyword}”.`}><Button href="#/history" icon="arrowLeft">History</Button></PageHead><OutlierGrid data={scan.payload} /></>;
  const rep: Report = { ...scan.payload, scan_id: id };
  return (
    <>
      <PageHead title="Topic report" desc={`Saved ${rep.created ? ago(rep.created, true) : ""}. Opening a saved report uses no quota.`}>
        <Button href="#/history" icon="arrowLeft">History</Button>
        <Button href={analyzeLink(rep.keyword, rep.depth, rep.focus)} icon="refresh">Run again</Button>
      </PageHead>
      <ReportView report={rep} />
    </>
  );
}

const SUB_INFO: [keyof Report["subscores"], string, string][] = [
  ["demand", "Demand", "Views a day on the top results"],
  ["breakout", "Breakout", "Small channels ranking and outperforming"],
  ["openness", "Openness", "Room not held by large channels"],
  ["freshness", "Freshness", "Recent uploads ranking, or a content gap"],
];

type VFilter = "all" | "small" | "breakout" | "big" | "short" | "long";

function ReportView({ report: rep }: { report: Report }) {
  const { status, modal, fail, toast, refresh } = useApp();
  const [ai, setAI] = useState<AIAngles | undefined>(rep.ai);
  const [aiLoading, setAILoading] = useState(false);
  const [vf, setVF] = useState<VFilter>("all");
  const [tracked, setTracked] = useState(false);
  useEffect(() => { call("listTracked").then((t) => setTracked(t.some((x) => x.keyword === rep.keyword.toLowerCase()))).catch(() => undefined); }, [rep.keyword]);
  const f = rep.formats, rec = f.recommended ?? { format: "either", why: "" };
  const focused = rep.focus === "short" || rep.focus === "long";
  const m = rep.metrics, th = rep.thresholds;
  const all = useMemo(() => {
    const seen = new Set<string>();
    // Recent uploads that aren't in the main search results have no search rank of their own.
    const recent = rep.recent.map((v) => ({ ...v, rank: null }));
    return [...rep.videos, ...recent].filter((v) => (seen.has(v.id) ? false : (seen.add(v.id), true)));
  }, [rep]);
  const match = (k: VFilter) => (v: VideoRow) =>
    k === "all" || (k === "breakout" ? Boolean(v.breakout) : k === "short" || k === "long" ? v.format === k : v.size === k);
  const filter = useMemo(() => match(vf), [vf]); // eslint-disable-line react-hooks/exhaustive-deps
  const counts = useMemo(() => Object.fromEntries((["all", "small", "breakout", "big", "short", "long"] as VFilter[]).map((k) => [k, all.filter(match(k)).length])), [all]); // eslint-disable-line

  const toggleTrack = async () => {
    try {
      if (tracked) { await call("untrack", rep.keyword); toast("Removed from your watchlist"); }
      else { await call("track", rep.keyword, rep.scan_id ?? null); toast("Added to your watchlist", "ok", "Re-score it there to see how the opportunity changes."); }
      setTracked(!tracked);
      refresh();
    } catch (e) { fail(e); }
  };
  const copyForClaude = useCopyForClaude();
  const copyAngles = () => copyForClaude(() => call("aiPrompt", rep.scan_id!));
  const runAI = async () => {
    if (!status?.has_ai_key) {
      modal((close) => (
        <Dialog title="Suggest angles with Claude" desc="Claude reads this report and proposes angles, upload metadata and a plan for keeping viewers watching."
          footer={<>
            <Button onClick={close}>Cancel</Button>
            {status?.desktop && <Button href="#/settings" onClick={close}>Add an API key…</Button>}
            <Button variant="primary" icon="copy" disabled={!rep.scan_id} onClick={() => { close(); copyAngles(); }}>Copy for Claude.ai</Button>
          </>}>
          <p className="t2" style={{ margin: 0 }}><b>With a Claude plan</b> (Pro, Max or Team): copy the request, then paste it into the Claude chat that opens. No API key needed.</p>
          <p className="secondary" style={{ margin: 0 }}>With an Anthropic API key, the suggestions appear here in the report instead. The API is billed separately from Claude plans.</p>
        </Dialog>
      ));
      return;
    }
    setAILoading(true);
    try { setAI(await call("aiAngles", rep.scan_id!)); } catch (e) { fail(e, "Angles couldn’t be generated"); } finally { setAILoading(false); }
  };
  const exportCsv = async () => { try { const p = await saveFile(await call("scanCsv", rep.scan_id!)); if (p) toast("Results exported", "ok", p); } catch (e) { fail(e, "Export didn’t finish"); } };
  const exportReport = async () => {
    try { const p = await exportPdf(`NicheRadar - ${rep.keyword.replace(/[^\w -]+/g, "")}.pdf`); if (p) toast("Report saved as PDF", "ok", p); } catch (e) { fail(e, "The PDF couldn’t be saved"); }
  };

  return (
    <div className="stack">
      <Card>
        <div className="report-head">
          <ScoreRing score={rep.score} />
          <div style={{ minWidth: 0 }}>
            <span className="label">Opportunity score</span>
            <h2 className="report-title">{rep.keyword}</h2>
            <Verdict tone={rep.tone}>{rep.verdict}</Verdict>
            <div className="report-meta">
              <span>{Number(m.results ?? 0)} results</span>
              <span>{rep.depth === "deep" ? "Deep scan" : "Standard scan"}</span>
              {rep.focus && rep.focus !== "all" && <span>{FOCUS_LABEL[rep.focus]}</span>}
              <span>Small means under {fmt(th.small_max)} subscribers</span>
              {rep.quota_cost != null && !rep.demo && <span>{rep.quota_cost ? `${rep.quota_cost} quota units` : "From cache, no quota used"}</span>}
              {rep.created && <span>{ago(rep.created)}</span>}
              {rep.demo && <Tag tone="warn">Sample data</Tag>}
            </div>
          </div>
          <div className="report-actions">
            <Button icon="eye" pressed={tracked} onClick={toggleTrack}>{tracked ? "Tracking" : "Track"}</Button>
            <Button icon="bookmark" onClick={() => ideaModal(modal, {
              title: rep.keyword, keyword: rep.keyword, score: rep.score, verdict: rep.verdict, format: rec.format, scan_id: rep.scan_id ?? null,
              notes: rep.reasons.filter((x) => x.type === "good").map((x) => "• " + x.text).join("\n"),
            })}>Save idea…</Button>
            <Menu label="Export and more" items={[
              ...(rep.scan_id ? [{ label: "Export results as CSV…", icon: "download" as const, onSelect: exportCsv }] : []),
              { label: "Save report as PDF…", icon: "file", onSelect: exportReport },
              ...(rep.scan_id ? [{ label: "Copy for Claude.ai", icon: "copy" as const, onSelect: copyAngles }] : []),
              { label: "Write a script…", icon: "script", onSelect: () => scriptDialog(modal, { topic: rep.keyword, format: rep.focus === "long" ? "long" : rep.focus === "short" ? "short" : (rec.format === "long" ? "long" : "short"), scan_id: rep.scan_id ?? null }) },
              "sep",
              { label: "Open search on YouTube", icon: "external", onSelect: () => openExternal(`https://www.youtube.com/results?search_query=${encodeURIComponent(rep.keyword)}`) },
            ]} />
            <Button variant="primary" icon="wand" busy={aiLoading} onClick={runAI}>Suggest angles</Button>
          </div>
        </div>
      </Card>

      <div className="subscores">
        {SUB_INFO.map(([k, name, desc]) => {
          const v = rep.subscores[k] ?? 0;
          return (
            <div key={k} className="subscore">
              <div className="top"><span className="name">{name}</span><span className="val">{v}</span></div>
              <div className="meter"><i className={tone(v)} style={{ width: `${v}%` }} /></div>
              <p>{desc}</p>
            </div>
          );
        })}
      </div>

      <div className="grid g-report">
        <Card title="Findings"><Reasons items={rep.reasons} /></Card>
        <Card title={focused ? (rep.focus === "short" ? "Shorts that rank" : "Long-form videos that rank") : "Recommended format"} sub={rec.why}>
          <div className={`format-cmp mt-sm ${focused ? "single" : ""}`}>
            {(focused ? [rep.focus as "short" | "long"] : (["short", "long"] as const)).map((k) => {
              const s = f[k];
              const win = !focused && (rec.format === k || rec.format === "both");
              return (
                <div key={k} className={win ? "win" : ""}>
                  <h4><Icon name={k === "short" ? "phone" : "play"} />{k === "short" ? "Shorts" : "Long-form"}{win && <Tag tone="ok">Recommended</Tag>}</h4>
                  <dl>
                    <dt>Videos</dt><dd>{s?.count ?? 0}</dd><dt>Median views/day</dt><dd>{fmt(s?.median_vpd)}</dd>
                    <dt>Median views</dt><dd>{fmt(s?.median_views)}</dd><dt>Breakouts</dt><dd>{s?.breakouts ?? 0}</dd>
                    <dt>From small channels</dt><dd>{Math.round((s?.small_share ?? 0) * 100)}%</dd>
                  </dl>
                </div>
              );
            })}
          </div>
          <p className="secondary mt-sm" style={{ marginBottom: 0 }}>Shorts are videos of 60 seconds or less, or up to 3 minutes when tagged #shorts.</p>
          {rep.title_words.length > 0 && <>
            <span className="section-label">Common words in top titles</span>
            <div className="chips">{rep.title_words.map((w) => <Tag key={w.word}>{w.word} · {w.count}</Tag>)}</div>
          </>}
        </Card>
      </div>

      <Card title="Channel size and views" sub="Each point is a ranking video. Points above the dashed line got more than 3× the channel’s subscribers in views, so YouTube showed them to new viewers.">
        <Scatter videos={all} smallMax={th.small_max} bigMin={th.big_min} />
      </Card>

      {rep.playbook && <Playbook rep={rep} />}

      {aiLoading && <Loading title="Suggesting angles" rows={5} steps={["Reading the ranking videos", "Comparing large-channel and breakout angles", "Writing metadata and a plan for watch time"]} />}
      {ai && !aiLoading && <AIPanel ai={ai} />}

      <Card flush title="Search results" sub={`Today’s top results${rep.recent.length ? " and the most-viewed recent uploads" : ""}. Select a video for details.`}>
        <div className="card-toolbar">
          <ChipGroup value={vf} onChange={setVF} counts={counts} options={[["all", "All"], ["small", "Small channels"], ["breakout", "Breakouts"], ["big", "Large channels"], ["short", "Shorts"], ["long", "Long-form"]]} />
        </div>
        <VideoTable videos={all} showRank filter={filter} />
      </Card>

      {(rep.suggestions ?? []).length > 0 && (
        <Card title="Related searches" sub="What people also search for. Narrower phrases are usually easier to rank for.">
          <div className="chips">{rep.suggestions!.map((s) => <a key={s} className="chip" href={analyzeLink(s)}>{s}</a>)}</div>
        </Card>
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
    <Card title="Upload playbook" sub="Titles, metadata and habits taken from the videos that rank and break out for this topic."
      actions={<Button href={`#/optimizer?scan=${rep.scan_id ?? ""}&kw=${encodeURIComponent(rep.keyword)}`} icon="arrowRight">Check a draft</Button>}>
      <div className="subscores-plain mb">
        <div className="subscore"><div className="name">Target length</div><div className="val mt-sm">{L.long ? `${L.long.low_min}–${L.long.high_min} min` : "–"}</div>
          <p className="mt-sm">{L.long ? `Middle range of ${L.long.n} winning videos (median ${L.long.median_min} min)` : "Not enough long-form videos to say"}</p></div>
        <div className="subscore"><div className="name">Shorts length</div><div className="val mt-sm">{L.short ? `${L.short.median_s}s` : "20–45s"}</div>
          <p className="mt-sm">{L.short ? `Median of ${L.short.n} Shorts in the results` : "Usual range"}</p></div>
        <div className="subscore"><div className="name">Title length</div><div className="val mt-sm">40–60 characters</div>
          <p className="mt-sm">Ranking titles here average {pb.title_length.avg ?? "–"}</p></div>
      </div>
      <div className="tabs" role="tablist">{tabs.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab === "titles" && <>
        <div className="list inset">{pb.titles.map((x) => (
          <div key={x} className="list-row" style={{ paddingLeft: 0, paddingRight: 0 }}><div className="body" style={{ fontWeight: 500 }}>{x}</div>
            <span className={`small tabular ${x.length > 60 ? "delta down" : "muted"}`} title="Characters">{x.length}</span>
            <CopyButton text={x} what="Title copied" /></div>
        ))}</div>
        <span className="section-label">Patterns in top titles</span>
        <div className="stack tight">{pb.title_patterns.slice(0, 6).map((p) => (
          <div key={p.key} className="row nowrap">
            <span className="small t2" style={{ width: 300, flex: "none" }}>{p.label[0].toUpperCase() + p.label.slice(1)}</span>
            <div className="meter grow"><i style={{ width: `${p.share * 100}%` }} /></div>
            <span className="small tabular right" style={{ width: 40 }}>{Math.round(p.share * 100)}%</span>
          </div>
        ))}</div>
      </>}
      {tab === "desc" && <>
        <textarea className="input mono" style={{ width: "100%", minHeight: 320, fontSize: "var(--fs-sm)" }} value={desc} onChange={(e) => setDesc(e.target.value)} spellCheck={false} aria-label="Description template" />
        <div className="row between mt-sm">
          <span className="secondary">Replace the text in brackets and adjust the chapter times to your edit.</span>
          <CopyButton text={() => desc} what="Description copied" label="Copy" />
        </div>
      </>}
      {tab === "tags" && <>
        <div className="row between"><span className="small t2">Tags · {pb.tags_chars} of 500 characters</span><CopyButton text={pb.tags.join(", ")} what="Tags copied" label="Copy tags" /></div>
        <div className="chips mt-sm mb">{pb.tags.map((x) => <Tag key={x}>{x}</Tag>)}</div>
        <div className="row between"><span className="small t2">Hashtags · shown above your title, so add them at the end of the description</span><CopyButton text={pb.hashtags.join(" ")} what="Hashtags copied" label="Copy hashtags" /></div>
        <div className="chips mt-sm">{pb.hashtags.map((x) => <Tag key={x} tone="accent">{x}</Tag>)}</div>
      </>}
      {tab === "ctr" && <Checklist items={pb.checklist.ctr} />}
      {tab === "watch" && <Checklist items={pb.checklist.watch_time} />}
      {tab === "shorts" && <Checklist items={pb.checklist.shorts} />}
      {tab === "meta" && <Checklist items={pb.checklist.metadata} />}
    </Card>
  );
}

// ------------------------------------------------------------------------ AI
export function MetadataBlock({ md, plan }: { md?: AIMetadata; plan?: RetentionPlan }) {
  const [desc, setDesc] = useState(md?.description ?? "");
  if (!md) return null;
  return (
    <>
      <div className="grid g2">
        <div>
          <span className="section-label">Titles</span>
          <div className="list inset">{md.title_options.map((x) => (
            <div key={x} className="list-row" style={{ paddingLeft: 0, paddingRight: 0 }}><div className="body" style={{ fontWeight: 500 }}>{x}</div><span className="small muted tabular">{x.length}</span><CopyButton text={x} what="Title copied" /></div>
          ))}</div>
          <span className="section-label">Thumbnail ideas</span>
          <ol className="steps-list">{md.thumbnail_concepts.map((x) => <li key={x}><span>{x}</span></li>)}</ol>
          <span className="section-label">Tags</span>
          <div className="chips mb-sm">{md.tags.map((x) => <Tag key={x}>{x}</Tag>)}{md.hashtags.map((x) => <Tag key={x} tone="accent">{x}</Tag>)}</div>
          <CopyButton text={md.tags.join(", ")} what="Tags copied" label="Copy tags" />
          <span className="section-label">Pinned comment</span>
          <div className="quote small">{md.pinned_comment}</div>
        </div>
        <div>
          <div className="row between"><span className="section-label" style={{ margin: 0 }}>Description</span><CopyButton text={() => desc} what="Description copied" label="Copy" /></div>
          <textarea className="input mono mt-sm" style={{ width: "100%", minHeight: 300, fontSize: "var(--fs-sm)" }} value={desc} onChange={(e) => setDesc(e.target.value)} spellCheck={false} aria-label="Description" />
        </div>
      </div>
      {plan && <>
        <div className="sep" />
        <div className="row between"><h2 className="h2">Plan for watch time</h2><Tag>{plan.target_length}</Tag></div>
        <span className="section-label">First 15 seconds</span>
        <div className="quote">{plan.hook_script}</div>
        <div className="grid g2">
          <div><span className="section-label">Structure</span><ol className="steps-list">{plan.outline.map((x) => <li key={x}><span>{x}</span></li>)}</ol></div>
          <div><span className="section-label">Keeping viewers watching</span><ol className="steps-list">{plan.tips.map((x) => <li key={x}><span>{x}</span></li>)}</ol></div>
        </div>
      </>}
    </>
  );
}

function AIPanel({ ai }: { ai: AIAngles }) {
  const { modal } = useApp();
  return (
    <Card title="Suggested angles" sub={ai.summary} actions={<Tag>Written by Claude</Tag>}>
      <div className="grid g2">
        {ai.angles.map((a, i) => (
          <div key={i} className="ai-angle">
            <h4><span className="idx">{i + 1}</span><span className="grow">{a.angle}</span><FormatBadge format={a.format} /></h4>
            <div className="small t2">{a.why_it_can_win}</div>
            <ul className="small">{a.titles.map((x) => <li key={x}>{x}</li>)}</ul>
            <div className="small"><span className="muted">Opening: </span><span className="t2">{a.hook}</span></div>
            <div className="row"><span className="secondary">Thumbnail text</span><Tag>{a.thumbnail_text}</Tag>
              <Button size="sm" variant="ghost" icon="bookmark" style={{ marginLeft: "auto" }} onClick={() => ideaModal(modal, {
                title: a.titles[0] || a.angle, keyword: a.angle, format: a.format,
                notes: `Angle: ${a.angle}\nWhy: ${a.why_it_can_win}\nOpening: ${a.hook}\nThumbnail: ${a.thumbnail_text}\nTitles:\n${a.titles.map((x) => "• " + x).join("\n")}`,
              })}>Save idea…</Button></div>
          </div>
        ))}
      </div>
      <div className="grid g3">
        <div><span className="section-label">Avoid</span><ol className="steps-list">{ai.avoid.map((x) => <li key={x}><span>{x}</span></li>)}</ol></div>
        <div><span className="section-label">Shorts ideas</span><ol className="steps-list">{ai.shorts_ideas.map((x) => <li key={x}><span>{x}</span></li>)}</ol></div>
        <div><span className="section-label">Research next</span><div className="chips">{ai.keywords_to_research.map((k) => <a key={k} className="chip" href={analyzeLink(k)}>{k}</a>)}</div></div>
      </div>
      {ai.metadata && <><div className="sep" /><h2 className="h2">Metadata for the strongest angle</h2><MetadataBlock md={ai.metadata} plan={ai.retention_plan} /></>}
    </Card>
  );
}
