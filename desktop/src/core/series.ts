/**
 * Series and openings: what your own catalog says about what to make next.
 *
 * Series groups your videos by the subject they share in their titles ("Pac-Man", "Minecraft",
 * "lightning"), then compares each group with your typical video. Strong Shorts series become
 * long-form ideas, and strong long-form series become Shorts ideas.
 *
 * Openings compares how many viewers are still watching a few seconds in (3 s for Shorts,
 * 30 s for long videos), to show which openings hold people and which lose them.
 */

import { STOPWORDS } from "./scoring";
import { clamp, median, round } from "./util";

export interface ChannelVideo {
  video: string;
  title: string;
  thumbnail: string;
  views: number;
  averageViewPercentage: number;
  averageViewDuration: number;
  subscribersGained: number;
  duration_s: number;
  published_at: string | null;
}

export type SeriesVerdict = "more" | "steady" | "test" | "rethink";

export interface Series {
  name: string;
  keyword: string;
  videos: ChannelVideo[];
  views: number;
  share: number;
  per_video: number;
  vs_typical: number;
  avg_viewed: number;
  subs_per_k: number;
  shorts_share: number;
  best: ChannelVideo;
  verdict: SeriesVerdict;
}

export interface FormatIdea {
  format: "long" | "short";
  series: string;
  keyword: string;
  title: string;
  why: string;
}

export interface SeriesReport {
  start: string;
  end: string;
  videos: number;
  typical_views: number;
  avg_viewed: number;
  shorts_share: number;
  series: Series[];
  other: { videos: number; views: number };
  ideas: FormatIdea[];
  demo: boolean;
}

/** Words that appear in many titles without naming a subject. */
const THEME_STOP = new Set(
  `why what happens happened happen things thing really actually every ever time times made make makes making get got gets one two three
  know use used won't doesn't don't isn't aren't can't didn't never always old years year day days way ways people still even much many
  most weird weirdest strange crazy insane real reason reasons truth secret secrets hidden explained explain mistake mistakes unless
  you're it's that's there's here's has have had do does did let lets look looks need want try tried trying first last next another
  dangerous ever simple simply better worse best worst big bigger small tiny huge part episode ep vs`.split(/\s+/).filter(Boolean),
);

const SHORT_MAX_S = 180;

/** Lowercase words, without possessives ("Pac-Man's" is "pac", "man") and without contractions ("doesn't" is dropped). */
function words(title: string): string[] {
  return (title.toLowerCase().replace(/['’]s\b/g, "").match(/[a-z0-9]+(?:['’][a-z]+)?/g) ?? []).filter((w) => w.length > 1 && !/['’]/.test(w));
}

/** Subject terms in a title: meaningful single words and adjacent pairs ("pac man", "far lands"). */
export function subjectTerms(title: string): string[] {
  const ws = words(title);
  const ok = (w: string) => !STOPWORDS.has(w) && !THEME_STOP.has(w) && !/^\d+$/.test(w);
  const out = new Set<string>();
  ws.forEach((w, i) => {
    if (ok(w)) out.add(w);
    const n = ws[i + 1];
    if (n && ok(w) && ok(n)) out.add(`${w} ${n}`);
  });
  return [...out];
}

/** A short search seed for "more like this video": its first two-word subject ("pac man"), else its first subject word. */
export function seedFrom(title: string): string {
  const terms = subjectTerms(title);
  return terms.find((t) => t.includes(" ")) ?? terms[0] ?? title.trim();
}

/** The term as it's written in a title ("Pac-Man" for "pac man"), or title case if not found. */
function displayName(term: string, titles: string[]): string {
  const re = new RegExp(term.split(" ").map((w) => w.replace(/[^a-z0-9]/g, "")).join("[\\s\\-:]+"), "i");
  const found = titles.map((t) => t.match(re)?.[0]).filter((m): m is string => Boolean(m));
  const name = found.find((m) => /^[A-Z0-9]/.test(m)) ?? found[0] ?? term;
  return (name.charAt(0).toUpperCase() + name.slice(1)).replace(/\s+/g, " ");
}

const weightedViewed = (vs: ChannelVideo[]) => {
  const v = vs.reduce((a, x) => a + x.views, 0);
  return v ? vs.reduce((a, x) => a + x.averageViewPercentage * x.views, 0) / v : 0;
};

/** Group a channel's videos into series by shared subject, best-covered subjects first. */
export function groupSeries(videos: ChannelVideo[], maxSeries = 8): Omit<SeriesReport, "start" | "end" | "demo"> {
  const vids = videos.filter((v) => v.title && v.views >= 0);
  const typical = median(vids.map((v) => v.views)) || 1;
  const channelViewed = weightedViewed(vids);
  const totalViews = vids.reduce((a, v) => a + v.views, 0) || 1;
  const terms = new Map<string, Set<number>>();
  vids.forEach((v, i) => subjectTerms(v.title).forEach((t) => { if (!terms.has(t)) terms.set(t, new Set()); terms.get(t)!.add(i); }));

  // Pairs beat single words that cover the same videos ("pac man" over "pac"); then wider coverage, then more views.
  const viewsOf = (ix: Set<number>) => [...ix].reduce((a, i) => a + vids[i].views, 0);
  const ranked = [...terms.entries()]
    .filter(([, ix]) => ix.size >= 2)
    .sort(([ta, a], [tb, b]) => b.size - a.size || (tb.includes(" ") ? 1 : 0) - (ta.includes(" ") ? 1 : 0) || viewsOf(b) - viewsOf(a));

  const taken = new Set<number>();
  const series: Series[] = [];
  for (const [term, ix] of ranked) {
    if (series.length >= maxSeries) break;
    const free = [...ix].filter((i) => !taken.has(i));
    if (free.length < 2) continue;
    free.forEach((i) => taken.add(i));
    const vs = free.map((i) => vids[i]).sort((a, b) => b.views - a.views);
    const views = vs.reduce((a, v) => a + v.views, 0);
    const subs = vs.reduce((a, v) => a + (v.subscribersGained ?? 0), 0);
    const vsTypical = median(vs.map((v) => v.views)) / typical;
    const viewed = weightedViewed(vs);
    const verdict: SeriesVerdict = vsTypical >= 1.5 && viewed >= channelViewed - 8 ? "more"
      : vsTypical < 0.6 ? "rethink"
      : vs.length < 3 ? "test" : "steady";
    series.push({
      name: displayName(term, vs.map((v) => v.title)), keyword: term, videos: vs, views, share: round(views / totalViews, 3),
      per_video: Math.round(views / vs.length), vs_typical: round(vsTypical, 2), avg_viewed: round(viewed, 1),
      subs_per_k: round(views ? (subs / views) * 1000 : 0, 2), shorts_share: round(vs.filter((v) => isShort(v)).length / vs.length, 2),
      best: vs[0], verdict,
    });
  }
  series.sort((a, b) => b.views - a.views);
  const rest = vids.filter((_, i) => !taken.has(i));
  const shortsShare = vids.length ? vids.filter(isShort).length / vids.length : 0;
  const base = { videos: vids.length, typical_views: Math.round(typical), avg_viewed: round(channelViewed, 1), shorts_share: round(shortsShare, 2), series };
  return { ...base, other: { videos: rest.length, views: rest.reduce((a, v) => a + v.views, 0) }, ideas: formatIdeas(series) };
}

const isShort = (v: ChannelVideo) => v.duration_s > 0 && v.duration_s <= SHORT_MAX_S;

/**
 * Cross-format ideas: a strong Shorts series becomes a long-form deep dive (watch time, subscribers);
 * a strong long-form series becomes Shorts that point viewers back to it.
 */
export function formatIdeas(series: Series[]): FormatIdea[] {
  const ideas: FormatIdea[] = [];
  for (const s of series) {
    if (s.verdict === "rethink" || s.vs_typical < 0.9) continue;
    const n = s.videos.length;
    if (s.shorts_share >= 0.5 && n >= 2) {
      ideas.push({
        format: "long", series: s.name, keyword: s.keyword,
        title: n >= 4 ? `Every ${s.name} secret, explained` : `${s.name}: the full story`,
        why: `${n} Shorts, ${Math.round(s.per_video).toLocaleString("en-US")} views each on average, ${Math.round(s.avg_viewed)}% watched. An 8–12 minute video that collects and expands them gives Shorts viewers somewhere to go next, and each Short can link to it as its related video.`,
      });
    } else if (s.shorts_share < 0.5) {
      ideas.push({
        format: "short", series: s.name, keyword: s.keyword,
        title: `The most surprising ${s.name} moment, in 45 seconds`,
        why: `${n} long videos averaging ${Math.round(s.per_video).toLocaleString("en-US")} views. Cut the best moment from each into a Short and set the full video as its related video, so Shorts viewers find the long version.`,
      });
    }
  }
  return ideas.slice(0, 4);
}

// ------------------------------------------------------------------- openings
export interface OpeningPoint { elapsedVideoTimeRatio: number; audienceWatchRatio: number }
export interface Opening { video: string; title: string; thumbnail: string; views: number; duration_s: number; at_s: number; hold: number }
export interface OpeningsReport { openings: Opening[]; median_hold: number; insights: { type: "good" | "bad" | "info"; text: string }[]; demo: boolean }

/** Share of starting viewers still watching at `atS` seconds, read off the retention curve. */
export function holdAt(points: OpeningPoint[], durationS: number, atS: number): number | null {
  if (!points.length || !durationS) return null;
  const pts = [...points].sort((a, b) => a.elapsedVideoTimeRatio - b.elapsedVideoTimeRatio);
  const start = pts[0].audienceWatchRatio || 1;
  const x = clamp(atS / durationS, 0, 1);
  let y = pts[pts.length - 1].audienceWatchRatio;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    if (x <= b.elapsedVideoTimeRatio) {
      const t = b.elapsedVideoTimeRatio === a.elapsedVideoTimeRatio ? 0 : (x - a.elapsedVideoTimeRatio) / (b.elapsedVideoTimeRatio - a.elapsedVideoTimeRatio);
      y = a.audienceWatchRatio + t * (b.audienceWatchRatio - a.audienceWatchRatio);
      break;
    }
  }
  return round(clamp(y / Math.max(start, 1), 0, 1.5), 3);
}

/** The moment an opening is judged at: 3 seconds into a Short, 30 seconds into a long video. */
export const openingAt = (durationS: number) => (durationS > 0 && durationS <= SHORT_MAX_S ? 3 : 30);

export function openingInsights(list: Opening[]): OpeningsReport["insights"] {
  if (list.length < 3) return [{ type: "info", text: "Openings are compared once you have at least three videos with retention data." }];
  const sorted = [...list].sort((a, b) => b.hold - a.hold);
  const med = median(list.map((o) => o.hold));
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const quote = (o: Opening) => `“${o.title.slice(0, 60)}”`;
  const tips: OpeningsReport["insights"] = [];
  const top = sorted.slice(0, 2), low = sorted.slice(-2).reverse();
  tips.push({ type: "good", text: `Your strongest openings: ${top.map((o) => `${quote(o)} (${pct(o.hold)} still watching)`).join(" and ")}. Compare their first line and first shot with your weakest ones.` });
  if (low[0].hold < med - 0.08) tips.push({ type: "bad", text: `Your weakest openings: ${low.map((o) => `${quote(o)} (${pct(o.hold)})`).join(" and ")}. Viewers leave before the question or payoff lands.` });
  const shorts = list.filter((o) => o.at_s === 3);
  if (shorts.length >= 3 && median(shorts.map((o) => o.hold)) < 0.75) {
    tips.push({ type: "info", text: "On Shorts, say the question in the very first second and show the subject straight away. A slow first second is when most viewers swipe." });
  }
  return tips;
}
