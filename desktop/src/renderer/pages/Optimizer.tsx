import { useEffect, useRef, useState } from "react";
import type { AIMetadata, DraftCheck, Playbook, RetentionPlan } from "../../core/types";
import { call } from "../api";
import { Icon, type IconName } from "../components/Icon";
import { Empty, Loading, type Route, ScorePill, useApp } from "../components/ui";
import { store } from "../format";
import { MetadataBlock } from "./Analyze";

interface DraftForm { keyword: string; title: string; description: string; tags: string; format: "long" | "short"; minutes: string }
interface CheckResult { score: number; checks: DraftCheck[]; playbook: Playbook | null; report: { keyword: string; score: number; verdict: string } | null }

const ICON: Record<DraftCheck["status"], IconName> = { pass: "check", fail: "x", warn: "info", info: "info" };
const CLS: Record<DraftCheck["status"], string> = { pass: "good", fail: "bad", warn: "bad", info: "info" };

export function OptimizerPage({ route }: { route: Route }) {
  const { status, toast, fail } = useApp();
  const scanId = Number(route.params.get("scan")) || null;
  const saved = store<DraftForm>("draft");
  const [f, setF] = useState<DraftForm>({
    keyword: route.params.get("kw") ?? saved?.keyword ?? "", title: saved?.title ?? "", description: saved?.description ?? "",
    tags: saved?.tags ?? "", format: saved?.format ?? "long", minutes: saved?.minutes ?? "",
  });
  const [result, setResult] = useState<CheckResult | null>(null);
  const [ai, setAI] = useState<{ loading?: boolean; data?: { feedback: string[]; metadata: AIMetadata; retention_plan: RetentionPlan } }>({});
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const draft = (x = f) => ({ ...x, minutes: x.minutes ? Number(x.minutes) : null, scan_id: scanId });
  const set = (k: keyof DraftForm) => (e: { target: { value: string } }) => {
    const next = { ...f, [k]: e.target.value } as DraftForm;
    setF(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => store("draft", next), 400);
  };
  const check = async (x = f) => {
    try { setResult(await call("optimizeCheck", draft(x))); } catch (e) { fail(e); }
  };
  useEffect(() => { if (f.title || f.description) check(); }, []); // eslint-disable-line

  const rewrite = async () => {
    if (!status?.has_ai_key) return toast(status?.desktop ? "Add an Anthropic API key in Settings to use AI rewrites." : "AI rewrites are available in the desktop app.", "err");
    setAI({ loading: true });
    try { setAI({ data: await call("aiMetadata", draft()) }); } catch (e) { setAI({}); fail(e); }
  };

  const groups = result ? [...new Set(result.checks.map((c) => c.group))] : [];
  return (
    <>
      <p className="page-intro">Paste the title, description and tags you plan to upload. NicheRadar checks them against click-through and watch-time best practices
        {f.keyword ? " and against what wins for your topic" : " (analyze the topic first for topic-specific advice)"}.</p>
      <div className="grid g-report">
        <div className="card">
          <form className="stack" style={{ gap: 14 }} autoComplete="off" onSubmit={(e) => { e.preventDefault(); check(); }}>
            <div className="form-row">
              <label className="field">Target keyword<input className="input" value={f.keyword} onChange={set("keyword")} placeholder="what viewers search" /></label>
              <label className="field">Format<select className="select" value={f.format} onChange={set("format")}><option value="long">Long-form</option><option value="short">Short</option></select></label>
              <label className="field"><span>Length <span className="hint">(minutes)</span></span><input className="input" type="number" step="0.5" min="0" value={f.minutes} onChange={set("minutes")} /></label>
            </div>
            <label className="field"><span>Title <span className="hint">{f.title.length ? `${f.title.length}/100 · ideal 40–60` : ""}</span></span>
              <input className="input" maxLength={100} value={f.title} onChange={set("title")} placeholder="Your draft title" /></label>
            <label className="field">Description<textarea className="input" rows={9} value={f.description} onChange={set("description")} placeholder="Your draft description" /></label>
            <label className="field"><span>Tags <span className="hint">(comma separated)</span></span><input className="input" value={f.tags} onChange={set("tags")} /></label>
            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button type="button" className="btn" onClick={rewrite} disabled={ai.loading}><Icon name="sparkle" />AI rewrite</button>
              <button className="btn primary"><Icon name="check" />Check draft</button>
            </div>
          </form>
        </div>
        <div>
          {!result ? <Empty icon="wand" title="Draft checker">Fill in what you have and click Check draft. You'll get a score and specific fixes.</Empty> : (
            <div className="card">
              <div className="row" style={{ gap: 16, marginBottom: 14 }}>
                <ScorePill score={result.score} big />
                <div><h3>Draft score</h3><p className="sub" style={{ margin: 0 }}>{result.report ? `Compared with your research on “${result.report.keyword}” (opportunity ${result.report.score})`
                  : "General best practices (no topic report found for this keyword)"}</p></div>
              </div>
              {groups.map((g) => (
                <div key={g}>
                  <h3 style={{ fontSize: 13, margin: "14px 0 8px" }}>{g}</h3>
                  <ul className="reasons">{result.checks.filter((c) => c.group === g).map((c, i) => (
                    <li key={i} className={CLS[c.status]}><Icon name={ICON[c.status]} /><span>{c.text}{c.fix && <><br /><span className="small muted">{c.fix}</span></>}</span></li>
                  ))}</ul>
                </div>
              ))}
              {result.playbook && (
                <div className="row" style={{ marginTop: 14 }}><span className="small muted">Need ideas?</span>
                  {result.playbook.titles.slice(0, 3).map((t) => (
                    <button key={t} className="chip" onClick={() => { const next = { ...f, title: t }; setF(next); check(next); }}>{t}</button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {ai.loading && <div style={{ marginTop: 16 }}><Loading title="Claude is reviewing your draft…" /></div>}
      {ai.data && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3><Icon name="sparkle" /> AI review & rewrite</h3>
          <ul className="reasons" style={{ marginTop: 12 }}>{ai.data.feedback.map((x) => <li key={x} className="info"><Icon name="info" /><span>{x}</span></li>)}</ul>
          <MetadataBlock md={ai.data.metadata} plan={ai.data.retention_plan} />
        </div>
      )}
    </>
  );
}
