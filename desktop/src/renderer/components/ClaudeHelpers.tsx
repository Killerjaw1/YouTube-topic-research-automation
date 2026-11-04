/**
 * Claude.ai helpers: dialogs that build a request (Shorts script, translations, fact-check) and copy it for a
 * Claude.ai chat. They need no API key, so they work with a Claude plan.
 */

import { type ReactNode, useState } from "react";
import { call } from "../api";
import { store } from "../format";
import { Button, Chip, Dialog, Segmented } from "./kit";
import { useCopyForClaude } from "./ui";

type ModalFn = (render: (close: () => void) => ReactNode, wide?: boolean) => void;

export interface ScriptSeed { topic: string; title?: string; format?: "short" | "long"; scan_id?: number | null; notes?: string }

export function scriptDialog(modal: ModalFn, seed: ScriptSeed) { modal((close) => <ScriptForm seed={seed} close={close} />); }
export function translateDialog(modal: ModalFn, draft: { title: string; description: string; tags: string }) { modal((close) => <TranslateForm draft={draft} close={close} />); }
export function factCheckDialog(modal: ModalFn, topic: string) { modal((close) => <FactCheckForm topic={topic} close={close} />, true); }

const Note = () => <p className="secondary" style={{ margin: 0 }}>Copies a ready-made request and opens a new Claude.ai chat. Paste it with Ctrl+V and send. Works with a Claude plan; no API key needed.</p>;

function ScriptForm({ seed, close }: { seed: ScriptSeed; close(): void }) {
  const copy = useCopyForClaude();
  const [f, setF] = useState({ topic: seed.topic, title: seed.title ?? "", format: seed.format ?? store<"short" | "long">("script-format") ?? "short", seconds: "", notes: seed.notes ?? "" });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => { const v = e.target.value; setF((p) => ({ ...p, [k]: v })); };
  const go = () => {
    store("script-format", f.format);
    close();
    copy(() => call("aiScriptPrompt", { topic: f.topic, title: f.title, format: f.format, seconds: Number(f.seconds) || undefined, notes: f.notes, scan_id: seed.scan_id ?? null }));
  };
  return (
    <Dialog title="Write a script with Claude" desc="Claude writes the script with a hook, payoff and loop ending, in the style of your best openings from the opening library."
      footer={<><Button onClick={close}>Cancel</Button><Button variant="primary" icon="copy" disabled={!f.topic.trim()} onClick={go}>Copy for Claude.ai</Button></>}>
      <label className="field">Topic<input className="input" autoFocus value={f.topic} onChange={set("topic")} placeholder="Why Pac-Man’s ghosts move differently" /></label>
      <label className="field">Working title <input className="input" value={f.title} onChange={set("title")} placeholder="Optional" /></label>
      <div className="row">
        <Segmented label="Format" value={f.format} onChange={(v) => setF((p) => ({ ...p, format: v }))} options={[["short", "Short"], ["long", "Long video"]]} />
        <label className="row secondary" style={{ gap: 6 }}>Length
          <input className="input" type="number" min={5} step="any" style={{ width: 90 }} value={f.seconds} onChange={set("seconds")} placeholder={f.format === "short" ? "45" : "600"} aria-label="Length in seconds" />seconds</label>
      </div>
      <label className="field">Notes<textarea className="input" rows={3} value={f.notes} onChange={set("notes")} placeholder="Facts you want in it, the angle, anything to avoid" /></label>
      <Note />
    </Dialog>
  );
}

const LANGUAGES = ["Spanish", "Portuguese", "Hindi", "Indonesian", "German", "French", "Arabic", "Japanese", "Korean", "Russian", "Turkish", "Vietnamese", "Filipino", "Italian", "Polish", "Bengali"];

function TranslateForm({ draft, close }: { draft: { title: string; description: string; tags: string }; close(): void }) {
  const copy = useCopyForClaude();
  const [picked, setPicked] = useState<string[]>(store<string[]>("languages") ?? ["Spanish", "Portuguese", "Hindi"]);
  const toggle = (l: string) => setPicked((p) => (p.includes(l) ? p.filter((x) => x !== l) : [...p, l]));
  const go = () => { store("languages", picked); close(); copy(() => call("aiTranslatePrompt", draft, picked)); };
  return (
    <Dialog title="Translate title and description" desc="Add the translations in YouTube Studio, under Languages. Each viewer then sees the title in their own language."
      footer={<><Button onClick={close}>Cancel</Button><Button variant="primary" icon="copy" disabled={!picked.length || (!draft.title.trim() && !draft.description.trim())} onClick={go}>Copy for Claude.ai</Button></>}>
      <div>
        <span className="section-label" style={{ marginTop: 0 }}>Languages · {picked.length} selected</span>
        <div className="chips">{LANGUAGES.map((l) => <Chip key={l} pressed={picked.includes(l)} onClick={() => toggle(l)}>{l}</Chip>)}</div>
      </div>
      {!draft.title.trim() && !draft.description.trim() && <p className="t2" style={{ margin: 0 }}>Add a title or description to the draft first.</p>}
      <p className="secondary" style={{ margin: 0 }}>Tip: the Audience tab in Analytics shows which countries your viewers come from.</p>
      <Note />
    </Dialog>
  );
}

function FactCheckForm({ topic, close }: { topic: string; close(): void }) {
  const copy = useCopyForClaude();
  const [script, setScript] = useState(store<string>("factcheck-script") ?? "");
  const go = () => { store("factcheck-script", script); close(); copy(() => call("aiFactCheckPrompt", script, topic)); };
  return (
    <Dialog title="Fact-check a script" desc="Claude checks each claim, suggests corrected lines and lists sources to verify the key facts."
      footer={<><Button onClick={close}>Cancel</Button><Button variant="primary" icon="copy" disabled={!script.trim()} onClick={go}>Copy for Claude.ai</Button></>}>
      <label className="field">Script<textarea className="input" rows={12} autoFocus value={script} onChange={(e) => setScript(e.target.value)} placeholder="Paste your script here" /></label>
      <Note />
    </Dialog>
  );
}
