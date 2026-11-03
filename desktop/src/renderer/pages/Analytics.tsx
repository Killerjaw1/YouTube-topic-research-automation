import { useEffect, useState } from "react";
import type { Overview } from "../../core/analytics";
import { call, connectAnalytics } from "../api";
import { BarChart, Dl, RetentionChart } from "../components/charts";
import { Icon } from "../components/Icon";
import { Empty, go, Loading, Reasons, type Route, Seg, Thumb, useApp } from "../components/ui";
import { fmt, fmtDur, TONE_COLOR } from "../format";

export function useConnectAnalytics() {
  const { toast, fail, refresh } = useApp();
  return async (after?: () => void) => {
    toast("Your browser is opening Google sign-in. Approve read-only access, then come back here.", "info", 9000);
    try {
      const info = await connectAnalytics();
      toast(`YouTube Analytics connected${info?.title ? `: ${info.title}` : ""}!`);
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

  if (error) return <Empty icon="x" title="Couldn't load analytics">{error}<div className="row" style={{ justifyContent: "center", marginTop: 12 }}><a className="btn" href="#/settings">Open Settings</a></div></Empty>;
  if (!ov || !st) return <Loading title="Loading your channel analytics…" />;
  const t = ov.totals, p = ov.previous;
  const delta = (a?: number, b?: number) => {
    if (!b || a == null) return null;
    const d = ((a - b) / b) * 100;
    return <span className="small" style={{ color: d >= 0 ? "var(--great)" : "var(--bad)" }}>{d >= 0 ? "▲" : "▼"} {Math.abs(d).toFixed(0)}%</span>;
  };
  const ctr = ov.ctr?.ctr != null ? (ov.ctr.ctr <= 1 ? ov.ctr.ctr * 100 : ov.ctr.ctr) : null;
  const tot = ov.traffic.reduce((a, x) => a + x.views, 0) || 1;
  const openRetention = (v: any) => modal((close) => <RetentionView video={v} demo={ov.demo} close={close} />, true);

  return (
    <>
      {ov.demo ? (
        <div className="banner"><Icon name="info" />
          <div className="grow"><b>Preview with sample data. </b><span className="t2">Connect YouTube Analytics to see your real retention, watch time, traffic sources and personalised tips.</span></div>
          {st.desktop && (st.has_client ? <button className="btn sm primary" onClick={() => connect(load)}><Icon name="link" />Connect YouTube Analytics</button>
            : <a className="btn sm primary" href="#/settings">Set up connection</a>)}
        </div>
      ) : (
        <div className="row" style={{ marginBottom: 16 }}>
          <div className="avatar" style={{ width: 36, height: 36 }}>{ov.channel?.thumb ? <img src={ov.channel.thumb} alt="" /> : "Y"}</div>
          <div><b>{ov.channel?.title ?? "Your channel"}</b><div className="small muted">{ov.start} → {ov.end}</div></div>
        </div>
      )}
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 16 }}>
        <Seg value={days} onChange={(d) => go(`#/analytics?days=${d}`)} options={[[7, "7 days"], [28, "28 days"], [90, "90 days"], [365, "12 months"]]} />
        <span className="small muted">YouTube Analytics data lags 1–2 days.</span>
      </div>
      <div className="grid g4" style={{ marginBottom: 16 }}>
        <div className="card tile"><div className="label">Views</div><div className="value">{fmt(t.views)}</div><div className="foot">{delta(t.views, p.views)} vs previous period</div></div>
        <div className="card tile"><div className="label">Watch time</div><div className="value">{fmt((t.estimatedMinutesWatched ?? 0) / 60)} h</div>
          <div className="foot">{delta(t.estimatedMinutesWatched, p.estimatedMinutesWatched)} · avg {fmtDur(Math.round(t.averageViewDuration ?? 0))} per view</div></div>
        <div className="card tile"><div className="label">Avg. % viewed</div><div className="value">{(t.averageViewPercentage ?? 0).toFixed(1)}%</div><div className="foot">Retention. Aim for 50%+</div></div>
        <div className="card tile"><div className="label">{ctr != null ? "Thumbnail CTR" : "Net subscribers"}</div>
          <div className="value">{ctr != null ? ctr.toFixed(1) + "%" : fmt((t.subscribersGained ?? 0) - (t.subscribersLost ?? 0))}</div>
          <div className="foot">{ctr != null ? `${fmt(ov.ctr!.impressions)} impressions · typical 4–8%` : "CTR: see YouTube Studio → Reach"}</div></div>
      </div>
      <div className="grid g-report" style={{ marginBottom: 16 }}>
        <div className="card"><h3>Daily views</h3><p className="sub">Hover a bar for the day's numbers</p>
          <BarChart data={ov.daily.map((d) => ({
            label: d.day, value: d.views,
            tip: <><b>{new Date(d.day + "T00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</b>
              <Dl rows={[["Views", fmt(d.views)], ["Watch time", `${fmt(d.estimatedMinutesWatched / 60)} h`], ["Subscribers", `+${d.subscribersGained}`]]} /></>,
          }))} />
        </div>
        <div className="card"><h3>What to do next</h3><p className="sub">Tips from your own numbers</p><Reasons items={ov.insights} /></div>
      </div>
      <div className="grid g-report">
        <div className="card">
          <div className="card-head"><div><h3>Your top videos</h3><p className="sub">Click a video to see its audience retention curve and where viewers drop off</p></div></div>
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Video</th><th className="num">Views</th><th className="num">Avg. viewed</th><th className="num">Avg. duration</th><th className="num">Subs</th></tr></thead>
              <tbody>{ov.videos.map((v) => {
                const avp = v.averageViewPercentage ?? 0;
                return (
                  <tr key={v.video} style={{ cursor: "pointer" }} onClick={() => openRetention(v)}>
                    <td><div className="vid-cell" style={{ minWidth: 220 }}><Thumb v={{ ...v, channel_title: v.title }} /><div className="t">{v.title}</div></div></td>
                    <td className="num">{fmt(v.views)}</td>
                    <td className="num"><div className="row" style={{ justifyContent: "flex-end", flexWrap: "nowrap", gap: 8 }}>
                      <div className="meter" style={{ width: 60 }}><i style={{ width: `${Math.min(100, avp)}%`, background: TONE_COLOR[avp >= 50 ? "great" : avp >= 35 ? "warn" : "bad"] }} /></div>{avp.toFixed(0)}%</div></td>
                    <td className="num">{fmtDur(Math.round(v.averageViewDuration ?? 0))}</td>
                    <td className="num">+{fmt(v.subscribersGained)}</td>
                  </tr>
                );
              })}
              {!ov.videos.length && <tr><td colSpan={5} className="empty">No video data in this period.</td></tr>}</tbody>
            </table>
          </div>
        </div>
        <div className="card"><h3>Traffic sources</h3><p className="sub">How viewers found your videos</p>
          <div className="stack" style={{ gap: 10 }}>
            {ov.traffic.slice(0, 9).map((x) => (
              <div key={x.insightTrafficSourceType}>
                <div className="row small" style={{ justifyContent: "space-between", marginBottom: 4 }}><span>{x.label}</span>
                  <span className="muted">{fmt(x.views)} · <b style={{ color: "var(--text)" }}>{((x.views / tot) * 100).toFixed(0)}%</b></span></div>
                <div className="meter" style={{ height: 8 }}><i style={{ width: `${(x.views / ov.traffic[0].views) * 100}%`, background: "var(--s-small)" }} /></div>
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
      <h3>{video.title}</h3>
      {error ? <div className="t2">{error}</div> : !data ? <Loading title="Loading retention…" /> : <>
        <p className="sub" style={{ margin: 0 }}>Share of viewers still watching at each point of the video. Above 100% means people rewound to rewatch.</p>
        <RetentionChart points={data.points.map((p) => ({ x: p.elapsedVideoTimeRatio, y: p.audienceWatchRatio }))} durationS={video.duration_s} />
        <Reasons items={data.insights} />
      </>}
      <div className="foot"><button className="btn" onClick={close}>Close</button></div>
    </>
  );
}
