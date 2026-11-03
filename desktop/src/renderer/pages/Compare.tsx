import { useEffect, useState } from "react";
import type { Report, ScanMeta } from "../../core/types";
import { call } from "../api";
import { Button, Card, Tag } from "../components/kit";
import { Empty, go, Loading, PageHead, type Route, ScorePill, useApp, Verdict } from "../components/ui";
import { ago, fmt, tone } from "../format";

const FORMAT_LABEL: Record<string, string> = { short: "Shorts", long: "Long-form", both: "Both", either: "Either" };

const ROWS: [string, (r: Report) => React.ReactNode][] = [
  ["Verdict", (r) => <Verdict tone={r.tone}>{r.verdict}</Verdict>],
  ["Demand", (r) => <Bar v={r.subscores.demand} />],
  ["Breakout", (r) => <Bar v={r.subscores.breakout} />],
  ["Openness", (r) => <Bar v={r.subscores.openness} />],
  ["Freshness", (r) => <Bar v={r.subscores.freshness} />],
  ["Median views a day", (r) => fmt(Number(r.metrics.median_vpd))],
  ["Small channels in the top 10", (r) => String(r.metrics.small_in_top10 ?? "–")],
  ["Large channels in the top 10", (r) => String(r.metrics.big_in_top10 ?? "–")],
  ["Breakout videos", (r) => String(r.metrics.breakouts ?? "–")],
  ["Content gap", (r) => (r.metrics.content_gap ? "Yes" : "No")],
  ["Recommended format", (r) => FORMAT_LABEL[r.formats.recommended?.format ?? "either"]],
  ["Target length", (r) => (r.playbook?.length.long ? `${r.playbook.length.long.low_min}–${r.playbook.length.long.high_min} min` : "–")],
];

function Bar({ v }: { v: number }) {
  return (
    <div className="row nowrap">
      <div className="meter" style={{ width: 88 }}><i className={tone(v)} style={{ width: `${v}%` }} /></div>
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

  if (!reports) return <Loading title="Opening reports" />;
  const best = reports.length ? Math.max(...reports.map((x) => x.score)) : null;
  return (
    <>
      <PageHead title="Compare topics" desc="Put up to four analyses side by side to decide what to make next.">
        <Button variant="primary" icon="columns" disabled={pick.size < 2} onClick={() => go(`#/compare?ids=${[...pick].join(",")}`)}>Compare {pick.size >= 2 ? pick.size : ""} selected</Button>
      </PageHead>
      {reports.length >= 2 ? (
        <Card flush className="mb">
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th style={{ width: 220 }} />{reports.map((r) => (
                <th key={r.scan_id} style={{ textTransform: "none", letterSpacing: 0 }}><a href={`#/report/${r.scan_id}`} className="link" style={{ fontSize: "var(--fs)", fontWeight: 600 }}>{r.keyword}</a></th>
              ))}</tr></thead>
              <tbody>
                <tr><td className="t2">Opportunity score</td>{reports.map((r) => (
                  <td key={r.scan_id}><div className="row"><ScorePill score={r.score} big />{r.score === best && <Tag tone="ok">Highest</Tag>}</div></td>
                ))}</tr>
                {ROWS.map(([label, fn]) => <tr key={label}><td className="t2">{label}</td>{reports.map((r) => <td key={r.scan_id}>{fn(r)}</td>)}</tr>)}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <Empty icon="columns" title="Choose at least two analyses">Select reports below, or tick topics in History or the Watchlist, then choose Compare.</Empty>
      )}
      <Card flush title="Your analyses" sub={`Select up to four. ${pick.size} selected.`} className="mt">
        <div className="table-wrap" style={{ maxHeight: 360 }}>
          {options.length ? (
            <table className="data"><tbody>{options.map((o) => (
              <tr key={o.id} className="clickable" aria-selected={pick.has(o.id)} onClick={() => toggle(o.id)}>
                <td style={{ width: 36 }}><input type="checkbox" readOnly checked={pick.has(o.id)} aria-label={`Select ${o.query}`} tabIndex={-1} /></td>
                <td style={{ width: 56 }}><ScorePill score={o.score} /></td>
                <td style={{ fontWeight: 600 }}>{o.query}</td>
                <td><Verdict score={o.score}>{o.verdict}</Verdict></td>
                <td className="num muted nowrap">{ago(o.created)}</td>
              </tr>
            ))}</tbody></table>
          ) : <Empty icon="search" title="No analyses yet" actions={<Button variant="primary" href="#/analyze">Analyze a topic</Button>}>Analyze a few topics, then compare them here.</Empty>}
        </div>
      </Card>
    </>
  );
}
