/**
 * Competitors and collaborators.
 *
 * Following: channels like yours, with their latest uploads compared with each channel's own usual views a day,
 * so a video that's taking off stands out early. Finding collaborators: channels near your size that cover a topic.
 */

import type { VideoRow } from "./types";
import { median, round } from "./util";

export interface Competitor { id: string; title: string; handle: string; thumb: string; subs: number | null; videos: number; added: number }

export interface FeedVideo {
  id: string; title: string; channel_id: string; channel_title: string; thumbnail: string; url: string;
  views: number; age_days: number; vpd: number; format: "short" | "long";
  /** Views a day against the channel's median for its recent uploads. */
  vs_usual: number | null;
  hot: boolean;
}

export interface CompetitorSummary extends Competitor { median_vpd: number; uploads_per_week: number; latest_days: number | null; hot: number }

/** A channel's recent uploads, each compared with the channel's usual pace. Hot: at least twice the usual, within 30 days. */
export function channelFeed(rows: VideoRow[]): FeedVideo[] {
  const usual = median(rows.map((r) => r.vpd));
  return rows.map((r) => {
    const vs = usual > 0 ? round(r.vpd / usual, 1) : null;
    return {
      id: r.id, title: r.title, channel_id: r.channel_id, channel_title: r.channel_title, thumbnail: r.thumbnail, url: r.url,
      views: r.views, age_days: r.age_days, vpd: r.vpd, format: r.format, vs_usual: vs, hot: (vs ?? 0) >= 2 && r.age_days <= 30 && r.views >= 500,
    };
  });
}

export function summarize(c: Competitor, feed: FeedVideo[]): CompetitorSummary {
  const ages = feed.map((v) => v.age_days);
  const span = ages.length > 1 ? Math.max(...ages) - Math.min(...ages) : 0;
  return {
    ...c, median_vpd: Math.round(median(feed.map((v) => v.vpd))),
    uploads_per_week: span > 0 ? round(((feed.length - 1) / span) * 7, 1) : 0,
    latest_days: ages.length ? Math.round(Math.min(...ages)) : null, hot: feed.filter((v) => v.hot).length,
  };
}

export interface CollabChannel {
  id: string; title: string; thumb: string; subs: number; videos: number; url: string;
  matches: number; best_title: string; best_views: number; latest_days: number;
}

/**
 * Channels covering a topic that are near your size (a third to three times your subscribers, or 1K–100K
 * without a channel set) and active recently: likely collaborators who'd say yes.
 */
export function collabCandidates(rows: VideoRow[], channels: any[], mySubs: number | null, myId?: string): CollabChannel[] {
  const lo = mySubs ? Math.max(100, mySubs / 3) : 1000, hi = mySubs ? Math.max(5000, mySubs * 3) : 100000;
  const byChannel = new Map<string, VideoRow[]>();
  for (const r of rows) {
    if (r.subs == null || r.subs < lo || r.subs > hi || r.channel_id === myId) continue;
    byChannel.set(r.channel_id, [...(byChannel.get(r.channel_id) ?? []), r]);
  }
  const meta = new Map(channels.map((c) => [c.id, c]));
  return [...byChannel.entries()].map(([id, vs]) => {
    const best = vs.reduce((a, v) => (v.views > a.views ? v : a));
    const c = meta.get(id) ?? {};
    return {
      id, title: best.channel_title, thumb: c.snippet?.thumbnails?.default?.url ?? "", subs: best.subs ?? 0, videos: best.channel_videos ?? 0,
      url: `https://www.youtube.com/channel/${id}`, matches: vs.length, best_title: best.title, best_views: best.views, latest_days: Math.round(Math.min(...vs.map((v) => v.age_days))),
    };
  }).sort((a, b) => b.matches - a.matches || b.best_views / Math.max(b.subs, 1) - a.best_views / Math.max(a.subs, 1)).slice(0, 25);
}
