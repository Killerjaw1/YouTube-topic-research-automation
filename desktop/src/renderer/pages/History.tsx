import { useEffect, useMemo, useState } from "react";
import type { ScanMeta } from "../../core/types";
import { call, saveFile } from "../api";
import { Icon } from "../components/Icon";
import { Empty, go, PageHead, ScorePill, Seg, useApp } from "../components/ui";
import { ago } from "../format";

export function HistoryPage() {
  const { refresh, fail, toast } = useApp();
  const [scans, setScans] = useState<ScanMeta[]>([]);
  const [kind, setKind] = useState<"all" | "analyze" | "outliers">("all");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  useEffect(() => { call("listScans").then(setScans).catch(fail); }, [fail]);
  const list = useMemo(() => scans.filter((s) => (kind === "all" || s.kind === kind) && (!q || s.query.toLowerCase().includes(q.toLowerCase()))), [scans, kind, q]);

  const del = async (ids: number[]) => {
    try {
      for (const id of ids) await call("deleteScan", id);
      setScans(scans.filter((s) => !ids.includes(s.id)));
      setSelected(new Set());
      refresh();
      toast(ids.length > 1 ? `Deleted ${ids.length} reports` : "Report deleted");
    } catch (e) { fail(e); }
  };
  const exportCsv = async (id: number) => { try { const p = await saveFile(await call("scanCsv", id)); if (p) toast(`Saved ${p}`); } catch (e) { fail(e); } };
  const toggle = (id: number, on: boolean) => { const s = new Set(selected); if (on) s.add(id); else s.delete(id); setSelected(s); };
  const comparable = [...selected].filter((id) => scans.find((s) => s.id === id)?.kind === "analyze");

  return (
    <>
      <PageHead title="History" desc="Every analysis and outlier search is saved locally. Reopening a report uses no quota.">
        {comparable.length >= 2 && <button className="btn sm" onClick={() => go(`#/compare?ids=${comparable.slice(0, 4).join(",")}`)}><Icon name="columns" />Compare {Math.min(comparable.length, 4)}</button>}
        {selected.size > 0 && <button className="btn sm danger" onClick={() => del([...selected])}><Icon name="trash" />Delete {selected.size}</button>}
      </PageHead>
      <div className="row between" style={{ marginBottom: 12 }}>
        <Seg value={kind} onChange={setKind} options={[["all", "All"], ["analyze", "Topic reports"], ["outliers", "Outlier searches"]]} />
        <input className="input" style={{ width: 260 }} placeholder="Filter by topic" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {list.length ? (
        <div className="card flush">
          <div className="table-wrap bare">
            <table className="data">
              <thead><tr>
                <th style={{ width: 32 }}><input type="checkbox" aria-label="Select all" checked={list.length > 0 && list.every((s) => selected.has(s.id))}
                  onChange={(e) => setSelected(e.target.checked ? new Set(list.map((s) => s.id)) : new Set())} /></th>
                <th style={{ width: 56 }}>Score</th><th>Topic</th><th>Type</th><th>Result</th><th className="num">Date</th><th />
              </tr></thead>
              <tbody>{list.map((s) => (
                <tr key={s.id} className={selected.has(s.id) ? "selected" : ""}>
                  <td><input type="checkbox" aria-label={`Select ${s.query}`} checked={selected.has(s.id)} onChange={(e) => toggle(s.id, e.target.checked)} /></td>
                  <td>{s.kind === "analyze" ? <ScorePill score={s.score} /> : <span className="muted">–</span>}</td>
                  <td><a href={`#/report/${s.id}`} style={{ fontWeight: 500 }}>{s.query}</a>{s.demo && <span className="badge demo" style={{ marginLeft: 8 }}>Sample</span>}</td>
                  <td className="t2">{s.kind === "analyze" ? "Topic report" : "Outlier search"}</td>
                  <td className="t2">{s.verdict}</td>
                  <td className="num muted nowrap" title={new Date(s.created * 1000).toLocaleString()}>{ago(s.created)}</td>
                  <td className="right nowrap">
                    {s.kind === "analyze" && <button className="btn xs ghost" title="Export CSV" onClick={() => exportCsv(s.id)}><Icon name="download" /></button>}
                    <button className="btn xs ghost danger" title="Delete" onClick={() => del([s.id])}><Icon name="trash" /></button>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      ) : <Empty icon="clock" title={scans.length ? "No matching reports" : "No history yet"}>{scans.length ? "Try a different filter." : "Reports are saved here automatically after each analysis."}</Empty>}
    </>
  );
}
