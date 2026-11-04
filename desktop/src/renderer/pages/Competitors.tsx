/** Competitors: follow similar channels and see what's taking off for them; find collaborators near your size. */

import { useEffect, useState } from "react";
import type { CollabChannel, Competitor, CompetitorSummary, FeedVideo } from "../../core/competitors";
import { call } from "../api";
import { Button, Card, Chip, Status, Tag } from "../components/kit";
import { analyzeLink, DemoBanner, Empty, FormatBadge, go, Loading, PageHead, type Route, Thumb, useApp } from "../components/ui";
import { fmt, fmtAge } from "../format";
import { seedFrom } from "../../core/series";

const ago = (days: number) => (days < 1 ? "today" : `${fmtAge(days)} ago`);

export function CompetitorsPage({ route }: { route: Route }) {
  const tab = route.params.get("tab") === "collab" ? "collab" : "following";
  return (
    <>
      <PageHead title="Competitors" desc="Follow channels like yours to see what’s taking off for them, and find channels your size to collaborate with." />
      <DemoBanner />
      <div className="tabs" role="tablist" aria-label="Competitors">
        <button role="tab" aria-selected={tab === "following"} onClick={() => go("#/competitors")}>Following</button>
        <button role="tab" aria-selected={tab === "collab"} onClick={() => go("#/competitors?tab=collab")}>Find collaborators</button>
      </div>
      {tab === "collab" ? <CollabTab /> : <FollowingTab />}
    </>
  );
}

function FollowingTab() {
  const { fail, toast, refresh } = useApp();
  const [list, setList] = useState<Competitor[] | null>(null);
  const [adding, setAdding] = useState("");
  const [busy, setBusy] = useState(false);
  const [feed, setFeed] = useState<{ loading?: boolean; error?: string; channels?: CompetitorSummary[]; videos?: FeedVideo[] }>({});
  const [hotOnly, setHotOnly] = useState(false);
  const [channel, setChannel] = useState<string | null>(null);
  const loadFeed = () => {
    setFeed({ loading: true });
    call("competitorFeed").then((r) => { setFeed(r); refresh(); }).catch((e) => setFeed({ error: e.message }));
  };
  useEffect(() => { call("listCompetitors").then((l) => { setList(l); if (l.length) loadFeed(); }).catch(fail); }, []); // eslint-disable-line
  const add = async () => {
    if (!adding.trim()) return;
    setBusy(true);
    try { const l = await call("addCompetitor", adding.trim()); setList(l); setAdding(""); toast("Channel followed", "ok", l[l.length - 1]?.title); loadFeed(); }
    catch (e) { fail(e, "The channel couldn’t be added"); } finally { setBusy(false); }
  };
  const remove = async (c: Competitor) => {
    try { setList(await call("removeCompetitor", c.id)); setFeed((f) => ({ ...f, channels: f.channels?.filter((x) => x.id !== c.id), videos: f.videos?.filter((v) => v.channel_id !== c.id) })); toast("Unfollowed", "ok", c.title); }
    catch (e) { fail(e, "The channel wasn’t removed"); }
  };
  if (!list) return <Loading title="Loading followed channels" />;
  const videos = (feed.videos ?? []).filter((v) => (!hotOnly || v.hot) && (!channel || v.channel_id === channel));
  const hot = (feed.videos ?? []).filter((v) => v.hot).length;

  return (
    <>
      <Card className="mb">
        <form className="row" onSubmit={(e) => { e.preventDefault(); add(); }} autoComplete="off">
          <input className="input grow" style={{ minWidth: 220 }} value={adding} onChange={(e) => setAdding(e.target.value)} placeholder="@handle or channel URL of a channel like yours" aria-label="Channel to follow" />
          <Button type="submit" icon="plus" busy={busy} disabled={!adding.trim()}>Follow</Button>
          {list.length > 0 && <Button icon="refresh" busy={feed.loading} onClick={loadFeed}>Check for new uploads</Button>}
        </form>
        <p className="secondary" style={{ margin: "8px 0 0" }}>Each check uses about 2 quota units per channel. Results are kept for 12 hours.</p>
      </Card>
      {!list.length ? (
        <Empty icon="users" title="Follow a few channels like yours">Add 5–10 channels about your size that cover similar subjects. NicheRadar flags their uploads that beat their usual views, which shows what’s working right now.</Empty>
      ) : <>
        {feed.channels && (
          <div className="chips mb">
            <Chip pressed={!channel} onClick={() => setChannel(null)} count={feed.videos?.length}>All channels</Chip>
            {feed.channels.map((c) => <Chip key={c.id} pressed={channel === c.id} count={c.hot || undefined} onClick={() => setChannel(channel === c.id ? null : c.id)}>{c.title}</Chip>)}
          </div>
        )}
        <div className="grid g-report">
          <Card flush title={hotOnly ? `${videos.length} uploads taking off` : "Latest uploads"} sub={hot ? `${hot} ${hot === 1 ? "upload is" : "uploads are"} getting at least twice the channel’s usual views a day.` : "Compared with each channel’s usual views a day."}
            actions={<Button size="sm" variant={hotOnly ? "primary" : "default"} pressed={hotOnly} onClick={() => setHotOnly(!hotOnly)}>Taking off only</Button>}>
            {feed.loading ? <div style={{ padding: 14 }}><Loading title="Checking new uploads" rows={5} /></div>
              : feed.error ? <Empty icon="warn" title="Uploads couldn’t be loaded" actions={<Button onClick={loadFeed}>Try again</Button>}>{feed.error}</Empty>
              : videos.length ? (
                <div className="list">
                  {videos.slice(0, 60).map((v) => (
                    <div key={v.id} className="list-row">
                      <Thumb v={{ thumbnail: v.thumbnail, title: v.title, channel_title: v.channel_title }} />
                      <div className="body">
                        <div className="title">{v.title}</div>
                        <div className="secondary">{v.channel_title} · {fmt(v.views)} views · {ago(v.age_days)}{v.vs_usual != null ? ` · ${v.vs_usual}× usual` : ""}</div>
                      </div>
                      <div className="end">
                        {v.hot && <Tag tone="ok">Taking off</Tag>}
                        <FormatBadge format={v.format} />
                        <Button size="sm" variant="ghost" iconOnly icon="external" label="Open on YouTube" href={v.url} target="_blank" rel="noopener" />
                        <Button size="sm" href={analyzeLink(seedFrom(v.title), undefined, v.format)}>Analyze</Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : <Empty icon="play" title={hotOnly ? "Nothing taking off right now" : "No recent uploads"}>{hotOnly ? "None of the latest uploads beat their channel’s usual pace yet." : "Check again later."}</Empty>}
          </Card>
          <Card flush title={`${list.length} followed`} sub="Uploads a week and usual views a day, from their latest uploads.">
            <div className="list">
              {(feed.channels ?? list.map((c) => ({ ...c, median_vpd: 0, uploads_per_week: 0, latest_days: null, hot: 0 }))).map((c) => (
                <div key={c.id} className="list-row">
                  <span className="avatar">{c.thumb ? <img src={c.thumb} alt="" /> : c.title.charAt(0)}</span>
                  <div className="body"><div className="title">{c.title}</div>
                    <div className="secondary">{c.subs != null ? `${fmt(c.subs)} subscribers` : "Subscribers hidden"}{c.median_vpd ? ` · ${fmt(c.median_vpd)} views a day` : ""}{c.uploads_per_week ? ` · ${c.uploads_per_week} a week` : ""}</div></div>
                  <div className="end">
                    {c.hot > 0 && <Status tone="ok">{c.hot} taking off</Status>}
                    <Button size="sm" variant="ghost" iconOnly icon="external" label="Open channel" href={`https://www.youtube.com/channel/${c.id}`} target="_blank" rel="noopener" />
                    <Button size="sm" variant="ghost" iconOnly icon="trash" label={`Unfollow ${c.title}`} onClick={() => remove(c)} />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </>}
    </>
  );
}

function CollabTab() {
  const { status, fail, toast } = useApp();
  const [topic, setTopic] = useState("");
  const [state, setState] = useState<{ loading?: boolean; error?: string; channels?: CollabChannel[] }>({});
  const [followed, setFollowed] = useState<Set<string>>(new Set());
  useEffect(() => { call("listCompetitors").then((l) => setFollowed(new Set(l.map((c) => c.id)))).catch(() => undefined); }, []);
  const run = async () => {
    if (!topic.trim()) return;
    setState({ loading: true });
    try { setState({ channels: (await call("findCollaborators", topic)).channels }); } catch (e: any) { setState({ error: e.message }); }
  };
  const follow = async (c: CollabChannel) => {
    try { await call("addCompetitor", c.id); setFollowed(new Set([...followed, c.id])); toast("Channel followed", "ok", c.title); } catch (e) { fail(e, "The channel couldn’t be followed"); }
  };
  const mine = status?.my_channel?.subs;
  return (
    <>
      <Card className="mb">
        <form className="row" onSubmit={(e) => { e.preventDefault(); run(); }} autoComplete="off">
          <input className="input grow" style={{ minWidth: 220 }} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="A topic you’d collaborate on, such as retro game history" aria-label="Topic" />
          <Button type="submit" variant="primary" busy={state.loading} disabled={!topic.trim()}>Find channels</Button>
        </form>
        <p className="secondary" style={{ margin: "8px 0 0" }}>
          Finds channels covering the topic with {mine ? `between ${fmt(Math.max(100, mine / 3))} and ${fmt(Math.max(5000, mine * 3))} subscribers, near your ${fmt(mine)}` : "1K to 100K subscribers (add your channel in Settings to match your size)"}. About 102 quota units.
        </p>
      </Card>
      {state.loading && <Loading title="Looking for channels" rows={5} />}
      {state.error && <Empty icon="warn" title="Channels couldn’t be found" actions={<Button onClick={run}>Try again</Button>}>{state.error}</Empty>}
      {state.channels && (state.channels.length ? (
        <Card flush title={`${state.channels.length} possible collaborators`} sub="Channels with more videos on the topic come first. Contact details are on each channel’s About page.">
          <div className="list">
            {state.channels.map((c) => (
              <div key={c.id} className="list-row">
                <span className="avatar">{c.thumb ? <img src={c.thumb} alt="" /> : c.title.charAt(0)}</span>
                <div className="body"><div className="title">{c.title}</div>
                  <div className="secondary">{fmt(c.subs)} subscribers · {c.matches} {c.matches === 1 ? "video" : "videos"} on this topic · best: “{c.best_title.slice(0, 50)}” ({fmt(c.best_views)} views) · latest {ago(c.latest_days)}</div></div>
                <div className="end">
                  <Button size="sm" variant="ghost" href={`${c.url}/about`} target="_blank" rel="noopener">About</Button>
                  <Button size="sm" icon={followed.has(c.id) ? "check" : "plus"} disabled={followed.has(c.id)} onClick={() => follow(c)}>{followed.has(c.id) ? "Following" : "Follow"}</Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : <Empty icon="handshake" title="No channels your size found">Try a broader topic. Most results may be from channels much larger or smaller than yours.</Empty>)}
      {!state.channels && !state.loading && !state.error && (
        <Empty icon="handshake" title="Find channels to collaborate with">Collaborations with channels your size are one of the fastest ways to reach new viewers. Each side introduces the other to an audience that already likes the topic.</Empty>
      )}
    </>
  );
}
