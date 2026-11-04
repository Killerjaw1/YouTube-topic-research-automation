/**
 * Planning: posting rhythm, the best weekday to publish, goals with time estimates, the weekly summary and
 * early-hit detection for new uploads.
 */

import { median, round } from "./util";

const DAY = 86400000;

// ------------------------------------------------------------------- rhythm
export interface WeekCount { start: string; count: number }

/** Monday 00:00 of the week containing `d`, local time. */
export function weekStart(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Uploads per week for the last `weeks` weeks (oldest first), and the run of weeks with at least one upload. */
export function rhythm(published: (string | null)[], weeks = 12, now = new Date()): { weeks: WeekCount[]; streak: number; per_week: number } {
  const first = weekStart(new Date(now.getTime() - (weeks - 1) * 7 * DAY));
  const counts: WeekCount[] = Array.from({ length: weeks }, (_, i) => ({ start: iso(new Date(first.getTime() + i * 7 * DAY)), count: 0 }));
  for (const p of published) {
    if (!p) continue;
    const t = Date.parse(p);
    if (Number.isNaN(t) || t < first.getTime() || t > now.getTime()) continue;
    const i = Math.floor((weekStart(new Date(t)).getTime() - first.getTime()) / (7 * DAY));
    if (counts[i]) counts[i].count++;
  }
  // The current week counts toward the streak only once it has an upload.
  let streak = 0;
  for (let i = counts.length - 1; i >= 0; i--) {
    if (counts[i].count > 0) streak++;
    else if (i === counts.length - 1) continue;
    else break;
  }
  const total = counts.reduce((a, w) => a + w.count, 0);
  return { weeks: counts, streak, per_week: round(total / weeks, 1) };
}

// --------------------------------------------------------------- best weekday
export interface WeekdayStat { day: string; count: number; median_views: number; best: boolean }
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** Median views by the weekday a video was published. Needs a few videos per weekday to call a best day. */
export function weekdayStats(videos: { published_at: string | null; views: number }[]): { days: WeekdayStat[]; best: string | null; enough: boolean } {
  const by: number[][] = DAYS.map(() => []);
  for (const v of videos) {
    if (!v.published_at) continue;
    const t = new Date(v.published_at);
    if (Number.isNaN(t.getTime())) continue;
    by[(t.getDay() + 6) % 7].push(v.views);
  }
  const days = DAYS.map((day, i) => ({ day, count: by[i].length, median_views: Math.round(median(by[i])), best: false }));
  const eligible = days.filter((d) => d.count >= 2);
  const enough = eligible.length >= 3 && videos.length >= 10;
  if (enough) { const top = eligible.reduce((a, d) => (d.median_views > a.median_views ? d : a)); top.best = true; }
  return { days, best: enough ? days.find((d) => d.best)!.day : null, enough };
}

// --------------------------------------------------------------------- goals
export type GoalMetric = "subs" | "shorts_views90" | "watch_hours" | "uploads_week";
export const GOAL_LABEL: Record<GoalMetric, string> = {
  subs: "Subscribers", shorts_views90: "Shorts views in 90 days", watch_hours: "Watch hours in 12 months", uploads_week: "Uploads a week",
};
export interface Goal { id: string; metric: GoalMetric; target: number; by: string | null; created: number }
export interface GoalProgress extends Goal { current: number; pct: number; done: boolean; eta_days: number | null; on_track: boolean | null }

export interface Current { subs: number; subsPerDay: number; shortsViews90: number; shortsViewsPerDay: number; watchHours365: number; watchHoursPerDay: number; uploadsPerWeek: number }

export function goalProgress(g: Goal, c: Current, now = Date.now()): GoalProgress {
  const value = { subs: c.subs, shorts_views90: c.shortsViews90, watch_hours: c.watchHours365, uploads_week: c.uploadsPerWeek }[g.metric];
  const rate = { subs: c.subsPerDay, shorts_views90: c.shortsViewsPerDay, watch_hours: c.watchHoursPerDay, uploads_week: 0 }[g.metric];
  const done = value >= g.target;
  let eta: number | null = done ? 0 : null;
  if (!done && rate > 0) {
    if (g.metric === "shorts_views90" || g.metric === "watch_hours") {
      const win = g.metric === "shorts_views90" ? 90 : 365, steady = rate * win;
      eta = steady > g.target && steady > value ? Math.ceil((win * (g.target - value)) / (steady - value)) : null;
    } else eta = Math.ceil((g.target - value) / rate);
  }
  const daysLeft = g.by ? Math.ceil((Date.parse(g.by + "T23:59:59") - now) / DAY) : null;
  return { ...g, current: Math.round(value * 10) / 10, pct: Math.min(100, Math.round((value / Math.max(g.target, 1)) * 100)), done, eta_days: eta,
    on_track: done ? true : daysLeft == null ? null : eta != null && eta <= daysLeft };
}

// ----------------------------------------------------------- weekly summary
export interface WeeklySummary {
  start: string; end: string;
  views: number; views_change: number | null; watch_hours: number; subs: number;
  best: { title: string; views: number; video: string } | null;
  watchlist: { keyword: string; from: number; to: number }[];
  uploaded: string[]; planned: { title: string; planned_for: string }[];
  demo: boolean;
}

/** Sunday-to-Monday key for "has this week's summary been sent": the Monday's date. */
export const weekKey = (d = new Date()) => iso(weekStart(d));

// --------------------------------------------------------------- early hits
export interface EarlyHit { video: string; title: string; views: number; hours: number; multiple: number }

/**
 * New uploads (3 to 72 hours old) that already have more views than your typical video gets in total, judged
 * against uploads at least 6 days old. A clear sign a video is taking off while there's still time to follow up.
 */
export function earlyHits(uploads: { id: string; title: string; views: number; published_at: string | null }[], now = Date.now(), skip: Set<string> = new Set()): EarlyHit[] {
  const rows = uploads.filter((u) => u.published_at).map((u) => ({ ...u, hours: (now - Date.parse(u.published_at!)) / 3600000 }));
  const settled = rows.filter((r) => r.hours >= 24 * 6);
  if (settled.length < 3) return [];
  const typical = median(settled.map((r) => r.views));
  if (typical <= 0) return [];
  return rows.filter((r) => r.hours >= 3 && r.hours <= 72 && !skip.has(r.id) && r.views >= Math.max(300, typical))
    .map((r) => ({ video: r.id, title: r.title, views: r.views, hours: Math.round(r.hours), multiple: round(r.views / typical, 1) }))
    .sort((a, b) => b.multiple - a.multiple);
}
