import { useCallback, useEffect, useState } from "react";
import { type Idea, IDEA_STATUSES } from "../../core/types";
import { call, saveFile } from "../api";
import { Icon } from "../components/Icon";
import { ideaModal, STATUS_META } from "../components/IdeaModal";
import { FormatBadge, PageHead, ScorePill, useApp } from "../components/ui";
import { ago } from "../format";

export function IdeasPage() {
  const { modal, fail, toast } = useApp();
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [drop, setDrop] = useState<string | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const reload = useCallback(() => { call("listIdeas").then((d) => setIdeas(d.ideas)).catch(fail); }, [fail]);
  useEffect(reload, [reload]);

  const move = async (id: number, status: string) => {
    const idea = ideas.find((i) => i.id === id);
    if (!idea || idea.status === status) return;
    setIdeas(ideas.map((i) => (i.id === id ? { ...i, status: status as Idea["status"] } : i)));
    try { await call("updateIdea", id, { status: status as Idea["status"] }); reload(); } catch (e) { fail(e); reload(); }
  };
  const exportCsv = async () => { try { const p = await saveFile(await call("ideasCsv")); if (p) toast("Saved " + p); } catch (e) { fail(e); } };

  return (
    <>
      <PageHead title="Idea board" desc="Move ideas through production by dragging cards between stages.">
        <button className="btn sm" onClick={exportCsv}><Icon name="download" />Export CSV</button>
        <button className="btn sm primary" onClick={() => ideaModal(modal, { status: "idea" }, reload)}><Icon name="plus" />New idea</button>
      </PageHead>
      <div className="board">
        {IDEA_STATUSES.map((st) => {
          const items = ideas.filter((i) => i.status === st);
          const [label, color] = STATUS_META[st];
          return (
            <div key={st} className={`col ${drop === st ? "drop" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setDrop(st); }} onDragLeave={() => setDrop(null)}
              onDrop={(e) => { e.preventDefault(); setDrop(null); move(Number(e.dataTransfer.getData("text/plain")), st); }}>
              <div className="col-head"><span className="dot" style={{ background: color }} />{label}<span className="n">{items.length}</span></div>
              {items.map((i) => (
                <div key={i.id} className={`icard ${dragging === i.id ? "dragging" : ""}`} draggable
                  onDragStart={(e) => { setDragging(i.id); e.dataTransfer.setData("text/plain", String(i.id)); }} onDragEnd={() => setDragging(null)}
                  onClick={() => ideaModal(modal, i, reload)}>
                  <div className="row" style={{ justifyContent: "space-between", flexWrap: "nowrap" }}><ScorePill score={i.score} />{i.format && <FormatBadge format={i.format === "short" ? "short" : "long"} />}</div>
                  <div className="t">{i.title}</div>
                  {i.notes && <div className="notes">{i.notes}</div>}
                  <div className="small muted">{ago(i.updated)}</div>
                </div>
              ))}
              {!items.length && <div className="small muted" style={{ padding: "6px 4px" }}>No ideas</div>}
            </div>
          );
        })}
      </div>
    </>
  );
}
