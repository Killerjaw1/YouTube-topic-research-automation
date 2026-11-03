/**
 * Opportunity scoring.
 *
 * The question this answers: *if a small channel uploads on this topic, will YouTube
 * show it to people, or will it hand the traffic to the big channels?*
 *
 * Four signals, each 0-100 (higher is better for you):
 *   Demand     - are people watching this topic right now? (median views/day)
 *   Breakout   - do small channels already win here? (small channels in the top 10,
 *                and small-channel videos far outperforming their size)
 *   Openness   - how much of the top of search do big channels hold?
 *   Freshness  - does YouTube surface new uploads, or is there a content gap?
 *
 * The Opportunity Score is a weighted blend with guard rails, so a topic nobody
 * watches can't score well just because nobody competes. See docs/SCORING.md.
 */

import { parseDuration } from "./youtube";
import type { FormatStats, Reason, Report, Settings, SizeClass, Subscores, Tone, VideoFormat, VideoRow } from "./types";
import { clamp, fmtNum, median, round } from "./util";

export const WEIGHTS: Subscores = { demand: 0.3, breakout: 0.3, openness: 0.25, freshness: 0.15 };

export const STOPWORDS = new Set(
  `a an the and or but if of to in on for with at by from up about into over after is are was were be been being this that these
  those it its i me my we our you your he she they them his her their what which who whom how why when where all any both each few
  more most other some such no nor not only own same so than too very can will just don should now vs vs. x de la el en le les et
  un une 2024 2025 2026 shorts short video videos new best top official full part ft feat |`.split(/\s+/).filter(Boolean),
);

export function tokens(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9']+/g) ?? []).filter((t) => !STOPWORDS.has(t) && t.length > 1);
}

/** YouTube doesn't expose "is this a Short". Heuristic: <=60s, or <=180s and tagged #shorts. */
export function classifyFormat(durationS: number, title: string, description = ""): VideoFormat {
  const text = `${title} ${description}`.toLowerCase();
  if (durationS && durationS <= 60) return "short";
  if (durationS && durationS <= 180 && text.includes("#short")) return "short";
  return "long";
}

/** Joins raw videos.list and channels.list items into flat rows with derived metrics. */
export function enrich(videos: any[], channels: any[], order?: string[]): VideoRow[] {
  const chMap = new Map(channels.map((c) => [c.id, c]));
  const now = Date.now();
  const rankOf = new Map((order ?? []).map((id, i) => [id, i + 1]));
  const rows: VideoRow[] = videos.map((v) => {
    const sn = v.snippet ?? {}, st = v.statistics ?? {};
    const ch = chMap.get(sn.channelId) ?? {};
    const cst = ch.statistics ?? {};
    const hidden = Boolean(cst.hiddenSubscriberCount);
    const subs = hidden || cst.subscriberCount == null ? null : parseInt(cst.subscriberCount, 10);
    const views = parseInt(st.viewCount ?? "0", 10) || 0;
    const likes = parseInt(st.likeCount ?? "0", 10) || 0;
    const comments = parseInt(st.commentCount ?? "0", 10) || 0;
    const published = sn.publishedAt ? Date.parse(sn.publishedAt) : now;
    const age = Math.max((now - published) / 86400000, 0.5);
    const duration = parseDuration(v.contentDetails?.duration);
    const chViews = parseInt(cst.viewCount ?? "0", 10) || 0;
    const chCount = parseInt(cst.videoCount ?? "0", 10) || 0;
    const avgViews = chCount ? chViews / chCount : null;
    const thumbs = sn.thumbnails ?? {};
    return {
      id: v.id,
      rank: rankOf.get(v.id) ?? null,
      title: sn.title ?? "",
      channel_id: sn.channelId ?? "",
      channel_title: sn.channelTitle ?? "",
      published_at: sn.publishedAt ?? null,
      age_days: round(age, 1),
      views, likes, comments,
      duration_s: duration,
      format: classifyFormat(duration, sn.title ?? "", sn.description ?? ""),
      thumbnail: (thumbs.medium ?? thumbs.high ?? thumbs.default ?? {}).url ?? "",
      subs,
      channel_videos: chCount,
      channel_avg_views: avgViews ? Math.floor(avgViews) : null,
      multiple: avgViews ? round(views / Math.max(avgViews, 50), 2) : null,
      vpd: round(views / age, 1),
      outlier: subs != null ? round(views / Math.max(subs, 100), 2) : null,
      engagement: views ? round(((likes + comments) / views) * 100, 2) : 0,
      url: `https://www.youtube.com/watch?v=${v.id}`,
      tags: (sn.tags ?? []).slice(0, 30),
    };
  });
  if (order) rows.sort((a, b) => (a.rank ?? 1e6) - (b.rank ?? 1e6));
  return rows;
}

export function sizeClass(subs: number | null, smallMax: number, bigMin: number): SizeClass {
  if (subs == null) return "unknown";
  if (subs < smallMax) return "small";
  if (subs >= bigMin) return "big";
  return "mid";
}

/**
 * A small-channel video that reached well past its own audience: real reach (5K+ views) and
 * either 3x+ the channel's subscribers or 4x+ the channel's average video.
 */
export function isBreakout(r: VideoRow, smallMax: number): boolean {
  if (r.subs == null || r.subs >= smallMax || r.views < 5000) return false;
  return r.views >= 3 * r.subs || (r.multiple ?? 0) >= 4;
}

/** With auto threshold on, "small" means channels within reach of yours (25x your size, 10K-250K). */
export function effectiveSmallMax(s: Settings): number {
  const mine = s.my_channel?.subs;
  if (s.auto_small_threshold && mine) return Math.round(clamp(mine * 25, 10000, 250000));
  return s.small_channel_max || 50000;
}

// 10 views/day -> 0, 100 -> 25, 1K -> 50, 10K -> 75, 100K+ -> 100
const demandScore = (vpd: number) => clamp(((Math.log10(vpd + 1) - 1) / 4) * 100);

function formatStats(rows: VideoRow[], smallMax: number): FormatStats {
  return {
    count: rows.length,
    median_vpd: round(median(rows.map((r) => r.vpd)), 1),
    median_views: Math.floor(median(rows.map((r) => r.views))),
    breakouts: rows.filter((r) => isBreakout(r, smallMax)).length,
    small_share: rows.length ? round(rows.filter((r) => r.subs != null && r.subs < smallMax).length / rows.length, 2) : 0,
  };
}

export function verdictFor(score: number): [string, Tone] {
  if (score >= 70) return ["Strong opportunity", "great"];
  if (score >= 55) return ["Good with the right angle", "good"];
  if (score >= 40) return ["Needs a distinct angle", "warn"];
  return ["Saturated or low demand", "bad"];
}

function recommendFormat(s: FormatStats, l: FormatStats) {
  if (s.count < 3 && l.count < 3) return { format: "either", why: "Not enough results to compare formats." };
  if (s.count < 3) return { format: "long", why: "Very few Shorts rank for this topic. Long-form dominates, although Shorts may be an untested gap." };
  if (l.count < 3) return { format: "short", why: "This topic is dominated by Shorts." };
  const sc = s.breakouts * 2 + s.small_share * 5 + Math.log10(s.median_vpd + 1);
  const lc = l.breakouts * 2 + l.small_share * 5 + Math.log10(l.median_vpd + 1);
  if (Math.abs(sc - lc) < 1) return { format: "both", why: "Shorts and long-form perform similarly. Use Shorts to direct viewers to a long-form video." };
  if (sc > lc) return { format: "short", why: `Shorts break out more often for small channels on this topic (${s.breakouts} vs. ${l.breakouts} breakouts).` };
  return { format: "long", why: `Long-form performs better for small channels on this topic (${l.breakouts} vs. ${s.breakouts} breakouts).` };
}

export function titleWords(titles: string[], exclude: Set<string>): { word: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const t of titles) {
    const toks = tokens(t).filter((w) => !exclude.has(w));
    const seen = new Set(toks);
    toks.slice(1).forEach((b, i) => seen.add(`${toks[i]} ${b}`));
    seen.forEach((w) => counts.set(w, (counts.get(w) ?? 0) + 1));
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14).filter(([, c]) => c >= 2).map(([word, count]) => ({ word, count }));
}

/** Score a topic from its ranked search results (rows) and optional recent-upload results. */
export function analyze(keyword: string, rows: VideoRow[], s: Settings, recentRows: VideoRow[] = []): Report {
  const smallMax = effectiveSmallMax(s);
  const bigMin = s.big_channel_min || 1_000_000;
  const freshDays = s.fresh_days || 180;
  for (const r of [...rows, ...recentRows]) {
    r.size = sizeClass(r.subs, smallMax, bigMin);
    r.breakout = isBreakout(r, smallMax);
  }
  const thresholds = { small_max: smallMax, big_min: bigMin, fresh_days: freshDays };
  if (!rows.length) {
    return {
      keyword, score: 0, verdict: "No results", tone: "bad", subscores: { demand: 0, breakout: 0, openness: 0, freshness: 0 },
      metrics: {}, reasons: [{ type: "bad", text: "YouTube returned no videos for this search." }], formats: {}, videos: [],
      recent: [], title_words: [], thresholds,
    };
  }
  const top10 = rows.slice(0, 10), top20 = rows.slice(0, 20);
  const reasons: Reason[] = [];

  // Demand
  const medianVpd = median(top20.map((r) => r.vpd));
  const recentPool = [...recentRows, ...rows].filter((r) => r.age_days <= 90);
  const recentVpd = recentPool.length ? median(recentPool.map((r) => r.vpd)) : 0;
  const demandVpd = Math.max(medianVpd, recentVpd * 0.9);
  const demand = demandScore(demandVpd);

  // Breakout
  const smallTop10 = top10.filter((r) => r.size === "small").length;
  const all = [...new Map([...rows, ...recentRows].map((r) => [r.id, r])).values()];
  const breakouts = all.filter((r) => r.breakout);
  const bestSmall = Math.max(0, ...all.filter((r) => r.size === "small").map((r) => r.outlier ?? 0));
  const breakout = clamp(smallTop10 * 7 + Math.min(breakouts.length, 6) * 6 + (bestSmall >= 10 ? 8 : 0));

  // Openness
  const domWeight: Record<SizeClass, number> = { big: 1, mid: 0.45, small: 0, unknown: 0.3 };
  let wsum = 0, dom = 0;
  top10.forEach((r, i) => {
    const w = 1 / Math.sqrt(i + 1);
    wsum += w;
    dom += w * domWeight[r.size ?? "unknown"];
  });
  const dominance = wsum ? dom / wsum : 0;
  const kwTokens = new Set(tokens(keyword));
  const saturation = top20.length && kwTokens.size
    ? top20.filter((r) => { const t = new Set(tokens(r.title)); return [...kwTokens].every((k) => t.has(k)); }).length / top20.length
    : 0;
  const bigTop10 = top10.filter((r) => r.size === "big").length;
  const openness = clamp((1 - dominance) * 100 - saturation * 15);

  // Freshness / content gap
  const freshShare = top20.filter((r) => r.age_days <= freshDays).length / top20.length;
  const medianAgeTop10 = median(top10.map((r) => r.age_days));
  const contentGap = freshShare < 0.3 && demand >= 45 && medianAgeTop10 > 365;
  const freshness = Math.max(freshShare * 100, contentGap ? 70 : 0);

  const subscores: Subscores = { demand, breakout, openness, freshness };
  let score = (Object.keys(WEIGHTS) as (keyof Subscores)[]).reduce((a, k) => a + subscores[k] * WEIGHTS[k], 0);
  if (demand < 15) score = Math.min(score, 38);
  if (bigTop10 >= 8 && smallTop10 === 0 && !breakouts.length) score = Math.min(score, 45);
  score = Math.round(clamp(score));
  const [verdict, tone] = verdictFor(score);

  // Reasons
  const f = fmtNum;
  if (demand >= 60) reasons.push({ type: "good", text: `High demand: top results average ${f(demandVpd)} views per day.` });
  else if (demand >= 35) reasons.push({ type: "info", text: `Moderate demand: top results average ${f(demandVpd)} views per day.` });
  else reasons.push({ type: "bad", text: `Low demand: top results average only ${f(demandVpd)} views per day.` });

  if (smallTop10 >= 3) reasons.push({ type: "good", text: `${smallTop10} of the top 10 results come from small channels (under ${f(smallMax)} subscribers), so YouTube ranks newer channels for this topic.` });
  else if (smallTop10 === 0) reasons.push({ type: "bad", text: `None of the top 10 results come from small channels (under ${f(smallMax)} subscribers).` });

  if (breakouts.length) {
    const b = breakouts.reduce((a, x) => ((x.outlier ?? 0) > (a.outlier ?? 0) ? x : a));
    reasons.push({ type: "good", text: `${breakouts.length} small-channel ${breakouts.length === 1 ? "video" : "videos"} broke out. The strongest, “${b.title.slice(0, 70)}”, reached ${f(b.views)} views on a channel with ${f(b.subs)} subscribers (${fmtNum(b.outlier ?? 0)}×).` });
  } else {
    reasons.push({ type: "bad", text: "No small-channel videos are outperforming their subscriber count." });
  }
  if (bigTop10 >= 6) reasons.push({ type: "bad", text: `Large channels (${f(bigMin)}+ subscribers) hold ${bigTop10} of the top 10 positions and are likely to be recommended over you for broad versions of this topic.` });
  else if (bigTop10 <= 2) reasons.push({ type: "good", text: `Only ${bigTop10} of the top 10 results come from large channels.` });
  if (saturation >= 0.6) reasons.push({ type: "bad", text: `${Math.round(saturation * 100)}% of top titles use this exact phrase. A narrower or differently worded angle will stand out more.` });
  if (contentGap) reasons.push({ type: "good", text: "Content gap: demand is high but most top videos are over a year old. An up-to-date video can compete." });
  else if (freshShare >= 0.5) reasons.push({ type: "good", text: `${Math.round(freshShare * 100)}% of top results are less than ${freshDays} days old, so new uploads can rank for this topic.` });
  else if (freshShare < 0.2) reasons.push({ type: "info", text: "Top results are mostly older videos with established rankings." });

  // Formats
  const short = formatStats(all.filter((r) => r.format === "short"), smallMax);
  const long = formatStats(all.filter((r) => r.format === "long"), smallMax);
  const winners = [...all].sort((a, b) => (b.outlier ?? 0) - (a.outlier ?? 0)).slice(0, 15);

  return {
    keyword,
    score,
    verdict,
    tone,
    subscores: { demand: Math.round(demand), breakout: Math.round(breakout), openness: Math.round(openness), freshness: Math.round(freshness) },
    metrics: {
      median_vpd: round(medianVpd, 1),
      recent_vpd: round(recentVpd, 1),
      small_in_top10: smallTop10,
      big_in_top10: bigTop10,
      breakouts: breakouts.length,
      best_small_outlier: bestSmall,
      dominance: round(dominance, 2),
      title_saturation: round(saturation, 2),
      fresh_share: round(freshShare, 2),
      median_age_top10: Math.round(medianAgeTop10),
      content_gap: contentGap,
      median_engagement: round(median(top20.map((r) => r.engagement)), 2),
      results: rows.length,
    },
    reasons,
    formats: { short, long, recommended: recommendFormat(short, long) },
    videos: rows,
    recent: recentRows,
    title_words: titleWords(winners.map((r) => r.title), kwTokens),
    thresholds,
  };
}

/** Videos from channels under maxSubs that beat their subscriber count, best ratio first. */
export function findOutliers(rows: VideoRow[], maxSubs: number, minViews = 1000): VideoRow[] {
  return rows
    .filter((r) => r.subs != null && r.subs <= maxSubs && r.views >= minViews && (r.outlier ?? 0) >= 1)
    .sort((a, b) => (b.outlier ?? 0) - (a.outlier ?? 0));
}
