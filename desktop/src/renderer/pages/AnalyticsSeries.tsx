/** Analytics sections built from your whole catalog: series, ideas across formats, and openings. */

import { useEffect, useState } from "react";
import type { OpeningsReport, Series, SeriesReport, SeriesVerdict } from "../../core/series";
import { call } from "../api";
import { Button, Card, DetailPanel, Facts, Status, Tag, type Tone } from "../components/kit";
import { analyzeLink, Empty, Loading, Reasons, Thumb, useApp } from "../components/ui";
import { fmt, fmtDur } from "../format";

const VERDICT: Record<SeriesVerdict, [Tone, string, string]> = {
  more: ["ok", "Make more", "Beats your typical video and holds viewers. Make the next one."],
  steady: ["accent", "Steady", "Performs about like your typical video."],
  test: ["idle", "Test again", "Only two videos so far. One more will show whether it’s a real series."],
  rethink: ["danger", "Rethink", "Gets well under your typical views. Try a different angle or a stronger opening."],
};

const formatOf = (s: Series) => (s.shorts_share >= 0.8 ? "Shorts" : s.shorts_share <= 0.2 ? "Long-form" : "Mixed");
const discoverLink = (seed: string, mode?: string) => `#/discover?seed=${encodeURIComponent(seed)}${mode ? `&mode=${mode}` : ""}`;

function SeriesPanel({ s, typical, onClose }: { s: Series; typical: number; onClose(): void }) {
  const [tone, word, line] = VERDICT[s.verdict];
  const mostlyShorts = s.shorts_share >= 0.5;
  return (
    <DetailPanel title={s.name} sub={`${s.videos.length} videos · ${formatOf(s)}`} onClose={onClose}
      footer={<>
        <Button variant="primary" icon="compass" href={discoverLink(s.keyword, "questions")}>Find more ideas</Button>
        <Button href={analyzeLink(s.keyword, undefined, mostlyShorts ? "long" : "short")}>Analyze as {mostlyShorts ? "long-form" : "Shorts"}</Button>
      </>}>
      <div><Status tone={tone}>{word}</Status><p className="secondary" style={{ margin: "4px 0 0" }}>{line}</p></div>
      <Facts rows={[["Views", fmt(s.views)], ["Views per video", `${fmt(s.per_video)} (${s.vs_typical}× your typical ${fmt(typical)})`],
        ["Watched on average", `${Math.round(s.avg_viewed)}%`], ["Subscribers per 1,000 views", String(s.subs_per_k)], ["Share of your views", `${Math.round(s.share * 100)}%`]]} />
      <div>
        <span className="section-label">Videos</span>
        <div className="stack tight">
          {s.videos.map((v) => (
            <div key={v.video} className="vid-cell">
              <Thumb v={{ thumbnail: v.thumbnail, title: v.title, channel_title: v.title }} />
              <div style={{ minWidth: 0 }}><div className="title">{v.title}</div>
                <div className="secondary">{fmt(v.views)} views · {Math.round(v.averageViewPercentage)}% watched · {fmtDur(v.duration_s)}</div></div>
            </div>
          ))}
        </div>
      </div>
    </DetailPanel>
  );
}

export function SeriesSection({ demo }: { demo: boolean }) {
  const { panel } = useApp();
  const [data, setData] = useState<SeriesReport | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { call("analyticsSeries", demo).then(setData).catch((e) => setError(e.message)); }, [demo]);

  if (error) return <Card title="Series" className="mt"><p className="t2" style={{ margin: 0 }}>{error}</p></Card>;
  if (!data) return <div className="mt"><Loading title="Grouping your videos into series" rows={4} /></div>;
  const open = (s: Series) => panel.open(<SeriesPanel s={s} typical={data.typical_views} onClose={panel.close} />, "series:" + s.keyword);

  return (
    <div className="grid g-report mt">
      <Card flush title="Series" sub={`Your videos from the last 12 months, grouped by the subject in their titles. Your typical video gets ${fmt(data.typical_views)} views.`}>
        {data.series.length ? (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Series</th><th className="num">Videos</th><th className="num">Views per video</th><th className="num hide-sm">Watched</th><th className="num hide-sm">Subs per 1K</th><th>Status</th></tr></thead>
              <tbody>{data.series.map((s) => {
                const [tone, word] = VERDICT[s.verdict];
                return (
                  <tr key={s.keyword} className="clickable" tabIndex={0} aria-selected={panel.key === "series:" + s.keyword}
                    onClick={() => open(s)} onKeyDown={(e) => { if (e.key === "Enter") open(s); }}>
                    <td style={{ minWidth: 150 }}><div style={{ fontWeight: 600 }}>{s.name}</div><div className="secondary">{formatOf(s)}</div></td>
                    <td className="num">{s.videos.length}</td>
                    <td className="num"><div>{fmt(s.per_video)}</div><div className="secondary">{s.vs_typical}× typical</div></td>
                    <td className="num hide-sm">{Math.round(s.avg_viewed)}%</td>
                    <td className="num hide-sm">{s.subs_per_k}</td>
                    <td className="nowrap"><Status tone={tone}>{word}</Status></td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        ) : (
          <Empty icon="columns" title="No series yet">Series appear once two or more of your videos share a subject in their titles.</Empty>
        )}
        {data.other.videos > 0 && <p className="secondary" style={{ margin: 0, padding: "10px 14px", borderTop: "1px solid var(--border-subtle)" }}>
          {data.other.videos} {data.other.videos === 1 ? "video doesn’t" : "videos don’t"} share a subject with another video yet.</p>}
      </Card>
      <FormatIdeas data={data} />
    </div>
  );
}

function FormatIdeas({ data }: { data: SeriesReport }) {
  const shortsChannel = data.shorts_share >= 0.5;
  return (
    <Card title={shortsChannel ? "Long-form ideas from your Shorts" : "Shorts ideas from your long videos"}
      sub={shortsChannel ? "Long videos earn more watch time and subscribers. Build them from series that already work." : "Shorts bring new viewers. Point them back to series that already work."}>
      {data.ideas.length ? (
        <div className="stack">
          {data.ideas.map((i) => (
            <div key={i.series + i.format}>
              <Tag tone={i.format === "long" ? "cat-1" : "cat-3"}>{i.format === "long" ? "Long-form" : "Short"}</Tag>
              <div style={{ fontWeight: 600, marginTop: 6 }}>{i.title}</div>
              <p className="secondary" style={{ margin: "4px 0 0" }}>{i.why}</p>
              <div className="row mt-sm">
                <Button size="sm" href={analyzeLink(i.keyword, undefined, i.format)}>Analyze as {i.format === "long" ? "long-form" : "Shorts"}</Button>
                <Button size="sm" variant="ghost" href={discoverLink(i.keyword, "questions")}>Find angles</Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="secondary" style={{ margin: 0 }}>Ideas appear once a series gets at least your typical views. Keep publishing and check back.</p>
      )}
    </Card>
  );
}

export function OpeningsSection({ demo }: { demo: boolean }) {
  const { fail } = useApp();
  const [data, setData] = useState<OpeningsReport | null>(null);
  const [busy, setBusy] = useState(false);
  const load = async () => {
    setBusy(true);
    try { setData(await call("analyticsOpenings", demo)); } catch (e) { fail(e, "Openings couldn’t be compared"); } finally { setBusy(false); }
  };
  const tone = (h: number) => (h >= 0.8 ? "ok" : h >= 0.65 ? "warn" : "danger");
  return (
    <Card className="mt" title="Openings" sub="How many viewers are still watching 3 seconds into a Short, or 30 seconds into a long video."
      actions={<Button size="sm" variant={data ? "ghost" : "primary"} icon="refresh" busy={busy} onClick={load}>{data ? "Check again" : "Compare openings"}</Button>}>
      {!data ? (
        <p className="secondary" style={{ margin: 0 }}>Compares your 12 most-viewed videos from the last year. It reads each video’s retention, so it takes a few seconds.</p>
      ) : data.openings.length ? (
        <div className="grid g-report">
          <div className="stack tight">
            {data.openings.map((o) => (
              <div key={o.video} className="vid-cell">
                <Thumb v={{ thumbnail: o.thumbnail, title: o.title, channel_title: o.title }} />
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="title">{o.title}</div>
                  <div className="row nowrap mt-sm">
                    <div className="meter grow"><i className={tone(o.hold)} style={{ width: `${Math.min(100, o.hold * 100)}%` }} /></div>
                    <span className="tabular small nowrap">{Math.round(o.hold * 100)}% at {o.at_s} s</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div><span className="section-label" style={{ marginTop: 0 }}>What it shows</span><Reasons items={data.insights} /></div>
        </div>
      ) : (
        <p className="secondary" style={{ margin: 0 }}>No retention data yet. YouTube needs a few days of views on a video before it reports retention.</p>
      )}
    </Card>
  );
}
