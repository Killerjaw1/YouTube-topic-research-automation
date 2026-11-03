import { useCallback, useEffect, useRef, useState } from "react";
import type { Tracked } from "../../core/types";
import { call } from "../api";
import { BarChart, Sparkline } from "../components/charts";
import { Button, Card, DetailPanel, Facts, StateCard } from "../components/kit";
import { Delta, DemoBanner, Empty, go, PageHead, ScorePill, useApp, Verdict } from "../components/ui";
import { ago } from "../format";

export function WatchlistPage() {
  const { status, fail, toast, refresh, panel } = useApp();
  const [items, setItems] = useState<Tracked[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState("");
  const cancel = useRef(false);
  const load = useCallback(() => call("listTracked").then((t) => { setItems(t); return t; }).catch((e) => { fail(e); return [] as Tracked[]; }), [fail]);
  useEffect(() => { load(); }, [load]);

  const refreshOne = async (k: string) => {
    setBusy(k);
    try {
      const t = await call("refreshTracked", k);
      const all = await load();
      refresh();
      if (t && panel.key === "topic:" + k) openDetail(all.find((x) => x.keyword === k) ?? t);
    } catch (e) { fail(e, "This topic couldn’t be re-scored"); } finally { setBusy(null); }
  };
  const refreshAll = async () => {
    if (!items?.length) return;
    cancel.current = false;
    setProgress({ done: 0, total: items.length });
    let done = 0;
    for (const t of items) {
      if (cancel.current) break;
      setBusy(t.keyword);
      try { await call("refreshTracked", t.keyword); } catch (e: any) { fail(e, "Re-scoring stopped"); if (/quota|key/i.test(e.message)) break; }
      setProgress({ done: ++done, total: items.length });
    }
    setBusy(null); setProgress(null);
    await load(); refresh();
    toast(`${done} ${done === 1 ? "topic" : "topics"} re-scored`);
  };
  const add = async () => {
    const k = adding.trim();
    if (!k) return;
    try { await call("track", k, null); setAdding(""); await refreshOne(k.toLowerCase()); toast("Topic added to your watchlist"); } catch (e) { fail(e); }
  };
  const remove = async (k: string) => {
    await call("untrack", k).catch(fail);
    if (panel.key === "topic:" + k) panel.close();
    load(); refresh();
    toast("Stopped tracking", "ok", k);
  };
  const compare = () => {
    const ids = (items ?? []).filter((t) => selected.has(t.keyword)).map((t) => t.history[t.history.length - 1]?.scan_id).filter(Boolean);
    go(`#/compare?ids=${ids.join(",")}`);
  };

  function openDetail(t: Tracked) {
    const h = t.history, last = h[h.length - 1];
    panel.open(
      <DetailPanel title={t.keyword} sub={`Tracked since ${ago(t.added, true)}`} onClose={panel.close}
        footer={<>
          <Button variant="primary" icon="refresh" busy={busy === t.keyword} onClick={() => refreshOne(t.keyword)}>Re-score</Button>
          {last && <Button href={`#/report/${last.scan_id}`}>Open report</Button>}
          <Button variant="ghost" className="danger" style={{ marginLeft: "auto" }} onClick={() => remove(t.keyword)}>Stop tracking</Button>
        </>}>
        {last ? <>
          <div className="row"><ScorePill score={last.score} big /><div><Verdict score={last.score}>{last.verdict}</Verdict><div className="secondary">Last checked {ago(last.t, true)}</div></div></div>
          {h.length > 1 ? (
            <div>
              <span className="section-label">Score history</span>
              <BarChart compact unit="score" latestLabel="Latest check" earlierLabel="Earlier checks"
                data={h.map((p) => ({ label: new Date(p.t * 1000).toISOString().slice(0, 10), value: p.score, tip: <><b>{ago(p.t)}</b><div>Score {p.score} · {p.verdict}</div></> }))} />
            </div>
          ) : <StateCard tone="accent" title="One check so far">Re-score this topic later to see whether the opportunity is opening up or closing.</StateCard>}
          <Facts rows={[["Checks", String(h.length)], ["Change since the last check", h.length > 1 ? <Delta value={last.score - h[h.length - 2].score} /> : "–"],
            ["Change since you started tracking", h.length > 1 ? <Delta value={last.score - h[0].score} /> : "–"], ["Data", last.demo ? "Sample" : "Live YouTube data"]]} />
        </> : <StateCard tone="warn" title="Not scored yet">Choose Re-score to analyze this topic for the first time.</StateCard>}
      </DetailPanel>,
      "topic:" + t.keyword,
    );
  }

  if (!items) return null;
  return (
    <>
      <PageHead title="Watchlist" desc="Follow how a topic’s opportunity changes over time. Each re-score is a standard scan of about 102 quota units.">
        {selected.size >= 2 && <Button icon="columns" onClick={compare}>Compare {selected.size}</Button>}
        <Button variant="primary" icon="refresh" busy={Boolean(progress)} disabled={!items.length} onClick={refreshAll}>
          Re-score all{!status?.demo && items.length ? ` (${items.length * 102} units)` : ""}
        </Button>
      </PageHead>
      <DemoBanner />
      <Card className="mb">
        <form className="row" onSubmit={(e) => { e.preventDefault(); add(); }}>
          <input className="input grow" placeholder="Add a topic to track" value={adding} onChange={(e) => setAdding(e.target.value)} aria-label="Topic to track" />
          <Button type="submit" icon="plus" disabled={!adding.trim()}>Track topic</Button>
        </form>
        {progress && (
          <div className="row mt-sm">
            <div className="progress-line grow"><i style={{ width: `${(progress.done / progress.total) * 100}%` }} /></div>
            <span className="secondary tabular">{progress.done} of {progress.total}</span>
            <Button size="sm" onClick={() => { cancel.current = true; }}>Stop</Button>
          </div>
        )}
      </Card>
      {items.length ? (
        <Card flush>
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th style={{ width: 36 }} /><th>Topic</th><th>Score</th><th>Trend</th><th className="num">Last change</th><th>Verdict</th><th className="num">Last checked</th></tr></thead>
              <tbody>{items.map((t) => {
                const h = t.history, last = h[h.length - 1];
                return (
                  <tr key={t.keyword} className="clickable" tabIndex={0} aria-selected={panel.key === "topic:" + t.keyword}
                    onClick={() => openDetail(t)} onKeyDown={(e) => { if (e.key === "Enter") openDetail(t); }}>
                    <td onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" aria-label={`Select ${t.keyword} to compare`} checked={selected.has(t.keyword)} disabled={!last}
                        onChange={(e) => { const s = new Set(selected); if (e.target.checked) s.add(t.keyword); else s.delete(t.keyword); setSelected(s); }} />
                    </td>
                    <td className="nowrap" style={{ fontWeight: 600 }}>{t.keyword}</td>
                    <td>{busy === t.keyword ? <span className="spinner" /> : <ScorePill score={last?.score} />}</td>
                    <td><Sparkline values={h.map((p) => p.score)} /></td>
                    <td className="num"><Delta value={h.length > 1 ? last.score - h[h.length - 2].score : null} /></td>
                    <td>{last ? <Verdict score={last.score}>{last.verdict}</Verdict> : <span className="status"><span className="dot" />Not scored yet</span>}</td>
                    <td className="num muted nowrap">{last ? ago(last.t) : "–"}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        </Card>
      ) : (
        <Empty icon="eye" title="No topics tracked yet" actions={<Button variant="primary" href="#/analyze">Analyze a topic</Button>}>
          Choose Track on any report, or add a topic above. Re-score it now and then to see whether the opportunity is growing.
        </Empty>
      )}
      {items.length > 0 && <p className="secondary mt">Select a topic for its score history. Tick two or more to compare them side by side. You can also start tracking from <a className="link" href="#/analyze">any report</a>.</p>}
    </>
  );
}
