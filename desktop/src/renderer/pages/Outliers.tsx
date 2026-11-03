import { useEffect, useState } from "react";
import type { OutlierResult } from "../../core/types";
import { call } from "../api";
import { Icon } from "../components/Icon";
import { analyzeLink, DemoBanner, Empty, FormatBadge, Loading, type Route, Thumb, useApp } from "../components/ui";
import { fmt, fmtAge, fmtDur } from "../format";

export function OutliersPage({ route }: { route: Route }) {
  const { status, refresh } = useApp();
  const [form, setForm] = useState({ keyword: route.params.get("q") ?? "", days: 90, max_subs: 0, format: "any" });
  const [state, setState] = useState<{ loading?: boolean; data?: OutlierResult; error?: string }>({});
  useEffect(() => { if (status && !form.max_subs) setForm((f) => ({ ...f, max_subs: status.small_max })); }, [status]); // eslint-disable-line
  const run = async (f = form) => {
    if (!f.keyword.trim()) return;
    setState({ loading: true });
    history.replaceState(null, "", "#/outliers?q=" + encodeURIComponent(f.keyword.trim()));
    try { setState({ data: await call("outliers", { ...f, keyword: f.keyword.trim(), max_subs: f.max_subs || null }) }); refresh(); }
    catch (e: any) { setState({ error: e.message }); }
  };
  useEffect(() => { if (form.keyword) run(); }, []); // eslint-disable-line

  return (
    <>
      <DemoBanner />
      <p className="page-intro">Find videos from small channels that blew past their subscriber count. These are proof that YouTube will push a newcomer on this
        topic, and they show which angle did it. ~102 units per search.</p>
      <div className="card" style={{ marginBottom: 16 }}>
        <form className="row" autoComplete="off" onSubmit={(e) => { e.preventDefault(); run(); }}>
          <input className="input" style={{ flex: 1, minWidth: 240 }} placeholder="Topic or niche, e.g. 'budget travel'" required value={form.keyword} onChange={(e) => setForm({ ...form, keyword: e.target.value })} />
          <select className="select" value={form.days} onChange={(e) => setForm({ ...form, days: +e.target.value })}>
            {[[7, "Last 7 days"], [30, "Last 30 days"], [90, "Last 90 days"], [365, "Last year"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <label className="row small muted" style={{ gap: 6 }}>Max subs
            <input className="input" type="number" min={100} step={1000} style={{ width: 120 }} value={form.max_subs || ""} onChange={(e) => setForm({ ...form, max_subs: +e.target.value })} /></label>
          <select className="select" value={form.format} onChange={(e) => setForm({ ...form, format: e.target.value })}>
            <option value="any">Any format</option><option value="long">Long-form</option><option value="short">Shorts</option>
          </select>
          <button className="btn primary"><Icon name="rocket" />Find outliers</button>
        </form>
      </div>
      {state.loading && <Loading title="Hunting for small-channel breakouts…" />}
      {state.error && <Empty icon="x" title="Search failed">{state.error}</Empty>}
      {state.data && <OutlierGrid data={state.data} />}
    </>
  );
}

export function OutlierGrid({ data }: { data: OutlierResult }) {
  const vids = data.videos;
  return (
    <>
      <div className="row" style={{ marginBottom: 14, justifyContent: "space-between" }}>
        <div><b>{vids.length} outlier{vids.length === 1 ? "" : "s"}</b> <span className="muted">from {data.scanned} most-viewed videos in the last {data.days} days · channels under {fmt(data.max_subs)} subs</span></div>
        <a className="btn sm" href={analyzeLink(data.keyword)}><Icon name="target" />Score “{data.keyword}”</a>
      </div>
      {vids.length ? (
        <div className="vgrid">
          {vids.map((v) => (
            <a key={v.id} className="vcard" href={v.url} target="_blank" rel="noopener">
              <div className="tw"><Thumb v={v} />
                <span className="mult">{v.outlier! >= 100 ? Math.round(v.outlier!) : v.outlier!.toFixed(1)}× subs</span>
                <span className="fmt"><FormatBadge format={v.format} /></span>
                {v.duration_s > 0 && <span className="dur">{fmtDur(v.duration_s)}</span>}
              </div>
              <div className="body">
                <div className="t">{v.title}</div>
                <div className="m"><span>{v.channel_title}</span><span>{fmt(v.subs)} subs</span></div>
                <div className="m"><span><b style={{ color: "var(--text)" }}>{fmt(v.views)}</b> views</span><span>{fmtAge(v.age_days)} ago</span></div>
                {v.multiple != null && <div className="m"><span>vs. channel average</span><b style={{ color: "var(--great)" }}>{v.multiple}×</b></div>}
              </div>
            </a>
          ))}
        </div>
      ) : (
        <Empty icon="rocket" title="No small-channel outliers here">Big channels own the most-viewed spots for this search. That's a warning sign, or a cue to try a narrower phrase.</Empty>
      )}
    </>
  );
}
