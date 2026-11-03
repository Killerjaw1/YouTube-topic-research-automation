import { useEffect, useState } from "react";
import type { Report, ScanMeta } from "../../core/types";
import { call } from "../api";
import { Icon } from "../components/Icon";
import { Empty, go, Loading, PageHead, type Route, ScorePill, useApp } from "../components/ui";
import { ago, fmt, TONE_COLOR, tone } from "../format";

const ROWS: [string, (r: Report) => React.ReactNode][] = [
  ["Verdict", (r) => <span className={`badge ${r.tone}`}>{r.verdict}</span>],
  ["Demand", (r) => <Bar v={r.subscores.demand} />],
  ["Breakout", (r) => <Bar v={r.subscores.breakout} />],
  ["Openness", (r) => <Bar v={r.subscores.openness} />],
  ["Freshness", (r) => <Bar v={r.subscores.freshness} />],
  ["Median views/day", (r) => fmt(Number(r.metrics.median_vpd))],
  ["Small channels in top 10", (r) => String(r.metrics.small_in_top10 ?? "–")],
  ["Large channels in top 10", (r) => String(r.metrics.big_in_top10 ?? "–")],
  ["Breakout videos", (r) => String(r.metrics.breakouts ?? "–")],
  ["Content gap", (r) => (r.metrics.content_gap ? "Yes" : "No")],
  ["Recommended format", (r) => ({ short: "Shorts", long: "Long-form", both: "Both", either: "Either" } as Record<string, string>)[r.formats.recommended?.format ?? "either"]],
  ["Target length", (r) => (r.playbook?.length.long ? `${r.playbook.length.long.low_min}–${r.playbook.length.long.high_min} min` : "–")],
];

function Bar({ v }: { v: number }) {
  return (
    <div className="row" style={{ flexWrap: "nowrap", gap: 10 }}>
      <div className="meter" style={{ width: 90 }}><i style={{ width: `${v}%`, background: TONE_COLOR[tone(v)] }} /></div>
      <span className="tabular small">{v}</span>
    </div>
  );
}

export function ComparePage({ route }: { route: Route }) {
  const { fail } = useApp();
  const ids = (route.params.get("ids") ?? "").split(",").map(Number).filter(Boolean).slice(0, 4);
  const [reports, setReports] = useState<(Report & { scan_id: number })[] | null>(null);
  const [options, setOptions] = useState<ScanMeta[]>([]);
  const [pick, setPick] = useState<Set<number>>(new Set(ids));

  useEffect(() => {
    call("listScans", "analyze").then(setOptions).catch(fail);
    if (!ids.length) { setReports([]); return; }
    Promise.all(ids.map((id) => call("getScan", id).then((s) => ({ ...(s.payload as Report), scan_id: id })).catch(() => null)))
      .then((r) => setReports(r.filter(Boolean) as any));
  }, []); // eslint-disable-line

  const toggle = (id: number) => {
    const s = new Set(pick);
    if (s.has(id)) s.delete(id); else if (s.size < 4) s.add(id);
    setPick(s);
  };

  if (!reports) return <Loading title="Loading reports" />;
  return (
    <>
      <PageHead title="Compare topics" desc="Put up to four analyses side by side to choose what to make next." />
      {reports.length >= 2 ? (
        <div className="card flush" style={{ marginBottom: 16 }}>
          <div className="table-wrap bare">
            <table className="data">
              <thead><tr><th style={{ width: 200 }} />{reports.map((r) => (
                <th key={r.scan_id}><a href={`#/report/${r.scan_id}`} style={{ color: "var(--text)", fontSize: 13, fontWeight: 600 }}>{r.keyword}</a></th>
              ))}</tr></thead>
              <tbody>
                <tr><td className="t2">Opportunity score</td>{reports.map((r) => {
                  const best = Math.max(...reports.map((x) => x.score));
                  return <td key={r.scan_id}><div className="row"><ScorePill score={r.score} big />{r.score === best && <span className="badge great">Best</span>}</div></td>;
                })}</tr>
                {ROWS.map(([label, fn]) => <tr key={label}><td className="t2">{label}</td>{reports.map((r) => <td key={r.scan_id}>{fn(r)}</td>)}</tr>)}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <Empty icon="columns" title="Choose at least two analyses">Select reports below, or tick topics in History or the Watchlist and choose Compare.</Empty>
      )}
      <div className="card flush">
        <div className="card-head" style={{ alignItems: "center" }}>
          <div><h3>Analyses</h3><p className="sub">Select up to four</p></div>
          <button className="btn sm primary" disabled={pick.size < 2} onClick={() => { go(`#/compare?ids=${[...pick].join(",")}`); }}><Icon name="columns" />Compare {pick.size || ""}</button>
        </div>
        <div className="table-wrap bare" style={{ maxHeight: 360 }}>
          <table className="data"><tbody>{options.map((o) => (
            <tr key={o.id} className={pick.has(o.id) ? "selected" : ""} style={{ cursor: "pointer" }} onClick={() => toggle(o.id)}>
              <td style={{ width: 32 }}><input type="checkbox" readOnly checked={pick.has(o.id)} aria-label={`Select ${o.query}`} /></td>
              <td style={{ width: 56 }}><ScorePill score={o.score} /></td>
              <td>{o.query}</td><td className="t2">{o.verdict}</td><td className="num muted nowrap">{ago(o.created)}</td>
            </tr>
          ))}</tbody></table>
          {!options.length && <div className="empty">No analyses yet.</div>}
        </div>
      </div>
    </>
  );
}
