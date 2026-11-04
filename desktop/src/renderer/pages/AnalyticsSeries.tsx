/** Analytics sections built from your whole catalog: series, ideas across formats, and openings. */

import { useEffect, useState } from "react";
import type { LengthReport, SavedOpening, SubscriberDriver } from "../../core/growth";
import type { Opening, OpeningsReport, Series, SeriesReport, SeriesVerdict } from "../../core/series";
import { call } from "../api";
import { Button, Card, DetailPanel, Facts, Status, Tag, type Tone } from "../components/kit";
import { analyzeLink, Empty, Loading, Reasons, Thumb, useApp } from "../components/ui";
import { ago, fmt, fmtDur } from "../format";

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
  const { fail, toast } = useApp();
  const [data, setData] = useState<OpeningsReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<SavedOpening[]>([]);
  useEffect(() => { call("listSavedOpenings").then(setSaved).catch(() => undefined); }, []);
  const save = async (o: Opening) => {
    try { setSaved(await call("saveOpening", { video: o.video, title: o.title, hold: o.hold, at_s: o.at_s })); toast("Opening saved", "ok", "Add the first line you said in the library below."); }
    catch (e) { fail(e, "The opening wasn’t saved"); }
  };
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
                    <Button size="sm" variant="ghost" iconOnly icon={saved.some((x) => x.video === o.video) ? "check" : "bookmark"} label="Save to opening library" onClick={() => save(o)} />
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
      <OpeningLibrary saved={saved} onChange={setSaved} />
    </Card>
  );
}

/** Openings you saved, with the first line you said, to reuse as templates (the Shorts script helper uses them too). */
function OpeningLibrary({ saved, onChange }: { saved: SavedOpening[]; onChange(list: SavedOpening[]): void }) {
  const { fail } = useApp();
  if (!saved.length) return <p className="secondary" style={{ margin: "var(--s4) 0 0" }}>Save strong openings with the bookmark button to build a library of first lines that work for you.</p>;
  const update = async (id: string, line: string) => { try { onChange(await call("updateSavedOpening", id, line)); } catch (e) { fail(e, "The line wasn’t saved"); } };
  const remove = async (id: string) => { try { onChange(await call("deleteSavedOpening", id)); } catch (e) { fail(e, "The opening wasn’t removed"); } };
  return (
    <div className="mt">
      <span className="section-label">Opening library</span>
      <div className="stack tight">
        {saved.map((o) => (
          <div key={o.id} className="row nowrap" style={{ alignItems: "flex-start" }}>
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="title" style={{ fontWeight: 600 }}>{o.title}</div>
              <div className="secondary">{Math.round(o.hold * 100)}% still watching at {o.at_s} s · saved {ago(o.saved, true)}</div>
              <input className="input mt-sm" style={{ width: "100%" }} defaultValue={o.line} placeholder="The first line you said, word for word"
                aria-label={`First line of ${o.title}`} onBlur={(e) => { if (e.target.value !== o.line) update(o.id, e.target.value); }} />
            </div>
            <Button size="sm" variant="ghost" iconOnly icon="trash" label="Remove from library" onClick={() => remove(o.id)} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Which lengths work best for you, and which videos turn viewers into subscribers. */
export function CatalogSection({ demo }: { demo: boolean }) {
  const [data, setData] = useState<{ short: LengthReport; long: LengthReport; drivers: SubscriberDriver[]; channel_per_k: number } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { call("analyticsCatalog", demo).then(setData).catch((e) => setError(e.message)); }, [demo]);
  if (error) return <Card className="mt" title="Length and subscribers"><p className="t2" style={{ margin: 0 }}>{error}</p></Card>;
  if (!data) return <div className="mt"><Loading title="Comparing your videos" rows={3} /></div>;
  const lengths = [data.short, data.long].filter((r) => r.buckets.some((b) => b.count));
  return (
    <div className="grid g-report mt">
      <Card title="Best length" sub="Your videos from the last 12 months, grouped by length. Median views per video.">
        {lengths.length ? lengths.map((r) => {
          const max = Math.max(1, ...r.buckets.map((b) => b.median_views));
          return (
            <div key={r.format} className="mb">
              <span className="section-label" style={{ marginTop: 0 }}>{r.format === "short" ? "Shorts" : "Long videos"}</span>
              <div className="stack tight">
                {r.buckets.filter((b) => b.count).map((b) => (
                  <div key={b.label}>
                    <div className="row between small mb-sm"><span className={b.best ? "" : "t2"} style={b.best ? { fontWeight: 600 } : undefined}>{b.label}{b.best && <span style={{ marginLeft: 6 }}><Tag tone="ok">Best</Tag></span>}</span>
                      <span className="muted tabular">{b.count} {b.count === 1 ? "video" : "videos"} · {fmt(b.median_views)} views · {Math.round(b.avg_viewed)}% watched</span></div>
                    <div className="meter"><i className={b.best ? "ok" : undefined} style={{ width: `${(b.median_views / max) * 100}%` }} /></div>
                  </div>
                ))}
              </div>
              {r.advice && <p className="secondary" style={{ margin: "8px 0 0" }}>{r.advice}</p>}
            </div>
          );
        }) : <p className="secondary" style={{ margin: 0 }}>No videos with views in the last 12 months yet.</p>}
      </Card>
      <Card title="What brings subscribers" sub={`Subscribers gained per 1,000 views. Your channel average is ${data.channel_per_k}.`}>
        {data.drivers.length ? (
          <div className="stack tight">
            {data.drivers.map((d) => (
              <div key={d.video} className="vid-cell">
                <Thumb v={{ thumbnail: d.thumbnail, title: d.title, channel_title: d.title }} />
                <div style={{ minWidth: 0 }}><div className="title">{d.title}</div>
                  <div className="secondary"><b style={{ color: "var(--text)" }}>{d.per_k}</b> per 1,000 views · +{fmt(d.subs)} from {fmt(d.views)} views</div></div>
              </div>
            ))}
            <p className="secondary" style={{ margin: "4px 0 0" }}>These topics and formats convert viewers best. Make more like them, and copy what their endings do.</p>
          </div>
        ) : <p className="secondary" style={{ margin: 0 }}>No subscribers gained from your videos in the last 12 months yet.</p>}
      </Card>
    </div>
  );
}
