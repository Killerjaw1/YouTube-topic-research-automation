import { useEffect, useMemo, useState } from "react";
import type { OutlierResult, Report, ScanMeta } from "../../core/types";
import { call, saveFile } from "../api";
import { Button, Card, DetailPanel, Dialog, EmptyState, Facts, Segmented, StateCard, Tag, Thumbnail } from "../components/kit";
import { Empty, go, Loading, PageHead, Reasons, ScorePill, useApp, Verdict } from "../components/ui";
import { ago, fmt, tone } from "../format";

const SUBS: [keyof Report["subscores"], string][] = [["demand", "Demand"], ["breakout", "Breakout"], ["openness", "Openness"], ["freshness", "Freshness"]];
const KIND_LABEL = { analyze: "Topic report", outliers: "Outlier search" } as const;

function ScanPanel({ meta, onClose, onExport, onDelete }: { meta: ScanMeta; onClose(): void; onExport(): void; onDelete(): void }) {
  const [payload, setPayload] = useState<any>(null);
  const [error, setError] = useState("");
  useEffect(() => { setPayload(null); setError(""); call("getScan", meta.id).then((s) => setPayload(s.payload)).catch((e) => setError(e.message)); }, [meta.id]);
  const rep = meta.kind === "analyze" ? (payload as Report | null) : null;
  const out = meta.kind === "outliers" ? (payload as OutlierResult | null) : null;
  return (
    <DetailPanel title={meta.query} sub={`${KIND_LABEL[meta.kind]} · ${ago(meta.created)}`} onClose={onClose}
      footer={<>
        <Button variant="primary" href={`#/report/${meta.id}`}>Open report</Button>
        {meta.kind === "analyze" && <Button icon="download" onClick={onExport}>Export CSV…</Button>}
        <Button variant="ghost" className="danger" style={{ marginLeft: "auto" }} onClick={onDelete}>Delete…</Button>
      </>}>
      {error ? <StateCard tone="danger" title="This report couldn’t be opened">{error}</StateCard>
        : !payload ? <Loading title="Opening report" rows={3} />
        : rep ? <>
          <div className="row nowrap"><ScorePill score={rep.score} big /><div><Verdict tone={rep.tone}>{rep.verdict}</Verdict>
            <div className="secondary">{rep.demo ? "Sample data" : "Live YouTube data"}{rep.depth ? ` · ${rep.depth === "deep" ? "Deep" : "Quick"} scan` : ""}</div></div></div>
          <div className="stack tight">
            {SUBS.map(([k, label]) => {
              const v = rep.subscores[k] ?? 0;
              return (
                <div key={k}>
                  <div className="row between small mb-sm"><span className="t2">{label}</span><span className="tabular">{v}</span></div>
                  <div className="meter"><i className={tone(v)} style={{ width: `${v}%` }} /></div>
                </div>
              );
            })}
          </div>
          <Facts rows={[["Median views a day", fmt(Number(rep.metrics.median_vpd))], ["Small channels in the top 10", String(rep.metrics.small_in_top10 ?? "–")],
            ["Large channels in the top 10", String(rep.metrics.big_in_top10 ?? "–")], ["Breakout videos", String(rep.metrics.breakouts ?? "–")]]} />
          {rep.reasons.length > 0 && <div><span className="section-label">Main findings</span><Reasons items={rep.reasons.slice(0, 4)} /></div>}
        </> : out ? <>
          <Facts rows={[["Outliers found", String(out.videos.length)], ["Videos checked", String(out.scanned)], ["Published within", `${out.days} days`],
            ["Channel size limit", `${fmt(out.max_subs)} subscribers`], ["Data", out.demo ? "Sample" : "Live YouTube data"]]} />
          {out.videos.length > 0 ? (
            <div>
              <span className="section-label">Top outliers</span>
              <div className="stack tight">
                {out.videos.slice(0, 5).map((v) => (
                  <div key={v.id} className="vid-cell">
                    <Thumbnail src={v.thumbnail} title={v.title} name={v.channel_title} />
                    <div><div className="title">{v.title}</div><div className="secondary">{v.channel_title} · {fmt(v.views)} views</div></div>
                  </div>
                ))}
              </div>
            </div>
          ) : <StateCard tone="idle" title="No outliers in this search">Try a longer period or a higher channel size limit.</StateCard>}
        </> : null}
    </DetailPanel>
  );
}

export function HistoryPage() {
  const { refresh, fail, toast, modal, panel } = useApp();
  const [scans, setScans] = useState<ScanMeta[] | null>(null);
  const [kind, setKind] = useState<"all" | "analyze" | "outliers">("all");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  useEffect(() => { call("listScans").then(setScans).catch((e) => { setScans([]); fail(e, "History couldn’t be loaded"); }); }, [fail]);
  const all = scans ?? [];
  const list = useMemo(() => all.filter((s) => (kind === "all" || s.kind === kind) && (!q || s.query.toLowerCase().includes(q.toLowerCase()))), [all, kind, q]);
  const counts = useMemo(() => ({ all: all.length, analyze: all.filter((s) => s.kind === "analyze").length, outliers: all.filter((s) => s.kind === "outliers").length }), [all]);

  const del = async (ids: number[]) => {
    try {
      for (const id of ids) await call("deleteScan", id);
      setScans(all.filter((s) => !ids.includes(s.id)));
      setSelected(new Set());
      if (panel.key && ids.some((id) => panel.key === "scan:" + id)) panel.close();
      refresh();
      toast(ids.length > 1 ? `${ids.length} reports deleted` : "Report deleted");
    } catch (e) { fail(e, "The report wasn’t deleted"); }
  };
  const confirmDelete = (ids: number[]) => {
    const one = ids.length === 1 ? all.find((s) => s.id === ids[0]) : null;
    modal((close) => (
      <Dialog title={one ? "Delete this report?" : `Delete ${ids.length} reports?`}
        desc={one ? `“${one.query}” will be removed from History. This can’t be undone.` : "They’ll be removed from History. This can’t be undone."}
        footer={<><Button onClick={close}>Cancel</Button><Button variant="danger" onClick={() => { close(); del(ids); }}>{one ? "Delete report" : `Delete ${ids.length} reports`}</Button></>} />
    ));
  };
  const exportCsv = async (id: number) => { try { const p = await saveFile(await call("scanCsv", id)); if (p) toast("Report exported", "ok", p); } catch (e) { fail(e, "Export didn’t finish"); } };
  const toggle = (id: number, on: boolean) => { const s = new Set(selected); if (on) s.add(id); else s.delete(id); setSelected(s); };
  const comparable = [...selected].filter((id) => all.find((s) => s.id === id)?.kind === "analyze");
  const open = (s: ScanMeta) => panel.open(
    <ScanPanel meta={s} onClose={panel.close} onExport={() => exportCsv(s.id)} onDelete={() => confirmDelete([s.id])} />, "scan:" + s.id);

  if (!scans) return <><PageHead title="History" /><Loading title="Loading history" rows={6} /></>;
  return (
    <>
      <PageHead title="History" desc="Every analysis and outlier search is saved on this computer. Reopening a report uses no quota.">
        {selected.size > 0 && <Button variant="ghost" className="danger" icon="trash" onClick={() => confirmDelete([...selected])}>Delete {selected.size}…</Button>}
        <Button variant="primary" icon="columns" disabled={comparable.length < 2} onClick={() => go(`#/compare?ids=${comparable.slice(0, 4).join(",")}`)}>
          Compare{comparable.length >= 2 ? ` ${Math.min(comparable.length, 4)}` : ""}
        </Button>
      </PageHead>
      {all.length ? (
        <Card flush>
          <div className="card-toolbar">
            <Segmented label="Report type" value={kind} onChange={setKind}
              options={[["all", `All ${counts.all}`], ["analyze", `Topic reports ${counts.analyze}`], ["outliers", `Outlier searches ${counts.outliers}`]]} />
            <input className="input grow" style={{ maxWidth: 280, marginLeft: "auto" }} placeholder="Filter by topic" aria-label="Filter by topic" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {list.length ? (
            <div className="table-wrap">
              <table className="data">
                <thead><tr>
                  <th style={{ width: 36 }}><input type="checkbox" aria-label="Select all" checked={list.length > 0 && list.every((s) => selected.has(s.id))}
                    onChange={(e) => setSelected(e.target.checked ? new Set(list.map((s) => s.id)) : new Set())} /></th>
                  <th style={{ width: 64 }}>Score</th><th>Topic</th><th className="hide-sm">Type</th><th>Result</th><th className="num">Date</th>
                </tr></thead>
                <tbody>{list.map((s) => (
                  <tr key={s.id} className="clickable" tabIndex={0} aria-selected={panel.key === "scan:" + s.id}
                    onClick={() => open(s)} onKeyDown={(e) => { if (e.key === "Enter") open(s); }}>
                    <td onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label={`Select ${s.query}`} checked={selected.has(s.id)} onChange={(e) => toggle(s.id, e.target.checked)} /></td>
                    <td>{s.kind === "analyze" ? <ScorePill score={s.score} /> : <span className="muted">–</span>}</td>
                    <td style={{ minWidth: 160 }}><span style={{ fontWeight: 600 }}>{s.query}</span>{s.demo && <span style={{ marginLeft: 8 }}><Tag>Sample</Tag></span>}</td>
                    <td className="t2 nowrap hide-sm">{KIND_LABEL[s.kind]}</td>
                    <td>{s.kind === "analyze" ? <Verdict score={s.score}>{s.verdict}</Verdict> : <span className="t2">{s.verdict}</span>}</td>
                    <td className="num muted nowrap" title={new Date(s.created * 1000).toLocaleString()}>{ago(s.created)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : <EmptyState card={false} icon="search" title="No matching reports">Try a different filter, or clear the search.</EmptyState>}
        </Card>
      ) : (
        <Empty icon="clock" title="No history yet" actions={<Button variant="primary" href="#/analyze">Analyze a topic</Button>}>
          Reports are saved here after each analysis or outlier search.
        </Empty>
      )}
      {all.length > 0 && <p className="secondary mt">Select a report for a summary. Tick two or more topic reports to compare them.</p>}
    </>
  );
}
