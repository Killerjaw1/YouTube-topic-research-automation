import { useEffect, useState } from "react";
import type { Overview } from "../../core/analytics";
import { call, connectAnalytics } from "../api";
import { BarChart, Dl, RetentionChart } from "../components/charts";
import { Icon } from "../components/Icon";
import { Empty, go, Loading, PageHead, Reasons, type Route, Seg, Thumb, useApp } from "../components/ui";
import { fmt, fmtDur, TONE_COLOR } from "../format";

export function useConnectAnalytics() {
  const { toast, fail, refresh } = useApp();
  return async (after?: () => void) => {
    toast("Continue in your browser to sign in with Google.", "info", 9000);
    try {
      const info = await connectAnalytics();
      toast(`YouTube Analytics connected${info?.title ? ` for ${info.title}` : ""}`);
      await refresh();
      after?.();
    } catch (e) { fail(e); }
  };
}

export function AnalyticsPage({ route }: { route: Route }) {
  const { modal, fail } = useApp();
  const connect = useConnectAnalytics();
  const days = Number(route.params.get("days")) || 28;
  const [st, setSt] = useState<{ connected: boolean; has_client: boolean; desktop: boolean } | null>(null);
  const [ov, setOv] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const load = () => {
    setOv(null);
    call("analyticsStatus").then(setSt).catch(fail);
    call("analyticsOverview", days).then(setOv).catch((e) => setError(e.message));
  };
  useEffect(load, [days]); // eslint-disable-line

  const head = (
    <PageHead title="Analytics" desc={ov && !ov.demo ? `${ov.channel?.title ?? "Your channel"} · ${ov.start} to ${ov.end}` : "Channel performance from YouTube Analytics. Data is typically 1–2 days behind."}>
      <Seg value={days} onChange={(d) => go(`#/analytics?days=${d}`)} options={[[7, "7D"], [28, "28D"], [90, "90D"], [365, "12M"]]} />
    </PageHead>
  );
  if (error) return <>{head}<Empty icon="x" title="Analytics couldn't be loaded" actions={<a className="btn sm" href="#/settings">Open settings</a>}>{error}</Empty></>;
  if (!ov || !st) return <>{head}<Loading title="Loading channel analytics" rows={6} /></>;

  const t = ov.totals, p = ov.previous;
  const delta = (a?: number, b?: number) => {
    if (!b || a == null) return null;
    const d = ((a - b) / b) * 100;
    return <span className={`delta ${d >= 0 ? "up" : "down"}`}>{d >= 0 ? "+" : "−"}{Math.abs(d).toFixed(0)}%</span>;
  };
  const ctr = ov.ctr?.ctr != null ? (ov.ctr.ctr <= 1 ? ov.ctr.ctr * 100 : ov.ctr.ctr) : null;
  const tot = ov.traffic.reduce((a, x) => a + x.views, 0) || 1;
  const openRetention = (v: any) => modal((close) => <RetentionView video={v} demo={ov.demo} close={close} />, true);

  return (
    <>
      {head}
      {ov.demo && (
        <div className="banner"><Icon name="info" />
          <div className="grow"><b>Sample data. </b>Connect YouTube Analytics to see your channel's retention, watch time and traffic sources.</div>
          {st.desktop && (st.has_client ? <button className="btn xs" onClick={() => connect(load)}>Connect</button> : <a className="btn xs" href="#/settings">Set up</a>)}
        </div>
      )}
      <div className="kpis" style={{ marginBottom: 16 }}>
        <div className="kpi"><div className="label">Views</div><div className="value">{fmt(t.views)}</div><div className="foot">{delta(t.views, p.views)} vs. previous period</div></div>
        <div className="kpi"><div className="label">Watch time (hours)</div><div className="value">{fmt((t.estimatedMinutesWatched ?? 0) / 60)}</div>
          <div className="foot">{delta(t.estimatedMinutesWatched, p.estimatedMinutesWatched)} · {fmtDur(Math.round(t.averageViewDuration ?? 0))} average view</div></div>
        <div className="kpi"><div className="label">Average percentage viewed</div><div className="value">{(t.averageViewPercentage ?? 0).toFixed(1)}%</div><div className="foot">50% or more is strong</div></div>
        <div className="kpi"><div className="label">{ctr != null ? "Impressions click-through rate" : "Net subscribers"}</div>
          <div className="value">{ctr != null ? ctr.toFixed(1) + "%" : fmt((t.subscribersGained ?? 0) - (t.subscribersLost ?? 0))}</div>
          <div className="foot">{ctr != null ? `${fmt(ov.ctr!.impressions)} impressions · typical range 4–8%` : "Click-through rate: see YouTube Studio → Reach"}</div></div>
      </div>
      <div className="grid g-report" style={{ marginBottom: 16 }}>
        <div className="card"><h3>Daily views</h3><p className="sub">{ov.start} to {ov.end}</p>
          <BarChart data={ov.daily.map((d) => ({
            label: d.day, value: d.views,
            tip: <><b>{new Date(d.day + "T00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</b>
              <Dl rows={[["Views", fmt(d.views)], ["Watch time", `${fmt(d.estimatedMinutesWatched / 60)} h`], ["Subscribers", `+${d.subscribersGained}`]]} /></>,
          }))} />
        </div>
        <div className="card"><h3 style={{ marginBottom: 10 }}>Insights</h3><Reasons items={ov.insights} /></div>
      </div>
      <div className="grid g-report">
        <div className="card flush">
          <div className="card-head"><div><h3>Top videos</h3><p className="sub">Select a video to see its audience retention</p></div></div>
          <div className="table-wrap bare">
            <table className="data">
              <thead><tr><th>Video</th><th className="num">Views</th><th className="num">Avg. % viewed</th><th className="num">Avg. view</th><th className="num">Subscribers</th></tr></thead>
              <tbody>{ov.videos.map((v) => {
                const avp = v.averageViewPercentage ?? 0;
                return (
                  <tr key={v.video} style={{ cursor: "pointer" }} onClick={() => openRetention(v)}>
                    <td><div className="vid-cell" style={{ minWidth: 220 }}><Thumb v={{ ...v, channel_title: v.title }} /><div className="t">{v.title}</div></div></td>
                    <td className="num">{fmt(v.views)}</td>
                    <td className="num"><div className="row" style={{ justifyContent: "flex-end", flexWrap: "nowrap", gap: 8 }}>
                      <div className="meter" style={{ width: 52 }}><i style={{ width: `${Math.min(100, avp)}%`, background: TONE_COLOR[avp >= 50 ? "great" : avp >= 35 ? "warn" : "bad"] }} /></div>{avp.toFixed(0)}%</div></td>
                    <td className="num">{fmtDur(Math.round(v.averageViewDuration ?? 0))}</td>
                    <td className="num">+{fmt(v.subscribersGained)}</td>
                  </tr>
                );
              })}
              {!ov.videos.length && <tr><td colSpan={5} className="empty">No video data for this period.</td></tr>}</tbody>
            </table>
          </div>
        </div>
        <div className="card"><h3 style={{ marginBottom: 12 }}>Traffic sources</h3>
          <div className="stack" style={{ gap: 12 }}>
            {ov.traffic.slice(0, 9).map((x) => (
              <div key={x.insightTrafficSourceType}>
                <div className="row between small" style={{ marginBottom: 5 }}><span className="t2">{x.label}</span>
                  <span className="muted tabular">{fmt(x.views)} · <span style={{ color: "var(--text)" }}>{((x.views / tot) * 100).toFixed(0)}%</span></span></div>
                <div className="meter"><i style={{ width: `${(x.views / ov.traffic[0].views) * 100}%`, background: "var(--s-small)" }} /></div>
              </div>
            ))}
            {!ov.traffic.length && <div className="muted small">No traffic data.</div>}
          </div>
        </div>
      </div>
    </>
  );
}

function RetentionView({ video, demo, close }: { video: any; demo: boolean; close(): void }) {
  const [data, setData] = useState<{ points: any[]; insights: any[] } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { call("analyticsRetention", video.video, demo).then(setData).catch((e) => setError(e.message)); }, [video, demo]);
  return (
    <>
      <div><h3>Audience retention</h3><div className="small muted" style={{ marginTop: 2 }}>{video.title}</div></div>
      {error ? <div className="t2">{error}</div> : !data ? <Loading title="Loading retention" rows={3} /> : <>
        <RetentionChart points={data.points.map((p) => ({ x: p.elapsedVideoTimeRatio, y: p.audienceWatchRatio }))} durationS={video.duration_s} />
        <p className="small muted" style={{ margin: 0 }}>Share of viewers still watching at each point. Values above 100% mean viewers rewatched that section.</p>
        <Reasons items={data.insights} />
      </>}
      <div className="foot"><button className="btn" onClick={close}>Close</button></div>
    </>
  );
}
