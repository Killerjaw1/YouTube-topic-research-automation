/** Planner: a publishing calendar for your ideas, posting rhythm, the best day to publish, and goals. */

import { useCallback, useEffect, useState } from "react";
import { GOAL_LABEL, type GoalMetric, type GoalProgress, type WeekCount, type WeekdayStat } from "../../core/planner";
import type { Idea } from "../../core/types";
import { call } from "../api";
import { ideaModal, STATUS_META } from "../components/IdeaModal";
import { Button, Card, Dialog, Status, Tag } from "../components/kit";
import { Empty, Loading, PageHead, useApp } from "../components/ui";
import { fmt } from "../format";
import { IdeaEditor } from "./Ideas";

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const short = (day: string) => new Date(day + "T12:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

interface Stats { weeks: WeekCount[]; streak: number; per_week: number; weekday: { days: WeekdayStat[]; best: string | null; enough: boolean }; source: string }

export function PlannerPage() {
  const { modal, panel, fail, toast } = useApp();
  const [ideas, setIdeas] = useState<Idea[] | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [drop, setDrop] = useState<string | null>(null);
  const reload = useCallback(() => call("listIdeas").then((d) => { setIdeas(d.ideas); return d.ideas; }).catch((e) => { fail(e); return [] as Idea[]; }), [fail]);
  useEffect(() => { reload(); call("plannerStats").then(setStats).catch(() => undefined); }, [reload]);

  const open = (i: Idea) => panel.open(
    <IdeaEditor idea={i} onClose={panel.close} onSaved={async () => { const list = await reload(); const fresh = list.find((x) => x.id === i.id); if (fresh) open(fresh); }} />, "idea:" + i.id);
  const schedule = async (id: number, day: string | null) => {
    const idea = ideas?.find((i) => i.id === id);
    if (!idea || idea.planned_for === day) return;
    setIdeas((list) => list!.map((i) => (i.id === id ? { ...i, planned_for: day } : i)));
    try { await call("updateIdea", id, { planned_for: day }); toast(day ? `Planned for ${short(day)}` : "Removed from the calendar", "ok", idea.title); reload(); }
    catch (e) { fail(e, "The idea wasn’t moved"); reload(); }
  };

  if (!ideas) return <><PageHead title="Planner" /><Loading title="Loading your plan" /></>;
  const today = iso(new Date());
  const open_ = ideas.filter((i) => i.status !== "uploaded");
  const unscheduled = open_.filter((i) => !i.planned_for);
  const upcoming = ideas.filter((i) => i.planned_for && i.planned_for >= today).sort((a, b) => a.planned_for!.localeCompare(b.planned_for!));
  const overdue = open_.filter((i) => i.planned_for && i.planned_for < today);

  // Month grid: weeks start on Monday.
  const first = new Date(month);
  const lead = (first.getDay() + 6) % 7;
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => iso(new Date(month.getFullYear(), month.getMonth(), i + 1)))];
  while (cells.length % 7) cells.push(null);
  const byDay = new Map<string, Idea[]>();
  for (const i of ideas) if (i.planned_for) byDay.set(i.planned_for, [...(byDay.get(i.planned_for) ?? []), i]);
  const best = stats?.weekday.best;

  return (
    <>
      <PageHead title="Planner" desc="Schedule ideas, keep a steady rhythm and track your goals. Drag an idea onto a day to plan it.">
        <Button variant="primary" icon="plus" onClick={() => ideaModal(modal, { status: "idea", planned_for: today }, reload)}>New idea</Button>
      </PageHead>

      <div className="grid g3 mb">
        <Card title="Posting rhythm" sub={stats ? `${stats.per_week} uploads a week over the last 12 weeks.` : "Uploads a week."}>
          {stats ? <>
            <div className="minibars" role="img" aria-label="Uploads per week, last 12 weeks">
              {stats.weeks.map((w, i) => <i key={w.start} className={i === stats.weeks.length - 1 ? "current" : ""} style={{ height: `${Math.max(4, (w.count / Math.max(1, ...stats.weeks.map((x) => x.count))) * 100)}%` }} title={`Week of ${short(w.start)}: ${w.count}`} />)}
            </div>
            <p className="secondary" style={{ margin: "8px 0 0" }}>{stats.streak ? <><b style={{ color: "var(--text)" }}>{stats.streak}-week streak</b> of publishing every week.</> : "Publish this week to start a streak."}{stats.source === "sample" ? " Sample data." : ""}</p>
          </> : <Loading title="Counting uploads" rows={2} />}
        </Card>
        <Card title="Best day to publish" sub="Median views by the weekday a video went out.">
          {stats ? (stats.weekday.enough ? <>
            <div className="stack tight">
              {stats.weekday.days.filter((d) => d.count).map((d) => (
                <div key={d.day} className="row between small nowrap"><span className={d.best ? "" : "t2"} style={d.best ? { fontWeight: 600 } : undefined}>{d.day}{d.best && <span style={{ marginLeft: 6 }}><Tag tone="ok">Best</Tag></span>}</span>
                  <span className="muted tabular">{fmt(d.median_views)} · {d.count} {d.count === 1 ? "video" : "videos"}</span></div>
              ))}
            </div>
          </> : <p className="secondary" style={{ margin: 0 }}>Publish on a few different weekdays (10 or more videos) to see which works best. Connect YouTube Analytics for the most accurate figures.</p>)
            : <Loading title="Comparing weekdays" rows={2} />}
        </Card>
        <Card title="Next up" sub={overdue.length ? `${overdue.length} planned ${overdue.length === 1 ? "idea is" : "ideas are"} past their date.` : "Your next planned uploads."}>
          {upcoming.length ? (
            <div className="stack tight">
              {upcoming.slice(0, 4).map((i) => (
                <button key={i.id} type="button" className="row between nowrap link-row" onClick={() => open(i)}>
                  <span className="ellipsis" style={{ fontWeight: 600 }}>{i.title}</span><span className="muted small nowrap">{short(i.planned_for!)}</span>
                </button>
              ))}
            </div>
          ) : <p className="secondary" style={{ margin: 0 }}>Nothing planned yet. Give an idea a publish date{best ? `; ${best}s work best for you` : ""}.</p>}
        </Card>
      </div>

      <div className="grid g-report">
        <Card flush title={month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
          actions={<>
            <Button size="sm" variant="ghost" iconOnly icon="arrowLeft" label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} />
            <Button size="sm" variant="ghost" onClick={() => { const d = new Date(); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); }}>Today</Button>
            <Button size="sm" variant="ghost" iconOnly icon="arrowRight" label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} />
          </>}>
          <div className="cal" role="grid" aria-label="Publishing calendar">
            {WEEKDAYS.map((d) => <div key={d} className="cal-head" role="columnheader">{d}</div>)}
            {cells.map((day, k) => (
              <div key={day ?? `x${k}`} role="gridcell" className={`cal-day ${!day ? "empty" : ""} ${day === today ? "today" : ""} ${day && drop === day ? "drop" : ""} ${day && best && WEEKDAYS[(new Date(day + "T12:00").getDay() + 6) % 7] === best.slice(0, 3) ? "best" : ""}`}
                onDragOver={(e) => { if (day) { e.preventDefault(); setDrop(day); } }} onDragLeave={() => setDrop(null)}
                onDrop={(e) => { e.preventDefault(); setDrop(null); if (day) schedule(Number(e.dataTransfer.getData("text/plain")), day); }}>
                {day && <span className="num">{Number(day.slice(8))}</span>}
                {day && (byDay.get(day) ?? []).map((i) => (
                  <button key={i.id} type="button" className="cal-item" draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", String(i.id))} onClick={() => open(i)}
                    title={i.title} style={{ borderLeftColor: `var(--${STATUS_META[i.status]?.[1] ?? "cat-1"})` }} aria-selected={panel.key === "idea:" + i.id}>
                    {i.status === "uploaded" ? "✓ " : ""}{i.title}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </Card>
        <Card flush title="Not scheduled" sub="Drag an idea onto a day, or open it to set a date.">
          <div className="list" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); schedule(Number(e.dataTransfer.getData("text/plain")), null); }}>
            {unscheduled.length ? unscheduled.map((i) => (
              <div key={i.id} className="list-row clickable" draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", String(i.id))} onClick={() => open(i)}
                role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") open(i); }} aria-selected={panel.key === "idea:" + i.id}>
                <span className="dot" style={{ background: `var(--${STATUS_META[i.status][1]})` }} />
                <div className="body"><div className="title">{i.title}</div><div className="secondary">{STATUS_META[i.status][0]}{i.score != null ? ` · score ${i.score}` : ""}</div></div>
              </div>
            )) : <p className="secondary" style={{ margin: 0, padding: 14 }}>Everything in progress has a date.</p>}
          </div>
        </Card>
      </div>

      <Goals />
    </>
  );
}

// ---------------------------------------------------------------------- goals
const inDays = (d: number) => (d <= 1 ? "about a day" : d < 14 ? `about ${d} days` : d < 70 ? `about ${Math.round(d / 7)} weeks` : `about ${Math.round(d / 30)} months`);

function Goals() {
  const { modal, fail } = useApp();
  const [data, setData] = useState<{ goals: GoalProgress[]; demo: boolean } | null>(null);
  const load = () => call("goalsProgress").then(setData).catch((e) => { setData({ goals: [], demo: true }); fail(e, "Goals couldn’t be loaded"); });
  useEffect(() => { load(); }, []); // eslint-disable-line
  const remove = async (id: string) => { try { await call("deleteGoal", id); load(); } catch (e) { fail(e, "The goal wasn’t removed"); } };
  return (
    <Card className="mt" title="Goals" sub="Progress at your pace over the last 28 days." actions={<Button size="sm" icon="plus" onClick={() => modal((close) => <GoalForm close={close} onSaved={load} />)}>Add goal…</Button>}>
      {!data ? <Loading title="Loading goals" rows={2} /> : data.goals.length ? (
        <div className="stack">
          {data.goals.map((g) => (
            <div key={g.id}>
              <div className="row between nowrap mb-sm">
                <span><b>{GOAL_LABEL[g.metric]}: {fmt(g.target)}</b><span className="muted">{g.by ? ` by ${new Date(g.by + "T12:00").toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}` : ""}</span></span>
                <span className="row nowrap" style={{ gap: 10 }}>
                  <span className="tabular muted small">{fmt(g.current)} of {fmt(g.target)}</span>
                  {g.done ? <Status tone="ok">Reached</Status> : g.on_track === false ? <Status tone="warn">Behind</Status> : g.eta_days != null ? <Status tone="accent">{inDays(g.eta_days)}</Status> : <Status tone="idle">{g.metric === "uploads_week" ? "Publish more often" : "Not at this pace"}</Status>}
                  <Button size="sm" variant="ghost" iconOnly icon="trash" label="Remove goal" onClick={() => remove(g.id)} />
                </span>
              </div>
              <div className="meter"><i className={g.done ? "ok" : g.on_track === false ? "warn" : undefined} style={{ width: `${g.pct}%` }} /></div>
            </div>
          ))}
          {data.demo && <p className="secondary" style={{ margin: 0 }}>Progress uses sample numbers until YouTube Analytics is connected.</p>}
        </div>
      ) : <Empty icon="trophy" title="No goals yet" actions={<Button variant="primary" onClick={() => modal((close) => <GoalForm close={close} onSaved={load} />)}>Add goal…</Button>}>Set a target, such as 1,000 subscribers by March, and see when you’ll reach it at your current pace.</Empty>}
    </Card>
  );
}

function GoalForm({ close, onSaved }: { close(): void; onSaved(): void }) {
  const { fail, toast } = useApp();
  const [metric, setMetric] = useState<GoalMetric>("subs");
  const [target, setTarget] = useState("1000");
  const [by, setBy] = useState("");
  const save = async () => {
    try { await call("addGoal", metric, Number(target), by || null); close(); toast("Goal added"); onSaved(); } catch (e) { fail(e, "The goal wasn’t added"); }
  };
  return (
    <Dialog title="Add a goal" desc="NicheRadar estimates when you’ll reach it from your last 28 days."
      footer={<><Button onClick={close}>Cancel</Button><Button variant="primary" disabled={!(Number(target) > 0)} onClick={save}>Add goal</Button></>}>
      <label className="field">Measure<select className="select" value={metric} onChange={(e) => setMetric(e.target.value as GoalMetric)}>
        {(Object.keys(GOAL_LABEL) as GoalMetric[]).map((m) => <option key={m} value={m}>{GOAL_LABEL[m]}</option>)}</select></label>
      <div className="form-row">
        <label className="field">Target<input className="input" type="number" min={1} step="any" value={target} onChange={(e) => setTarget(e.target.value)} /></label>
        <label className="field"><span>By <span className="hint">optional</span></span><input className="input" type="date" value={by} onChange={(e) => setBy(e.target.value)} /></label>
      </div>
    </Dialog>
  );
}
