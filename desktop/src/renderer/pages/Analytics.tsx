import { useEffect, useState } from "react";
import type { Overview } from "../../core/analytics";
import { call, connectAnalytics } from "../api";
import { BarChart, RetentionChart } from "../components/charts";
import { Banner, Button, Card, DetailPanel, Facts, Segmented } from "../components/kit";
import { Empty, go, Loading, PageHead, Reasons, type Route, Thumb, useApp } from "../components/ui";
import { fmt, fmtDur } from "../format";

export function useConnectAnalytics() {
  const { toast, fail, refresh } = useApp();
  return async (after?: () => void) => {
    toast("Continue in your browser", "info", "Sign in with Google there, then come back here.");
    try {
      const info = await connectAnalytics();
      toast("YouTube Analytics connected", "ok", info?.title);
      await refresh();
      after?.();
    } catch (e) { fail(e, "YouTube Analytics isn’t connected"); }
  };
}

export function AnalyticsPage({ route }: { route: Route }) {
  const { fail, panel } = useApp();
  const connect = useConnectAnalytics();
  const days = Number(route.params.get("days")) || 28;
  const [st, setSt] = useState<{ connected: boolean; has_client: boolean; desktop: boolean } | null>(null);
  const [ov, setOv] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const load = () => {
    setOv(null); setError("");
    call("analyticsStatus").then(setSt).catch(fail);
    call("analyticsOverview", days).then(setOv).catch((e) => setError(e.message));
  };
  useEffect(load, [days]); // eslint-disable-line

  const head = (
    <PageHead title="Analytics" desc={ov && !ov.demo ? `${ov.channel?.title ?? "Your channel"}, ${ov.start} to ${ov.end}. YouTube’s figures are usually a day or two behind.` : "How your channel is doing, from YouTube Analytics. YouTube’s figures are usually a day or two behind."}>
      <Segmented label="Period" value={days} onChange={(d) => go(`#/analytics?days=${d}`)} options={[[7, "7 days"], [28, "28 days"], [90, "90 days"], [365, "12 months"]]} />
    </PageHead>
  );
  if (error) return <>{head}<Empty icon="warn" title="Analytics couldn’t be loaded" actions={<><Button onClick={load}>Try again</Button><Button variant="primary" href="#/settings">Open settings</Button></>}>{error}</Empty></>;
  if (!ov || !st) return <>{head}<Loading title="Loading channel analytics" rows={6} /></>;

  const t = ov.totals, p = ov.previous;
  const delta = (a?: number, b?: number) => {
    if (!b || a == null) return null;
    const d = ((a - b) / b) * 100;
    return <span className={`delta ${d >= 0 ? "up" : "down"}`}>{d >= 0 ? "+" : "−"}{Math.abs(d).toFixed(0)}%</span>;
  };
  const ctr = ov.ctr?.ctr != null ? (ov.ctr.ctr <= 1 ? ov.ctr.ctr * 100 : ov.ctr.ctr) : null;
  const tot = ov.traffic.reduce((a, x) => a + x.views, 0) || 1;
  const openRetention = (v: any) => panel.open(<RetentionPanel video={v} demo={ov.demo} onClose={panel.close} />, "video:" + v.video);

  return (
    <>
      {head}
      {ov.demo && (
        <Banner tone="warn" title="Showing sample data"
          actions={st.desktop ? (st.has_client ? <Button size="sm" variant="primary" onClick={() => connect(load)}>Connect YouTube Analytics</Button> : <Button size="sm" href="#/settings">Set up…</Button>) : undefined}>
          Connect YouTube Analytics to see your own retention, watch time and traffic sources.
        </Banner>
      )}
      <div className="kpis mb">
        <div className="kpi"><span className="label">Views</span><div className="value">{fmt(t.views)}</div><div className="secondary">{delta(t.views, p.views)} on the previous period</div></div>
        <div className="kpi"><span className="label">Watch time</span><div className="value">{fmt((t.estimatedMinutesWatched ?? 0) / 60)} h</div>
          <div className="secondary">{delta(t.estimatedMinutesWatched, p.estimatedMinutesWatched)} · {fmtDur(Math.round(t.averageViewDuration ?? 0))} average view</div></div>
        <div className="kpi"><span className="label">Average viewed</span><div className="value">{(t.averageViewPercentage ?? 0).toFixed(1)}%</div><div className="secondary">50% or more is strong</div></div>
        <div className="kpi"><span className="label">{ctr != null ? "Click-through rate" : "Net subscribers"}</span>
          <div className="value">{ctr != null ? ctr.toFixed(1) + "%" : fmt((t.subscribersGained ?? 0) - (t.subscribersLost ?? 0))}</div>
          <div className="secondary">{ctr != null ? `${fmt(ov.ctr!.impressions)} impressions · 4–8% is typical` : "Click-through rate is in YouTube Studio, under Reach"}</div></div>
      </div>
      <div className="grid g-report mb">
        <Card title="Daily views" sub="Hover over a bar for that day’s figures.">
          <BarChart latestLabel="Latest day" earlierLabel="Earlier days" data={ov.daily.map((d) => ({
            label: d.day, value: d.views,
            tip: <><div className="tt-title">{new Date(d.day + "T00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</div>
              <Facts rows={[["Views", fmt(d.views)], ["Watch time", `${fmt(d.estimatedMinutesWatched / 60)} h`], ["Subscribers", `+${d.subscribersGained}`]]} /></>,
          }))} />
        </Card>
        <Card title="What to work on"><Reasons items={ov.insights} /></Card>
      </div>
      <div className="grid g-report">
        <Card flush title="Top videos" sub="Select a video to see where viewers stop watching.">
          {ov.videos.length ? (
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th>Video</th><th className="num">Views</th><th className="num">Viewed</th><th className="num">Average view</th><th className="num">Subscribers</th></tr></thead>
                <tbody>{ov.videos.map((v) => {
                  const avp = v.averageViewPercentage ?? 0;
                  return (
                    <tr key={v.video} className="clickable" tabIndex={0} aria-selected={panel.key === "video:" + v.video}
                      onClick={() => openRetention(v)} onKeyDown={(e) => { if (e.key === "Enter") openRetention(v); }}>
                      <td><div className="vid-cell" style={{ minWidth: 220 }}><Thumb v={{ ...v, channel_title: v.title }} /><div className="title">{v.title}</div></div></td>
                      <td className="num">{fmt(v.views)}</td>
                      <td className="num"><div className="row nowrap" style={{ justifyContent: "flex-end" }}>
                        <div className="meter" style={{ width: 52 }}><i className={avp >= 50 ? "ok" : avp >= 35 ? "warn" : "danger"} style={{ width: `${Math.min(100, avp)}%` }} /></div>{avp.toFixed(0)}%</div></td>
                      <td className="num">{fmtDur(Math.round(v.averageViewDuration ?? 0))}</td>
                      <td className="num">+{fmt(v.subscribersGained)}</td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
          ) : <Empty icon="play" title="No videos in this period">Choose a longer period to see your top videos.</Empty>}
        </Card>
        <Card title="Traffic sources" sub="Where viewers found your videos.">
          <div className="stack tight">
            {ov.traffic.slice(0, 9).map((x) => (
              <div key={x.insightTrafficSourceType}>
                <div className="row between small mb-sm"><span className="t2">{x.label}</span>
                  <span className="muted tabular">{fmt(x.views)} · <span style={{ color: "var(--text)" }}>{((x.views / tot) * 100).toFixed(0)}%</span></span></div>
                <div className="meter"><i style={{ width: `${(x.views / ov.traffic[0].views) * 100}%` }} /></div>
              </div>
            ))}
            {!ov.traffic.length && <p className="secondary" style={{ margin: 0 }}>No traffic data for this period.</p>}
          </div>
        </Card>
      </div>
    </>
  );
}

function RetentionPanel({ video, demo, onClose }: { video: any; demo: boolean; onClose(): void }) {
  const [data, setData] = useState<{ points: any[]; insights: any[] } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { setData(null); call("analyticsRetention", video.video, demo).then(setData).catch((e) => setError(e.message)); }, [video, demo]);
  return (
    <DetailPanel title={video.title} sub="Audience retention" onClose={onClose}
      footer={!String(video.video).startsWith("demo") ? <Button variant="primary" icon="external" href={`https://studio.youtube.com/video/${video.video}/analytics`} target="_blank" rel="noopener">Open in YouTube Studio</Button> : undefined}>
      <Facts rows={[["Views", fmt(video.views)], ["Average viewed", `${(video.averageViewPercentage ?? 0).toFixed(0)}%`],
        ["Average view", fmtDur(Math.round(video.averageViewDuration ?? 0))], ["Length", fmtDur(video.duration_s) || "–"], ["Subscribers gained", `+${fmt(video.subscribersGained)}`]]} />
      {error ? <p className="t2" style={{ margin: 0 }}>{error}</p> : !data ? <Loading title="Loading retention" rows={3} /> : <>
        <div>
          <span className="section-label">Viewers still watching</span>
          <RetentionChart compact points={data.points.map((p) => ({ x: p.elapsedVideoTimeRatio, y: p.audienceWatchRatio }))} durationS={video.duration_s} />
          <p className="secondary" style={{ margin: "8px 0 0" }}>Above 100% means viewers went back and watched that part again.</p>
        </div>
        <div><span className="section-label">What it shows</span><Reasons items={data.insights} /></div>
      </>}
    </DetailPanel>
  );
}
