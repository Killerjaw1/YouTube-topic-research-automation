/**
 * Growth calculations from your own channel's numbers:
 * - Partner Program progress, with an estimate of when each requirement is met at your current pace
 * - which video lengths work best for you, and which videos bring subscribers
 * - edit notes: the moments in a retention curve where viewers leave or rewatch
 */

import type { ChannelVideo } from "./series";
import { median, round } from "./util";

// ------------------------------------------------------------ partner program
/**
 * YouTube Partner Program requirements as YouTube published them (2023–2025). YouTube changes these from time
 * to time, so the UI says so and points to YouTube Studio's Earn page for the official status.
 */
export interface YppTier { id: string; name: string; perks: string; subs: number; uploads90?: number; watchHours: number; shortsViews: number }
export const YPP_TIERS: YppTier[] = [
  { id: "early", name: "Early access", perks: "Memberships, Super Thanks, Super Chat and the Shopping affiliate program", subs: 500, uploads90: 3, watchHours: 3000, shortsViews: 3_000_000 },
  { id: "full", name: "Ad revenue sharing", perks: "Ads on your videos and Shorts, plus everything in early access", subs: 1000, watchHours: 4000, shortsViews: 10_000_000 },
];

export interface GrowthInput {
  subs: number;
  /** Net subscribers a day over the last 28 days. */
  subsPerDay: number;
  /** Shorts views in the last 90 days, and a day over the last 28. */
  shortsViews90: number; shortsViewsPerDay: number;
  /** Long-form watch hours in the last 365 days, and a day over the last 28. */
  watchHours365: number; watchHoursPerDay: number;
  uploads90: number;
}

export interface Requirement { id: string; label: string; current: number; target: number; done: boolean; eta_days: number | null }
export interface TierProgress { id: string; name: string; perks: string; done: boolean; requirements: Requirement[]; path: "shorts" | "watch" | null; eta_days: number | null }
export interface GrowthReport { input: GrowthInput; tiers: TierProgress[]; demo: boolean; checked: string }

/** Days until a growing total reaches `target` at `perDay`. */
function etaCount(current: number, target: number, perDay: number): number | null {
  if (current >= target) return 0;
  return perDay > 0 ? Math.ceil((target - current) / perDay) : null;
}

/**
 * Days until a rolling-window total (views in the last 90 days, hours in the last 365) reaches `target`, if your
 * daily pace holds. The window total moves linearly from today's value toward pace × window as old days drop out.
 */
export function etaRolling(current: number, target: number, perDay: number, windowDays: number): number | null {
  if (current >= target) return 0;
  const steady = perDay * windowDays;
  if (steady <= target || steady <= current) return null;
  return Math.ceil((windowDays * (target - current)) / (steady - current));
}

export function partnerProgress(g: GrowthInput): TierProgress[] {
  return YPP_TIERS.map((t) => {
    const subs: Requirement = { id: "subs", label: "Subscribers", current: g.subs, target: t.subs, done: g.subs >= t.subs, eta_days: etaCount(g.subs, t.subs, g.subsPerDay) };
    const shorts: Requirement = { id: "shorts", label: "Shorts views in the last 90 days", current: Math.round(g.shortsViews90), target: t.shortsViews, done: g.shortsViews90 >= t.shortsViews,
      eta_days: etaRolling(g.shortsViews90, t.shortsViews, g.shortsViewsPerDay, 90) };
    const watch: Requirement = { id: "watch", label: "Watch hours on long videos in the last 12 months", current: Math.round(g.watchHours365), target: t.watchHours, done: g.watchHours365 >= t.watchHours,
      eta_days: etaRolling(g.watchHours365, t.watchHours, g.watchHoursPerDay, 365) };
    const reqs = [subs];
    if (t.uploads90) reqs.push({ id: "uploads", label: "Public uploads in the last 90 days", current: g.uploads90, target: t.uploads90, done: g.uploads90 >= t.uploads90, eta_days: g.uploads90 >= t.uploads90 ? 0 : null });
    reqs.push(shorts, watch);
    // Views or hours: whichever path is done, or arrives sooner.
    const pathEta = (r: Requirement) => (r.done ? 0 : r.eta_days ?? Infinity);
    const path = pathEta(shorts) <= pathEta(watch) ? "shorts" : "watch";
    const best = path === "shorts" ? shorts : watch;
    const others = reqs.filter((r) => r.id !== "shorts" && r.id !== "watch");
    const done = others.every((r) => r.done) && best.done;
    const etas = [...others, best].map((r) => (r.done ? 0 : r.eta_days));
    const eta = done ? 0 : etas.some((e) => e == null) ? null : Math.max(...(etas as number[]));
    return { id: t.id, name: t.name, perks: t.perks, done, requirements: reqs, path: Number.isFinite(pathEta(best)) ? path : null, eta_days: eta };
  });
}

// ------------------------------------------------------------------ lengths
export interface LengthBucket { label: string; min: number; max: number; count: number; median_views: number; avg_viewed: number; best: boolean }
export interface LengthReport { format: "short" | "long"; buckets: LengthBucket[]; advice: string | null }

const SHORT_BUCKETS: [string, number, number][] = [["Under 20 s", 0, 20], ["20–34 s", 20, 35], ["35–49 s", 35, 50], ["50–60 s", 50, 61], ["1–3 min", 61, 181]];
const LONG_BUCKETS: [string, number, number][] = [["3–8 min", 181, 480], ["8–12 min", 480, 720], ["12–20 min", 720, 1200], ["20 min or more", 1200, Infinity]];

export function lengthReport(videos: ChannelVideo[], format: "short" | "long"): LengthReport {
  const pool = videos.filter((v) => v.duration_s > 0 && (format === "short" ? v.duration_s <= 180 : v.duration_s > 180));
  const buckets: LengthBucket[] = (format === "short" ? SHORT_BUCKETS : LONG_BUCKETS).map(([label, min, max]) => {
    const vs = pool.filter((v) => v.duration_s >= min && v.duration_s < max);
    const views = vs.reduce((a, v) => a + v.views, 0);
    return { label, min, max, count: vs.length, median_views: Math.round(median(vs.map((v) => v.views))),
      avg_viewed: views ? round(vs.reduce((a, v) => a + v.averageViewPercentage * v.views, 0) / views, 1) : 0, best: false };
  });
  const ranked = buckets.filter((b) => b.count >= 2).sort((a, b) => b.median_views - a.median_views || b.avg_viewed - a.avg_viewed);
  if (ranked.length >= 2) ranked[0].best = true;
  const best = ranked.length >= 2 ? ranked[0] : null;
  const what = format === "short" ? "Shorts" : "long videos";
  return {
    format, buckets,
    advice: best ? `Your ${what} of ${best.label.replace(" or more", "+")} do best: ${best.median_views.toLocaleString("en-US")} median views and ${Math.round(best.avg_viewed)}% watched. Aim new ${what} at that length.`
      : pool.length ? `Publish a few more ${what} of different lengths to see which works best.` : null,
  };
}

export interface SubscriberDriver { video: string; title: string; thumbnail: string; views: number; subs: number; per_k: number }

/** Videos that turn viewers into subscribers best (with enough views to count), and the channel's average. */
export function subscriberDrivers(videos: ChannelVideo[], limit = 5): { drivers: SubscriberDriver[]; channel_per_k: number } {
  const views = videos.reduce((a, v) => a + v.views, 0);
  const subs = videos.reduce((a, v) => a + (v.subscribersGained ?? 0), 0);
  const floor = Math.max(100, median(videos.map((v) => v.views)) * 0.2);
  const drivers = videos.filter((v) => v.views >= floor && v.subscribersGained > 0)
    .map((v) => ({ video: v.video, title: v.title, thumbnail: v.thumbnail, views: v.views, subs: v.subscribersGained, per_k: round((v.subscribersGained / v.views) * 1000, 2) }))
    .sort((a, b) => b.per_k - a.per_k).slice(0, limit);
  return { drivers, channel_per_k: views ? round((subs / views) * 1000, 2) : 0 };
}

// --------------------------------------------------------------- edit notes
export interface EditNote { at_s: number; to_s: number; kind: "cut" | "keep"; text: string }

export const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

/** Where viewers leave fastest (worth tightening) and where they rewatch (worth reusing), from a retention curve. */
export function editNotes(points: { elapsedVideoTimeRatio: number; audienceWatchRatio: number }[], durationS: number, max = 3): EditNote[] {
  if (points.length < 10 || !durationS) return [];
  const p = [...points].sort((a, b) => a.elapsedVideoTimeRatio - b.elapsedVideoTimeRatio);
  const span = 3;
  const drops: { i: number; d: number }[] = [], rises: { i: number; d: number }[] = [];
  for (let i = 1; i + span < p.length; i++) {
    const d = p[i].audienceWatchRatio - p[i + span].audienceWatchRatio;
    if (d > 0.04) drops.push({ i, d });
    if (-d > 0.02) rises.push({ i, d: -d });
  }
  const pick = (list: { i: number; d: number }[]) => {
    const out: { i: number; d: number }[] = [];
    for (const x of list.sort((a, b) => b.d - a.d)) if (out.every((o) => Math.abs(o.i - x.i) > span * 2)) out.push(x);
    return out;
  };
  const t = (i: number) => p[i].elapsedVideoTimeRatio * durationS;
  const notes: EditNote[] = pick(drops).slice(0, max).map(({ i, d }) => ({
    at_s: t(i), to_s: t(i + span), kind: "cut",
    text: `${clock(t(i))}–${clock(t(i + span))}: ${Math.round(d * 100)}% of viewers leave here. Tighten or cut this part, or move the payoff earlier.`,
  }));
  for (const { i } of pick(rises).slice(0, 2)) {
    notes.push({ at_s: t(i), to_s: t(i + span), kind: "keep", text: `${clock(t(i))}: viewers go back and rewatch this. Reuse it as a hook, a thumbnail moment or a Short.` });
  }
  return notes.sort((a, b) => a.at_s - b.at_s);
}

// ------------------------------------------------------------- audience types
export interface AudienceReport {
  countries: { code: string; views: number; share: number }[];
  ages: { age: string; share: number }[];
  gender: { gender: string; share: number }[];
  devices: { device: string; share: number }[];
  demo: boolean;
}

export interface SearchTermsReport { terms: { term: string; views: number }[]; total: number; demo: boolean }

export interface SavedOpening { id: string; video: string; title: string; hold: number; at_s: number; line: string; saved: number }
