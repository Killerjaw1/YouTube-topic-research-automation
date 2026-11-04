import { type ReactNode, useEffect, useState } from "react";
import type { SimilarUpload } from "../../core/ideas";
import { type Idea, IDEA_STATUSES } from "../../core/types";
import { call } from "../api";
import { Button, Dialog, StateCard } from "./kit";
import { ScorePill, useApp } from "./ui";

/** Idea stages, each with a muted category colour used for its tag and column marker. */
export const STATUS_META: Record<string, [string, string]> = {
  idea: ["Ideas", "cat-1"], researching: ["Researching", "cat-4"], scripting: ["Scripting", "cat-2"],
  filming: ["Filming and editing", "cat-1"], uploaded: ["Uploaded", "cat-3"],
};

type ModalFn = (render: (close: () => void) => ReactNode) => void;

/** Your uploads that already cover `text` (checked after typing pauses; needs your channel in Settings). */
export function useAlreadyMade(text: string): SimilarUpload[] {
  const [items, setItems] = useState<SimilarUpload[]>([]);
  useEffect(() => {
    if (text.trim().length < 4) { setItems([]); return; }
    let live = true;
    const t = setTimeout(() => call("alreadyMade", text).then((r) => live && setItems(r)).catch(() => undefined), 600);
    return () => { live = false; clearTimeout(t); };
  }, [text]);
  return items;
}

export function AlreadyMade({ items }: { items: SimilarUpload[] }) {
  return (
    <StateCard tone="warn" icon="info" title={items.length === 1 ? "You’ve made a similar video" : `You’ve made ${items.length} similar videos`}>
      {items.map((v) => <div key={v.video}>“{v.title}” · {v.views.toLocaleString("en-US")} views</div>)}
      <div className="mt-sm">Make a follow-up or a clearly different angle, so the two videos don’t compete for the same viewers.</div>
    </StateCard>
  );
}

export function ideaModal(modal: ModalFn, data: Partial<Idea>, onSaved?: () => void) {
  modal((close) => <IdeaForm data={data} close={close} onSaved={onSaved} />);
}

/** The idea editor fields, shared by the dialog (new ideas) and the board's detail panel. */
export function IdeaFields({ f, set }: { f: IdeaDraft; set(k: keyof IdeaDraft): (e: { target: { value: string } }) => void }) {
  return (
    <>
      <label className="field">Working title<input className="input" autoFocus value={f.title} onChange={set("title")} maxLength={300} /></label>
      <div className="form-row">
        <label className="field">Search keyword<input className="input" value={f.keyword} onChange={set("keyword")} /></label>
        <label className="field">Format<select className="select" value={f.format} onChange={set("format")}>{[["long", "Long-form"], ["short", "Short"], ["both", "Both"], ["either", "Not decided"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label className="field">Stage<select className="select" value={f.status} onChange={set("status")}>{IDEA_STATUSES.map((s) => <option key={s} value={s}>{STATUS_META[s][0]}</option>)}</select></label>
      </div>
      <label className="field"><span>Publish on <span className="hint">optional, shows on the planner</span></span>
        <input className="input" type="date" value={f.planned_for} onChange={set("planned_for")} style={{ maxWidth: 200 }} /></label>
      <label className="field">Notes<textarea className="input" rows={6} value={f.notes} onChange={set("notes")} /></label>
    </>
  );
}

export interface IdeaDraft { title: string; keyword: string; format: string; status: string; notes: string; planned_for: string }
export const draftOf = (d: Partial<Idea>): IdeaDraft => ({ title: d.title ?? "", keyword: d.keyword ?? "", format: d.format ?? "long", status: d.status ?? "idea", notes: d.notes ?? "", planned_for: d.planned_for ?? "" });

function IdeaForm({ data, close, onSaved }: { data: Partial<Idea>; close(): void; onSaved?: () => void }) {
  const { toast, fail, refresh } = useApp();
  const editing = Boolean(data.id);
  const [f, setF] = useState(draftOf(data));
  const [busy, setBusy] = useState(false);
  const set = (k: keyof IdeaDraft) => (e: { target: { value: string } }) => { const v = e.target.value; setF((p) => ({ ...p, [k]: v })); };
  const similar = useAlreadyMade(editing ? "" : f.title || f.keyword);
  const save = async () => {
    setBusy(true);
    try {
      if (editing) await call("updateIdea", data.id!, f as Partial<Idea>);
      else await call("addIdea", { ...data, ...f } as Partial<Idea>);
      close();
      toast(editing ? "Idea updated" : "Added to your idea board");
      refresh();
      onSaved?.();
    } catch (e) { fail(e, "The idea wasn’t saved"); } finally { setBusy(false); }
  };
  return (
    <Dialog title={editing ? "Edit idea" : "Save idea"} desc={editing ? undefined : "Keep this on your idea board and move it through production."}
      footer={<><Button onClick={close}>Cancel</Button><Button variant="primary" busy={busy} onClick={save}>{editing ? "Save changes" : "Add to board"}</Button></>}>
      <IdeaFields f={f} set={set} />
      {similar.length > 0 && <AlreadyMade items={similar} />}
      {data.score != null && <div className="row secondary">Opportunity score <ScorePill score={data.score} /> {data.verdict}</div>}
    </Dialog>
  );
}
