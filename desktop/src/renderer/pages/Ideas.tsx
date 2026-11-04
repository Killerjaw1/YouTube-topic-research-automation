import { useCallback, useEffect, useState } from "react";
import { type Idea, IDEA_STATUSES } from "../../core/types";
import { call, saveFile } from "../api";
import { draftOf, IdeaFields, type IdeaDraft, ideaModal, STATUS_META } from "../components/IdeaModal";
import { scriptDialog } from "../components/ClaudeHelpers";
import { Button, DetailPanel, Dialog, Facts } from "../components/kit";
import { FormatBadge, PageHead, ScorePill, useApp } from "../components/ui";
import { ago } from "../format";

export function IdeaEditor({ idea, onSaved, onClose }: { idea: Idea; onSaved(): void; onClose(): void }) {
  const { toast, fail, refresh, modal } = useApp();
  const [f, setF] = useState<IdeaDraft>(draftOf(idea));
  const [busy, setBusy] = useState(false);
  useEffect(() => setF(draftOf(idea)), [idea]);
  const set = (k: keyof IdeaDraft) => (e: { target: { value: string } }) => { const v = e.target.value; setF((p) => ({ ...p, [k]: v })); };
  const dirty = JSON.stringify(f) !== JSON.stringify(draftOf(idea));
  const save = async () => {
    setBusy(true);
    try { await call("updateIdea", idea.id, f as Partial<Idea>); toast("Idea updated"); refresh(); onSaved(); } catch (e) { fail(e, "The idea wasn’t saved"); } finally { setBusy(false); }
  };
  const confirmDelete = () => modal((close) => (
    <Dialog title="Delete this idea?" desc={`“${idea.title}” will be removed from your board. This can’t be undone.`}
      footer={<><Button onClick={close}>Cancel</Button><Button variant="danger" onClick={async () => {
        close();
        try { await call("deleteIdea", idea.id); toast("Idea deleted"); refresh(); onClose(); onSaved(); } catch (e) { fail(e, "The idea wasn’t deleted"); }
      }}>Delete idea</Button></>} />
  ));
  return (
    <DetailPanel title={idea.title} sub={`Updated ${ago(idea.updated, true)}`} onClose={onClose}
      footer={<>
        <Button variant="primary" busy={busy} disabled={!dirty} onClick={save}>Save changes</Button>
        {idea.scan_id && <Button href={`#/report/${idea.scan_id}`}>Open report</Button>}
        <Button icon="script" onClick={() => scriptDialog(modal, { topic: f.keyword || f.title, title: f.title, format: f.format === "long" ? "long" : "short", scan_id: idea.scan_id ?? null, notes: f.notes })}>Write script…</Button>
        <Button variant="ghost" className="danger" style={{ marginLeft: "auto" }} onClick={confirmDelete}>Delete…</Button>
      </>}>
      {idea.score != null && <div className="row"><ScorePill score={idea.score} /><span className="t2">{idea.verdict}</span></div>}
      <IdeaFields f={f} set={set} />
      <Facts rows={[["Added", ago(idea.created)], ["Last updated", ago(idea.updated)]]} />
    </DetailPanel>
  );
}

export function IdeasPage() {
  const { modal, fail, toast, panel } = useApp();
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [drop, setDrop] = useState<string | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const reload = useCallback(() => call("listIdeas").then((d) => { setIdeas(d.ideas); return d.ideas; }).catch((e) => { fail(e); return [] as Idea[]; }), [fail]);
  useEffect(() => { reload(); }, [reload]);

  const open = (i: Idea) => panel.open(
    <IdeaEditor idea={i} onClose={panel.close} onSaved={async () => {
      const list = await reload();
      const fresh = list.find((x) => x.id === i.id);
      if (fresh) open(fresh);
    }} />, "idea:" + i.id);

  const move = async (id: number, status: string) => {
    const idea = ideas.find((i) => i.id === id);
    if (!idea || idea.status === status) return;
    setIdeas(ideas.map((i) => (i.id === id ? { ...i, status: status as Idea["status"] } : i)));
    try { await call("updateIdea", id, { status: status as Idea["status"] }); reload(); toast(`Moved to ${STATUS_META[status][0].toLowerCase()}`, "ok", idea.title); }
    catch (e) { fail(e, "The idea wasn’t moved"); reload(); }
  };
  const exportCsv = async () => { try { const p = await saveFile(await call("ideasCsv")); if (p) toast("Ideas exported", "ok", p); } catch (e) { fail(e, "Export didn’t finish"); } };

  return (
    <>
      <PageHead title="Idea board" desc="Move ideas through production. Drag a card to change its stage, or select it to edit.">
        <Button icon="download" onClick={exportCsv}>Export CSV…</Button>
        <Button variant="primary" icon="plus" onClick={() => ideaModal(modal, { status: "idea" }, reload)}>New idea</Button>
      </PageHead>
      <div className="board">
        {IDEA_STATUSES.map((st) => {
          const items = ideas.filter((i) => i.status === st);
          const [label, cat] = STATUS_META[st];
          return (
            <section key={st} className={`col ${drop === st ? "drop" : ""}`} aria-label={label}
              onDragOver={(e) => { e.preventDefault(); setDrop(st); }} onDragLeave={() => setDrop(null)}
              onDrop={(e) => { e.preventDefault(); setDrop(null); move(Number(e.dataTransfer.getData("text/plain")), st); }}>
              <div className="col-head"><span className="dot" style={{ background: `var(--${cat})` }} /><span className="label" style={{ padding: 0 }}>{label}</span><span className="count">{items.length}</span></div>
              {items.map((i) => (
                <button key={i.id} type="button" className={`icard ${dragging === i.id ? "dragging" : ""}`} draggable aria-selected={panel.key === "idea:" + i.id}
                  onDragStart={(e) => { setDragging(i.id); e.dataTransfer.setData("text/plain", String(i.id)); }} onDragEnd={() => setDragging(null)}
                  onClick={() => open(i)}>
                  <div className="row between nowrap">{i.score != null ? <ScorePill score={i.score} /> : <span />}{i.format && <FormatBadge format={i.format} />}</div>
                  <div className="title">{i.title}</div>
                  {i.notes && <div className="notes">{i.notes}</div>}
                  <div className="secondary">{i.planned_for ? `Publish ${new Date(i.planned_for + "T12:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}` : ago(i.updated)}</div>
                </button>
              ))}
              {!items.length && <div className="secondary" style={{ padding: "4px" }}>{st === "idea" ? "Save ideas from any report, or add one here." : "Drag ideas here."}</div>}
            </section>
          );
        })}
      </div>
    </>
  );
}
