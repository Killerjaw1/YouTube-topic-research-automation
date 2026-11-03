import { type ReactNode, useState } from "react";
import { type Idea, IDEA_STATUSES } from "../../core/types";
import { call } from "../api";
import { Icon } from "./Icon";
import { ScorePill, useApp } from "./ui";

export const STATUS_META: Record<string, [string, string]> = {
  idea: ["Ideas", "var(--muted)"], researching: ["Researching", "var(--s-small)"], scripting: ["Scripting", "var(--warn)"],
  filming: ["Filming and editing", "var(--s-big)"], uploaded: ["Uploaded", "var(--great)"],
};

type ModalFn = (render: (close: () => void) => ReactNode) => void;

export function ideaModal(modal: ModalFn, data: Partial<Idea>, onSaved?: () => void) {
  modal((close) => <IdeaForm data={data} close={close} onSaved={onSaved} />);
}

function IdeaForm({ data, close, onSaved }: { data: Partial<Idea>; close(): void; onSaved?: () => void }) {
  const { toast, fail, refresh } = useApp();
  const editing = Boolean(data.id);
  const [f, setF] = useState({ title: data.title ?? "", keyword: data.keyword ?? "", format: data.format ?? "long", status: data.status ?? "idea", notes: data.notes ?? "" });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    try {
      if (editing) await call("updateIdea", data.id!, f as Partial<Idea>);
      else await call("addIdea", { ...data, ...f } as Partial<Idea>);
      close();
      toast(editing ? "Idea updated" : "Added to idea board");
      refresh();
      onSaved?.();
    } catch (e) { fail(e); }
  };
  const del = async () => {
    if (!confirm("Delete this idea?")) return;
    try { await call("deleteIdea", data.id!); close(); refresh(); onSaved?.(); } catch (e) { fail(e); }
  };
  return (
    <>
      <h3>{editing ? "Edit idea" : "New idea"}</h3>
      <label className="field">Working title<input className="input" autoFocus value={f.title} onChange={set("title")} maxLength={300} /></label>
      <div className="form-row">
        <label className="field">Search keyword<input className="input" value={f.keyword} onChange={set("keyword")} /></label>
        <label className="field">Format<select className="select" value={f.format} onChange={set("format")}>{[["long", "Long-form"], ["short", "Short"], ["both", "Both"], ["either", "Undecided"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label className="field">Stage<select className="select" value={f.status} onChange={set("status")}>{IDEA_STATUSES.map((s) => <option key={s} value={s}>{STATUS_META[s][0]}</option>)}</select></label>
      </div>
      <label className="field">Notes<textarea className="input" rows={6} value={f.notes} onChange={set("notes")} /></label>
      {data.score != null && <div className="small muted row">Opportunity score <ScorePill score={data.score} /> {data.verdict}</div>}
      <div className="foot">
        {editing && <button className="btn danger" style={{ marginRight: "auto" }} onClick={del}><Icon name="trash" />Delete</button>}
        <button className="btn ghost" onClick={close}>Cancel</button>
        <button className="btn primary" onClick={save}>{editing ? "Save changes" : "Add to board"}</button>
      </div>
    </>
  );
}
