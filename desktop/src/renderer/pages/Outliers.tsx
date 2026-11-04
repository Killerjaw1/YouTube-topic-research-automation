import { useEffect, useState } from "react";
import type { OutlierResult } from "../../core/types";
import { call } from "../api";
import { Button, Card, Tag } from "../components/kit";
import { analyzeLink, DemoBanner, Empty, FormatBadge, Loading, PageHead, type Route, Thumb, useApp } from "../components/ui";
import { VideoDetail } from "../components/VideoTable";
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
      <PageHead title="Outliers" desc="Recent videos from small channels that got far more views than their subscriber count, which shows YouTube recommends newcomers on that topic. Each search uses about 102 quota units." />
      <DemoBanner />
      <Card className="mb">
        <form className="row" autoComplete="off" onSubmit={(e) => { e.preventDefault(); run(); }}>
          <input className="input grow" style={{ minWidth: 220 }} placeholder="Topic or niche, such as budget travel" required value={form.keyword} aria-label="Topic"
            onChange={(e) => { const v = e.target.value; setForm((f) => ({ ...f, keyword: v })); }} />
          <select className="select" value={form.days} onChange={(e) => { const v = +e.target.value; setForm((f) => ({ ...f, days: v })); }} aria-label="Uploaded within">
            {[[7, "Last 7 days"], [30, "Last 30 days"], [90, "Last 90 days"], [365, "Last year"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <label className="row secondary" style={{ gap: 6 }}>Up to
            <input className="input" type="number" min={100} step="any" style={{ width: 110 }} value={form.max_subs || ""} aria-label="Maximum subscribers"
              onChange={(e) => { const v = +e.target.value; setForm((f) => ({ ...f, max_subs: v })); }} />subscribers</label>
          <select className="select" value={form.format} onChange={(e) => { const v = e.target.value; setForm((f) => ({ ...f, format: v })); }} aria-label="Format">
            <option value="any">Any format</option><option value="long">Long-form</option><option value="short">Shorts</option>
          </select>
          <Button type="submit" variant="primary" busy={state.loading}>Find outliers</Button>
        </form>
      </Card>
      {state.loading && <Loading title="Searching recent uploads" rows={5} />}
      {state.error && <Empty icon="warn" title="The search didn’t finish" actions={<Button onClick={() => run()}>Try again</Button>}>{state.error}</Empty>}
      {state.data && <OutlierGrid data={state.data} />}
      {!state.data && !state.loading && !state.error && (
        <Empty icon="rocket" title="Find small-channel breakouts">Enter a topic to see which small channels recently got far more views than their size, and what those videos were about.</Empty>
      )}
    </>
  );
}

export function OutlierGrid({ data }: { data: OutlierResult }) {
  const { panel } = useApp();
  const vids = data.videos;
  return (
    <>
      <div className="row between mb">
        <div><b>{vids.length} {vids.length === 1 ? "outlier" : "outliers"}</b> <span className="secondary">among the {data.scanned} most-viewed videos from the last {data.days} days, from channels with up to {fmt(data.max_subs)} subscribers</span></div>
        <Button href={analyzeLink(data.keyword)} icon="arrowRight">Analyze “{data.keyword}”</Button>
      </div>
      {vids.length ? (
        <div className="vgrid">
          {vids.map((v) => (
            <button key={v.id} type="button" className="vcard" aria-selected={panel.key === "video:" + v.id}
              onClick={() => panel.open(<VideoDetail v={v} onClose={panel.close} />, "video:" + v.id)}>
              <div className="tw"><Thumb v={v} large />
                <span className="overlay-tag"><Tag tone="ok">{v.outlier! >= 100 ? Math.round(v.outlier!) : v.outlier!.toFixed(1)}× subscribers</Tag></span>
                {v.duration_s > 0 && <span className="dur">{fmtDur(v.duration_s)}</span>}
              </div>
              <div className="body">
                <div className="title">{v.title}</div>
                <div className="meta"><span className="ellipsis">{v.channel_title}</span><span className="nowrap">{fmt(v.subs)} subscribers</span></div>
                <div className="meta"><span>{fmt(v.views)} views · {fmtAge(v.age_days)} ago</span><FormatBadge format={v.format} /></div>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <Empty icon="rocket" title="No small-channel outliers found">Large channels hold the most-viewed results for this search. Try a narrower phrase or a longer period.</Empty>
      )}
    </>
  );
}
