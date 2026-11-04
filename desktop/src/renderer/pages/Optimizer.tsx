import { useEffect, useRef, useState } from "react";
import type { AIMetadata, DraftCheck, Playbook, RetentionPlan } from "../../core/types";
import { call } from "../api";
import { factCheckDialog, scriptDialog, translateDialog } from "../components/ClaudeHelpers";
import { Button, Card, Dialog, Menu, StateCard, Tag } from "../components/kit";
import { Empty, Loading, PageHead, Reasons, type Route, ScorePill, useApp, useCopyForClaude } from "../components/ui";
import { store } from "../format";
import { MetadataBlock } from "./Analyze";

interface DraftForm { keyword: string; title: string; description: string; tags: string; format: "long" | "short"; minutes: string }
interface CheckResult { score: number; checks: DraftCheck[]; playbook: Playbook | null; report: { keyword: string; score: number; verdict: string } | null }

/** Check status → list item style (pass is good, fail is bad, warn is a warning, info is a tip). */
const KIND: Record<DraftCheck["status"], "good" | "bad" | "warn" | "info"> = { pass: "good", fail: "bad", warn: "warn", info: "info" };

export function OptimizerPage({ route }: { route: Route }) {
  const { status, fail, modal } = useApp();
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
    const v = e.target.value;
    setF((prev) => {
      const next = { ...prev, [k]: v } as DraftForm;
      clearTimeout(timer.current);
      timer.current = setTimeout(() => store("draft", next), 400);
      return next;
    });
  };
  const check = async (x = f) => {
    try { setResult(await call("optimizeCheck", draft(x))); } catch (e) { fail(e, "The draft couldn’t be checked"); }
  };
  useEffect(() => { if (f.title || f.description) check(); }, []); // eslint-disable-line

  const copyForClaude = useCopyForClaude();
  const rewrite = async () => {
    if (!status?.has_ai_key) {
      modal((close) => (
        <Dialog title="Rewrite with Claude" desc="Claude reviews your draft for click-through and watch time, then rewrites the title, description and tags."
          footer={<>
            <Button onClick={close}>Cancel</Button>
            {status?.desktop && <Button href="#/settings" onClick={close}>Add an API key…</Button>}
            <Button variant="primary" icon="copy" onClick={() => { close(); copyForClaude(() => call("aiDraftPrompt", draft())); }}>Copy for Claude.ai</Button>
          </>}>
          <p className="t2" style={{ margin: 0 }}><b>With a Claude plan</b> (Pro, Max or Team): copy the request, then paste it into the Claude chat that opens. No API key needed.</p>
          <p className="secondary" style={{ margin: 0 }}>With an Anthropic API key, the rewrite appears here instead. The API is billed separately from Claude plans.</p>
        </Dialog>
      ));
      return;
    }
    setAI({ loading: true });
    try { setAI({ data: await call("aiMetadata", draft()) }); } catch (e) { setAI({}); fail(e, "The draft couldn’t be rewritten"); }
  };

  const groups = result ? [...new Set(result.checks.map((c) => c.group))] : [];
  const problems = result ? result.checks.filter((c) => c.status === "fail" || c.status === "warn").length : 0;
  const summary = result && (result.score >= 85
    ? { tone: "ok" as const, title: "Ready to upload", text: "Nothing important is missing." }
    : result.score >= 55
      ? { tone: "warn" as const, title: `${problems} ${problems === 1 ? "fix" : "fixes"} suggested`, text: "Work through the items marked below, then check again." }
      : { tone: "danger" as const, title: "Needs work before upload", text: `${problems} ${problems === 1 ? "item needs" : "items need"} attention.` });

  return (
    <>
      <PageHead title="Upload optimizer" desc={`Check a draft title, description and tags against what helps click-through and watch time${f.keyword ? ", and against what ranks for your topic" : ""}.`}>
        <Menu label="More with Claude" text="Claude.ai tools" icon="sparkle" items={[
          { label: "Write a script…", icon: "script", onSelect: () => scriptDialog(modal, { topic: f.keyword || f.title, title: f.title, format: f.format, scan_id: scanId }) },
          { label: "Translate title and description…", icon: "translate", onSelect: () => translateDialog(modal, { title: f.title, description: f.description, tags: f.tags }) },
          { label: "Fact-check a script…", icon: "shield", onSelect: () => factCheckDialog(modal, f.keyword || f.title) },
        ]} />
        <Button icon="wand" busy={ai.loading} onClick={rewrite}>Rewrite with Claude</Button>
        <Button variant="primary" icon="check" onClick={() => check()}>Check draft</Button>
      </PageHead>
      <div className="grid g-report">
        <Card>
          <form className="stack" autoComplete="off" onSubmit={(e) => { e.preventDefault(); check(); }}>
            <div className="form-row">
              <label className="field">Target keyword<input className="input" value={f.keyword} onChange={set("keyword")} placeholder="What viewers search for" /></label>
              <label className="field">Format<select className="select" value={f.format} onChange={set("format")}><option value="long">Long-form</option><option value="short">Short</option></select></label>
              <label className="field"><span>Length <span className="hint">minutes</span></span><input className="input" type="number" step="any" min="0" value={f.minutes} onChange={set("minutes")} /></label>
            </div>
            <label className="field"><span>Title <span className="hint">{f.title.length ? `${f.title.length} of 100 characters · 40–60 works best` : ""}</span></span>
              <input className="input" maxLength={100} value={f.title} onChange={set("title")} placeholder="Your draft title" /></label>
            <label className="field">Description<textarea className="input" rows={9} value={f.description} onChange={set("description")} placeholder="Your draft description" /></label>
            <label className="field"><span>Tags <span className="hint">separate with commas</span></span><input className="input" value={f.tags} onChange={set("tags")} /></label>
            <p className="secondary" style={{ margin: 0 }}>Your draft is kept on this computer until you change it.</p>
          </form>
        </Card>
        <div className="stack">
          {!result ? <Empty icon="wand" title="No draft checked yet">Fill in what you have so far and choose Check draft. You’ll get a score and specific fixes.</Empty> : <>
            <Card>
              <div className="row nowrap">
                <ScorePill score={result.score} big />
                <div className="grow"><h2 className="h2">Draft score</h2><div className="secondary">{result.report ? `Compared with your analysis of “${result.report.keyword}”.`
                  : "General checks only. Analyze the keyword to compare with what ranks."}</div></div>
              </div>
              {summary && <div className="mt"><StateCard tone={summary.tone} title={summary.title}>{summary.text}</StateCard></div>}
              {groups.map((g) => (
                <div key={g}>
                  <span className="section-label">{g}</span>
                  <Reasons items={result.checks.filter((c) => c.group === g).map((c) => ({ type: KIND[c.status], text: c.text, fix: c.fix }))} />
                </div>
              ))}
            </Card>
            {result.playbook && (
              <Card title="Title ideas for this topic" sub="Choose one to try it in your draft.">
                <div className="chips">
                  {result.playbook.titles.slice(0, 4).map((t) => (
                    <button key={t} className="chip" onClick={() => { const next = { ...f, title: t }; setF(next); check(next); }}>{t}</button>
                  ))}
                </div>
              </Card>
            )}
          </>}
        </div>
      </div>
      {ai.loading && <div className="mt"><Loading title="Rewriting your draft" rows={5} /></div>}
      {ai.data && (
        <Card className="mt" title="Review and rewrite" actions={<Tag>Written by Claude</Tag>}>
          <Reasons items={ai.data.feedback.map((x) => ({ type: "info" as const, text: x }))} />
          <div className="sep" />
          <MetadataBlock md={ai.data.metadata} plan={ai.data.retention_plan} />
        </Card>
      )}
    </>
  );
}
