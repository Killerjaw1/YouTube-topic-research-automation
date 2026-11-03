import { useCallback, useEffect, useRef, useState } from "react";
import type { Tracked } from "../../core/types";
import { call } from "../api";
import { Sparkline } from "../components/charts";
import { Icon } from "../components/Icon";
import { analyzeLink, Delta, DemoBanner, Empty, go, PageHead, ScorePill, useApp } from "../components/ui";
import { ago } from "../format";

export function WatchlistPage() {
  const { status, fail, toast, refresh } = useApp();
  const [items, setItems] = useState<Tracked[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState("");
  const cancel = useRef(false);
  const load = useCallback(() => call("listTracked").then(setItems).catch(fail), [fail]);
  useEffect(() => { load(); }, [load]);

  const refreshOne = async (k: string) => {
    setBusy(k);
    try { await call("refreshTracked", k); await load(); refresh(); } catch (e) { fail(e); } finally { setBusy(null); }
  };
  const refreshAll = async () => {
    if (!items?.length) return;
    cancel.current = false;
    setProgress({ done: 0, total: items.length });
    let done = 0;
    for (const t of items) {
      if (cancel.current) break;
      setBusy(t.keyword);
      try { await call("refreshTracked", t.keyword); } catch (e: any) { fail(e); if (/quota|key/i.test(e.message)) break; }
      setProgress({ done: ++done, total: items.length });
    }
    setBusy(null); setProgress(null);
    await load(); refresh();
    toast(`Re-scored ${done} topic${done === 1 ? "" : "s"}`);
  };
  const add = async () => {
    const k = adding.trim();
    if (!k) return;
    try { await call("track", k, null); setAdding(""); await refreshOne(k.toLowerCase()); } catch (e) { fail(e); }
  };
  const remove = async (k: string) => { await call("untrack", k).catch(fail); load(); refresh(); };
  const compare = () => {
    const ids = (items ?? []).filter((t) => selected.has(t.keyword)).map((t) => t.history[t.history.length - 1]?.scan_id).filter(Boolean);
    go(`#/compare?ids=${ids.join(",")}`);
  };

  if (!items) return null;
  return (
    <>
      <PageHead title="Watchlist" desc="Follow how a topic's opportunity changes over time. Each re-score is a standard scan (≈102 quota units).">
        {selected.size >= 2 && <button className="btn sm" onClick={compare}><Icon name="columns" />Compare {selected.size}</button>}
        <button className="btn sm primary" disabled={!items.length || Boolean(progress)} onClick={refreshAll}>
          <Icon name="refresh" />Re-score all{!status?.demo && items.length ? ` · ≈${items.length * 102} units` : ""}
        </button>
      </PageHead>
      <DemoBanner />
      <div className="card" style={{ marginBottom: 16 }}>
        <form className="row" onSubmit={(e) => { e.preventDefault(); add(); }}>
          <input className="input grow" placeholder="Add a topic to track" value={adding} onChange={(e) => setAdding(e.target.value)} />
          <button className="btn" disabled={!adding.trim()}><Icon name="plus" />Track topic</button>
        </form>
        {progress && (
          <div className="row" style={{ marginTop: 12 }}>
            <div className="progress-line grow"><i style={{ width: `${(progress.done / progress.total) * 100}%` }} /></div>
            <span className="small muted tabular">{progress.done} / {progress.total}</span>
            <button className="btn xs" onClick={() => { cancel.current = true; }}>Stop</button>
          </div>
        )}
      </div>
      {items.length ? (
        <div className="card flush">
          <div className="table-wrap bare">
            <table className="data">
              <thead><tr><th style={{ width: 32 }} /><th>Topic</th><th>Score</th><th>Trend</th><th className="num">Last change</th><th className="num">Since added</th><th>Verdict</th><th className="num">Last checked</th><th /></tr></thead>
              <tbody>{items.map((t) => {
                const h = t.history, last = h[h.length - 1];
                return (
                  <tr key={t.keyword} className={selected.has(t.keyword) ? "selected" : ""}>
                    <td><input type="checkbox" aria-label={`Select ${t.keyword}`} checked={selected.has(t.keyword)} disabled={!last}
                      onChange={(e) => { const s = new Set(selected); if (e.target.checked) s.add(t.keyword); else s.delete(t.keyword); setSelected(s); }} /></td>
                    <td><a href={last ? `#/report/${last.scan_id}` : analyzeLink(t.keyword)} style={{ fontWeight: 500 }}>{t.keyword}</a></td>
                    <td><ScorePill score={last?.score} /></td>
                    <td><Sparkline values={h.map((p) => p.score)} /></td>
                    <td className="num"><Delta value={h.length > 1 ? last.score - h[h.length - 2].score : null} /></td>
                    <td className="num"><Delta value={h.length > 1 ? last.score - h[0].score : null} /></td>
                    <td className="t2">{last?.verdict ?? "Not scored yet"}</td>
                    <td className="num muted nowrap">{last ? ago(last.t) : "–"}</td>
                    <td className="right nowrap">
                      <button className="btn xs ghost" disabled={busy === t.keyword || Boolean(progress)} onClick={() => refreshOne(t.keyword)}>
                        {busy === t.keyword ? <span className="spinner" /> : <Icon name="refresh" />}Re-score</button>
                      <button className="btn xs ghost danger" title="Stop tracking" onClick={() => remove(t.keyword)}><Icon name="trash" /></button>
                    </td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        </div>
      ) : (
        <Empty icon="eye" title="No tracked topics" actions={<a className="btn sm" href="#/analyze">Analyze a topic</a>}>
          Use <b style={{ display: "inline", margin: 0 }}>Track</b> on any report, or add a topic above. Re-score periodically to see whether the opportunity is opening up or closing.
        </Empty>
      )}
    </>
  );
}
