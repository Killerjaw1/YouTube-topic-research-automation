/** Discover tabs: viewer questions from comments, On this day (Wikipedia), and Rising on Wikipedia. */

import { useEffect, useState } from "react";
import type { DayEvent, RisingArticle, ViewerQuestion } from "../../core/ideas";
import type { Focus } from "../../core/types";
import { call } from "../api";
import { scriptDialog } from "../components/ClaudeHelpers";
import { ideaModal } from "../components/IdeaModal";
import { Button, Card, ListRow, Switch, Tag } from "../components/kit";
import { analyzeLink, Empty, Loading, useApp } from "../components/ui";
import { fmt, store } from "../format";

/** Turn a question or an event into a search phrase worth analyzing: lowercase, no trailing punctuation. */
const toPhrase = (s: string) => s.replace(/[?!.]+$/, "").replace(/\s+/g, " ").trim().toLowerCase();

function IdeaActions({ topic, notes, title, planned }: { topic: string; notes?: string; title?: string; planned?: string }) {
  const { modal } = useApp();
  const focus = store<Focus>("focus") ?? "all";
  return <>
    <Button size="sm" variant="ghost" iconOnly icon="script" label="Write a script" onClick={() => scriptDialog(modal, { topic, title, notes })} />
    <Button size="sm" variant="ghost" iconOnly icon="bookmark" label="Save idea" onClick={() => ideaModal(modal, { title: title ?? topic, keyword: topic, notes, planned_for: planned ?? null })} />
    <Button size="sm" href={analyzeLink(topic, undefined, focus)}>Analyze</Button>
  </>;
}

// ------------------------------------------------------------ viewer questions
export function QuestionsTab() {
  const { status, refresh } = useApp();
  const [topic, setTopic] = useState(store<string>("questions-topic") ?? "");
  const [mine, setMine] = useState(store<boolean>("questions-mine") ?? true);
  const [state, setState] = useState<{ loading?: boolean; error?: string; data?: { questions: ViewerQuestion[]; videos: number; quota_cost: number } }>({});
  const hasChannel = Boolean(status?.my_channel);
  const cost = (topic.trim() ? 108 : 0) + (mine && hasChannel ? 13 : 0);
  const run = async () => {
    store("questions-topic", topic); store("questions-mine", mine);
    setState({ loading: true });
    try { setState({ data: await call("viewerQuestions", { topic, mine: mine && hasChannel }) }); refresh(); } catch (e: any) { setState({ error: e.message }); }
  };
  return (
    <>
      <Card className="mb">
        <form className="row" autoComplete="off" onSubmit={(e) => { e.preventDefault(); run(); }}>
          <input className="input grow" style={{ minWidth: 220 }} value={topic} onChange={(e) => setTopic(e.target.value)} aria-label="Topic"
            placeholder={hasChannel ? "A topic, or leave empty to read only your videos" : "A topic, such as retro game bugs"} />
          <label className="row secondary" style={{ gap: 8 }}><Switch label="Include my videos" checked={mine && hasChannel} disabled={!hasChannel} onChange={setMine} />My videos</label>
          <Button type="submit" variant="primary" busy={state.loading} disabled={!topic.trim() && !(mine && hasChannel)}>Find questions</Button>
        </form>
        <p className="secondary" style={{ margin: "8px 0 0" }}>
          Reads comments on {topic.trim() ? "the top 8 videos for the topic" : ""}{topic.trim() && mine && hasChannel ? " and " : ""}{mine && hasChannel ? "your 12 latest uploads" : ""}{!topic.trim() && !(mine && hasChannel) ? "videos" : ""} and
          collects the questions viewers ask. {cost ? `About ${cost} quota units.` : ""}{!hasChannel && " Add your channel in Settings to read your own comments."}
        </p>
      </Card>
      {state.loading && <Loading title="Reading comments" rows={6} />}
      {state.error && <Empty icon="warn" title="Questions couldn’t be collected" actions={<Button onClick={run}>Try again</Button>}>{state.error}</Empty>}
      {state.data && (state.data.questions.length ? (
        <Card flush title={`${state.data.questions.length} questions`} sub={`From ${state.data.videos} videos. Questions asked more than once come first; each is a ready-made explainer topic.`}>
          <div className="list">
            {state.data.questions.map((q, i) => (
              <ListRow key={i} title={q.question}
                secondary={[q.count > 1 ? `Asked ${q.count} times` : "", q.likes ? `${fmt(q.likes)} likes` : "", `on “${q.videoTitle.slice(0, 60)}”`].filter(Boolean).join(" · ")}
                end={<IdeaActions topic={toPhrase(q.question)} title={q.question} notes={`Viewer question on “${q.videoTitle}”: ${q.question}`} />} />
            ))}
          </div>
        </Card>
      ) : <Empty icon="chat" title="No questions found">These videos’ comments don’t ask much. Try a broader topic, or a topic with more discussion.</Empty>)}
      {!state.data && !state.loading && !state.error && (
        <Empty icon="chat" title="Find what viewers want to know">Comments are full of follow-up questions. Each one is a video idea with an audience already asking for it.</Empty>
      )}
    </>
  );
}

// ------------------------------------------------------------------ on this day
const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const ordinal = (n: number) => { const s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };

export function OnThisDayTab() {
  const [date, setDate] = useState(() => isoDay(new Date(Date.now() + 7 * 86400000)));
  const [filter, setFilter] = useState(store<string>("onthisday-filter") ?? "");
  const [roundOnly, setRoundOnly] = useState(false);
  const [state, setState] = useState<{ loading?: boolean; error?: string; events?: DayEvent[] }>({});
  useEffect(() => {
    let live = true;
    setState({ loading: true });
    call("dayEvents", date).then((r) => live && setState({ events: r.events })).catch((e) => live && setState({ error: e.message }));
    return () => { live = false; };
  }, [date]);
  const shift = (days: number) => { const d = new Date(date + "T12:00"); d.setDate(d.getDate() + days); setDate(isoDay(d)); };
  const words = filter.toLowerCase().split(/[\s,]+/).filter(Boolean);
  const list = (state.events ?? []).filter((e) => (!roundOnly || e.round) && (!words.length || words.some((w) => `${e.text} ${e.page} ${e.description}`.toLowerCase().includes(w))));
  const label = new Date(date + "T12:00").toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  return (
    <>
      <Card className="mb">
        <div className="row">
          <Button iconOnly icon="arrowLeft" label="Previous day" onClick={() => shift(-1)} />
          <input className="input" type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Date" style={{ width: 170 }} />
          <Button iconOnly icon="arrowRight" label="Next day" onClick={() => shift(1)} />
          <input className="input grow" style={{ minWidth: 200 }} value={filter} onChange={(e) => { setFilter(e.target.value); store("onthisday-filter", e.target.value); }}
            placeholder="Filter, such as game, space, science" aria-label="Filter events" />
          <label className="row secondary" style={{ gap: 8 }}><Switch label="Round anniversaries only" checked={roundOnly} onChange={setRoundOnly} />Round anniversaries</label>
        </div>
        <p className="secondary" style={{ margin: "8px 0 0" }}>Events on {label}, from Wikipedia. Videos about an anniversary get extra interest on the day, especially round ones like the 25th or 40th. Uses no quota.</p>
      </Card>
      {state.loading && <Loading title="Loading events" rows={6} />}
      {state.error && <Empty icon="warn" title="Events couldn’t be loaded" actions={<Button onClick={() => setDate(date.slice(0))}>Try again</Button>}>{state.error}</Empty>}
      {state.events && (list.length ? (
        <Card flush title={`${list.length} events on ${label}`} sub="Round anniversaries first. Saving one schedules it two days before the date on the planner.">
          <div className="list">
            {list.map((e) => (
              <ListRow key={e.text} title={e.text}
                leading={<div className="right" style={{ width: 56 }}><div className="tabular" style={{ fontWeight: 600 }}>{e.year}</div><div className="secondary">{e.years_ago > 0 ? `${e.years_ago} y ago` : ""}</div></div>}
                secondary={<>{e.round && <span style={{ marginRight: 6 }}><Tag tone="ok">{ordinal(e.years_ago)} anniversary</Tag></span>}{[e.page, e.description].filter(Boolean).join(" · ")}</>}
                end={<>
                  {e.url && <Button size="sm" variant="ghost" iconOnly icon="external" label="Open on Wikipedia" href={e.url} target="_blank" rel="noopener" />}
                  <IdeaActions topic={toPhrase(e.page || e.text)} title={e.round ? `${e.page}: ${ordinal(e.years_ago)} anniversary` : e.page || e.text}
                    notes={`${label}: ${e.text}${e.round ? ` (${ordinal(e.years_ago)} anniversary)` : ""}. Publish a few days before.`}
                    planned={(() => { const d = new Date(date + "T12:00"); d.setDate(d.getDate() - 2); return d >= new Date() ? isoDay(d) : date; })()} />
                </>} />
            ))}
          </div>
        </Card>
      ) : <Empty icon="calendar" title="No matching events">Clear the filter, or try another date.</Empty>)}
    </>
  );
}

// --------------------------------------------------------- rising on wikipedia
export function RisingTab() {
  const [filter, setFilter] = useState("");
  const [state, setState] = useState<{ loading?: boolean; error?: string; data?: { day: string; articles: RisingArticle[] } }>({ loading: true });
  const load = () => { setState({ loading: true }); call("risingWiki").then((data) => setState({ data })).catch((e) => setState({ error: e.message })); };
  useEffect(load, []);
  const words = filter.toLowerCase().split(/[\s,]+/).filter(Boolean);
  const list = (state.data?.articles ?? []).filter((a) => !words.length || words.some((w) => a.title.toLowerCase().includes(w)));
  return (
    <>
      <Card className="mb">
        <div className="row">
          <input className="input grow" style={{ minWidth: 200 }} value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter articles" aria-label="Filter articles" />
          <Button icon="refresh" onClick={load} busy={state.loading}>Refresh</Button>
        </div>
        <p className="secondary" style={{ margin: "8px 0 0" }}>English Wikipedia articles read far more {state.data ? `on ${new Date(state.data.day + "T12:00").toLocaleDateString(undefined, { month: "long", day: "numeric" })}` : "yesterday"} than the day before.
          A jump in curiosity often comes before the same topic trends on YouTube. Uses no quota.</p>
      </Card>
      {state.loading && <Loading title="Comparing Wikipedia’s reading figures" rows={6} />}
      {state.error && <Empty icon="warn" title="Rising articles couldn’t be loaded" actions={<Button onClick={load}>Try again</Button>}>{state.error}</Empty>}
      {state.data && (list.length ? (
        <Card flush title={`${list.length} rising articles`} sub="Biggest jumps first. New means it wasn’t among the most-read articles the day before.">
          <div className="list">
            {list.map((a) => (
              <ListRow key={a.title} title={a.title}
                leading={<div className="right" style={{ width: 64 }}><div className="tabular" style={{ fontWeight: 600 }}>{a.previous == null ? "New" : `${a.ratio}×`}</div><div className="secondary">{fmt(a.views)}</div></div>}
                secondary={a.previous == null ? `${fmt(a.views)} reads, new among the most-read` : `${fmt(a.views)} reads, up from ${fmt(a.previous)}`}
                end={<>
                  <Button size="sm" variant="ghost" iconOnly icon="external" label="Open on Wikipedia" href={a.url} target="_blank" rel="noopener" />
                  <IdeaActions topic={toPhrase(a.title)} title={a.title} notes={`Rising on Wikipedia: ${a.title} (${fmt(a.views)} reads in a day).`} />
                </>} />
            ))}
          </div>
        </Card>
      ) : <Empty icon="trend" title="Nothing rising that matches">Clear the filter, or check back tomorrow.</Empty>)}
    </>
  );
}
