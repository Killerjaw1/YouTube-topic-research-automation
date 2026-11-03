import { useEffect, useState } from "react";
import type { ScanMeta } from "../../core/types";
import { call, saveFile } from "../api";
import { Icon } from "../components/Icon";
import { Empty, ScorePill, Seg, useApp } from "../components/ui";
import { ago } from "../format";

export function HistoryPage() {
  const { refresh, fail, toast } = useApp();
  const [scans, setScans] = useState<ScanMeta[]>([]);
  const [kind, setKind] = useState<"all" | "analyze" | "outliers">("all");
  useEffect(() => { call("listScans").then(setScans).catch(fail); }, [fail]);
  const list = scans.filter((s) => kind === "all" || s.kind === kind);
  const del = async (id: number) => {
    try { await call("deleteScan", id); setScans(scans.filter((s) => s.id !== id)); refresh(); } catch (e) { fail(e); }
  };
  const exportCsv = async (id: number) => { try { const p = await saveFile(await call("scanCsv", id)); if (p) toast("Saved " + p); } catch (e) { fail(e); } };

  return (
    <>
      <div className="row" style={{ marginBottom: 16, justifyContent: "space-between" }}>
        <Seg value={kind} onChange={setKind} options={[["all", "All"], ["analyze", "Topic reports"], ["outliers", "Outlier searches"]]} />
        <span className="small muted">Reopening a saved report costs no quota.</span>
      </div>
      {list.length ? (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap" style={{ border: 0 }}>
            <table className="data">
              <thead><tr><th>Score</th><th>Query</th><th>Type</th><th>Result</th><th>When</th><th /></tr></thead>
              <tbody>{list.map((s) => (
                <tr key={s.id}>
                  <td>{s.kind === "analyze" && <ScorePill score={s.score} />}</td>
                  <td><a href={`#/report/${s.id}`}><b>{s.query}</b></a> {s.demo && <span className="badge demo">demo</span>}</td>
                  <td><span className="badge neutral">{s.kind === "analyze" ? "Topic report" : "Outliers"}</span></td>
                  <td className="small t2">{s.verdict}</td>
                  <td className="small muted nowrap">{ago(s.created)}</td>
                  <td className="right nowrap">
                    <a className="btn sm ghost" href={`#/report/${s.id}`}>Open</a>
                    {s.kind === "analyze" && <button className="btn sm ghost" title="Export CSV" onClick={() => exportCsv(s.id)}><Icon name="download" /></button>}
                    <button className="btn sm ghost danger" title="Delete" onClick={() => del(s.id)}><Icon name="trash" /></button>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      ) : <Empty icon="clock" title="Nothing here yet">Your topic reports and outlier searches are saved here automatically.</Empty>}
    </>
  );
}
