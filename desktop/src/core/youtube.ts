/**
 * YouTube Data API v3 client with quota accounting and response caching.
 *
 * Quota costs (units; the free daily allowance is 10,000):
 *   search.list 100 · videos.list 1 (50 ids) · channels.list 1 · playlistItems.list 1 · videoCategories.list 1
 */

import type { Store } from "./store";
import { UserError } from "./types";

const API = "https://www.googleapis.com/youtube/v3";
const COSTS: Record<string, number> = { search: 100, videos: 1, channels: 1, playlistItems: 1, videoCategories: 1 };

export class QuotaExceeded extends UserError {
  constructor() {
    super("Your YouTube API quota is used up for today. It resets at midnight Pacific time.", "QuotaExceeded");
  }
}
export class InvalidKey extends UserError {
  constructor(msg = "The YouTube API key is not valid. Check it in Settings.") {
    super(msg, "InvalidKey");
  }
}

export function parseDuration(value?: string | null): number {
  if (!value) return 0;
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value);
  if (!m) return 0;
  const [d, h, mi, s] = m.slice(1).map((x) => (x ? parseInt(x, 10) : 0));
  return d * 86400 + h * 3600 + mi * 60 + s;
}

export function publishedAfterDays(days: number): Date {
  return new Date(Date.now() - days * 86400000);
}

export interface SearchOptions {
  maxResults?: number;
  order?: "relevance" | "viewCount" | "date";
  publishedAfter?: Date;
  region?: string;
  language?: string;
}

/** The interface both the real client and the demo client implement. */
export interface YouTubeSource {
  readonly demo: boolean;
  search(q: string, opts?: SearchOptions): Promise<string[]>;
  videos(ids: string[]): Promise<any[]>;
  channels(ids: string[]): Promise<any[]>;
  channelLookup(text: string): Promise<any | null>;
  recentUploads(uploadsPlaylist: string, limit?: number): Promise<any[]>;
  trending(region: string, category?: string): Promise<any[]>;
  categories(region: string): Promise<{ id: string; title: string }[]>;
  test(): Promise<void>;
}

function chunks<T>(arr: T[], size = 50): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export class YouTubeClient implements YouTubeSource {
  readonly demo = false;

  constructor(private apiKey: string, private store: Store, public cacheMs = 12 * 3600 * 1000) {}

  private async get(endpoint: string, params: Record<string, unknown>, useCache = true): Promise<any> {
    const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ""));
    const key = `yt:${endpoint}:${JSON.stringify(Object.keys(clean).sort().map((k) => [k, clean[k]]))}`;
    if (useCache) {
      const hit = this.store.cacheGet<any>(key, this.cacheMs);
      if (hit !== undefined) return hit;
    }
    const url = new URL(`${API}/${endpoint}`);
    for (const [k, v] of Object.entries(clean)) url.searchParams.set(k, String(v));
    url.searchParams.set("key", this.apiKey);
    let resp: Response;
    try {
      resp = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(20000) });
    } catch (e: any) {
      throw new UserError(`Could not reach YouTube: ${e?.message ?? e}`);
    }
    // Quota is charged for every request that reaches the API, even failed ones.
    this.store.addQuota(COSTS[endpoint] ?? 1);
    const text = await resp.text();
    let data: any = {};
    try { data = JSON.parse(text); } catch { /* non-JSON */ }
    if (!resp.ok) {
      const err = data?.error ?? {};
      const reasons = new Set<string>((err.errors ?? []).map((e: any) => e.reason));
      const message: string = err.message ?? text.slice(0, 200);
      if (["quotaExceeded", "dailyLimitExceeded", "rateLimitExceeded"].some((r) => reasons.has(r))) throw new QuotaExceeded();
      if (reasons.has("keyInvalid") || reasons.has("keyExpired") || message.includes("API key not valid")) throw new InvalidKey();
      if (resp.status === 403 && message.includes("has not been used")) {
        throw new InvalidKey("YouTube Data API v3 isn't enabled for this key's Google Cloud project. Enable it in the Google Cloud console, then try again.");
      }
      throw new UserError(`YouTube API error (${resp.status}): ${message}`);
    }
    if (useCache) this.store.cacheSet(key, data);
    return data;
  }

  async search(q: string, o: SearchOptions = {}): Promise<string[]> {
    const data = await this.get("search", {
      part: "snippet",
      type: "video",
      q,
      maxResults: Math.min(o.maxResults ?? 50, 50),
      order: o.order ?? "relevance",
      regionCode: o.region,
      relevanceLanguage: o.language,
      publishedAfter: o.publishedAfter ? o.publishedAfter.toISOString().replace(/\.\d+Z$/, "Z") : undefined,
      safeSearch: "none",
    });
    return (data.items ?? []).map((it: any) => it?.id?.videoId).filter(Boolean);
  }

  async videos(ids: string[]): Promise<any[]> {
    const out: any[] = [];
    for (const c of chunks([...new Set(ids)])) {
      const data = await this.get("videos", { part: "snippet,statistics,contentDetails", id: c.join(",") });
      out.push(...(data.items ?? []));
    }
    return out;
  }

  async channels(ids: string[]): Promise<any[]> {
    const out: any[] = [];
    for (const c of chunks([...new Set(ids)])) {
      const data = await this.get("channels", { part: "snippet,statistics,contentDetails", id: c.join(",") });
      out.push(...(data.items ?? []));
    }
    return out;
  }

  /** Accepts @handle, a channel id (UC…), or a channel URL. */
  async channelLookup(text: string): Promise<any | null> {
    let t = text.trim();
    const byId = /youtube\.com\/channel\/(UC[\w-]{20,})/.exec(t);
    if (byId) t = byId[1];
    const byHandle = /youtube\.com\/(@[\w.\-]+)/.exec(t);
    if (byHandle) t = byHandle[1];
    const params = /^UC[\w-]{20,}$/.test(t)
      ? { part: "snippet,statistics,contentDetails", id: t }
      : { part: "snippet,statistics,contentDetails", forHandle: t.startsWith("@") ? t : "@" + t };
    const data = await this.get("channels", params);
    return data.items?.[0] ?? null;
  }

  async recentUploads(uploadsPlaylist: string, limit = 15): Promise<any[]> {
    const data = await this.get("playlistItems", { part: "contentDetails", playlistId: uploadsPlaylist, maxResults: Math.min(limit, 50) });
    const ids = (data.items ?? []).map((it: any) => it.contentDetails.videoId);
    return ids.length ? this.videos(ids) : [];
  }

  async trending(region = "US", category?: string): Promise<any[]> {
    const data = await this.get("videos", {
      part: "snippet,statistics,contentDetails",
      chart: "mostPopular",
      regionCode: region,
      videoCategoryId: category || undefined,
      maxResults: 50,
    });
    return data.items ?? [];
  }

  async categories(region = "US") {
    const data = await this.get("videoCategories", { part: "snippet", regionCode: region });
    return (data.items ?? []).filter((c: any) => c.snippet?.assignable).map((c: any) => ({ id: c.id, title: c.snippet.title }));
  }

  async test() {
    await this.get("videoCategories", { part: "snippet", regionCode: "US" }, false);
  }
}
