/**
 * Free idea sources that cost no YouTube API quota:
 *  - YouTube search autocomplete (what people are typing into YouTube right now)
 *  - Reddit top posts (what communities are talking about this week)
 */

import type { Store } from "./store";
import { type Candidate, type RedditPost, UserError } from "./types";

const SUGGEST_URL = "https://suggestqueries.google.com/complete/search";
const UA = "NicheRadar/1.0 (desktop topic research tool)";
const QUESTION_PREFIXES = ["how to", "why", "what is", "can you", "is it", "best", "should i", "how much"];
const MODIFIERS = ["for beginners", "explained", "tips", "mistakes", "vs", "2026"];

export async function autocomplete(q: string, language = "en", region = "US", store?: Store): Promise<string[]> {
  const key = `ac:${language}:${region}:${q.toLowerCase()}`;
  const hit = store?.cacheGet<string[]>(key, 6 * 3600 * 1000);
  if (hit) return hit;
  const url = new URL(SUGGEST_URL);
  Object.entries({ client: "firefox", ds: "yt", q, hl: language, gl: region }).forEach(([k, v]) => url.searchParams.set(k, v));
  let data: unknown;
  try {
    const resp = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(10000) });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    // Suggestions come back in the region's legacy charset for some locales; decode leniently.
    const buf = await resp.arrayBuffer();
    const charset = /charset=([\w-]+)/i.exec(resp.headers.get("content-type") ?? "")?.[1] ?? "utf-8";
    let text: string;
    try { text = new TextDecoder(charset).decode(buf); } catch { text = new TextDecoder().decode(buf); }
    data = JSON.parse(text);
  } catch (e: any) {
    throw new UserError(`YouTube search suggestions couldn’t be loaded (${e?.message ?? e}). Try again in a minute.`);
  }
  const out = Array.isArray(data) && Array.isArray(data[1]) ? (data[1] as unknown[]).filter((s): s is string => typeof s === "string") : [];
  store?.cacheSet(key, out);
  return out;
}

async function pool<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }));
  return out;
}

/**
 * Mine autocomplete around a seed: plain, a-z, questions and modifiers. `hits` counts how
 * many probes surfaced a phrase - a rough popularity signal.
 */
export async function expand(seed: string, mode: "full" | "alphabet" | "questions", language: string, region: string, store?: Store): Promise<Candidate[]> {
  seed = seed.trim();
  const probes: [string, string][] = [[seed, "autocomplete"]];
  if (mode === "full" || mode === "alphabet") for (const c of "abcdefghijklmnopqrstuvwxyz") probes.push([`${seed} ${c}`, "autocomplete"]);
  if (mode === "full" || mode === "questions") for (const p of QUESTION_PREFIXES) probes.push([`${p} ${seed}`, "question"]);
  if (mode === "full") for (const m of MODIFIERS) probes.push([`${seed} ${m}`, "modifier"]);
  let failures = 0;
  const results = await pool(probes, 8, async ([q, source]) => {
    try { return { source, list: await autocomplete(q, language, region, store) }; } catch { failures++; return { source, list: [] as string[] }; }
  });
  if (failures === probes.length) await autocomplete(seed, language, region, store); // surface the real error
  const found = new Map<string, Candidate>();
  for (const { source, list } of results) for (const s of list) {
    const k = s.trim().toLowerCase();
    if (!k || k === seed.toLowerCase()) continue;
    const e = found.get(k) ?? { keyword: k, source, hits: 0 };
    e.hits++;
    found.set(k, e);
  }
  return [...found.values()].sort((a, b) => b.hits - a.hits || a.keyword.localeCompare(b.keyword));
}

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

/** A normal browser user agent: Reddit blocks many scripted clients on its public pages. */
const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
/** Reddit's API asks apps for a descriptive user agent of this form. */
const API_UA = "windows:app.nicheradar.desktop:v1 (topic research)";

export interface RedditOptions {
  /** The fetch to use. The desktop app passes Electron's, which goes through Chromium's network stack. */
  fetcher?: Fetcher;
  /** An "installed app" client ID from reddit.com/prefs/apps: read-only access Reddit doesn't block. */
  clientId?: string;
  store?: Store;
}

const decodeEntities = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&amp;/g, "&");

function postsFromListing(data: any): RedditPost[] {
  return (data?.data?.children ?? [])
    .map((c: any) => c.data ?? {})
    .filter((d: any) => !d.stickied && !d.over_18)
    .map((d: any) => ({ title: decodeEntities(d.title ?? ""), score: d.score ?? 0, comments: d.num_comments ?? 0, url: "https://www.reddit.com" + (d.permalink ?? ""), flair: d.link_flair_text ?? "" }));
}

/** Titles and links from Reddit's Atom feed (no vote counts). */
export function postsFromFeed(xml: string): RedditPost[] {
  const out: RedditPost[] = [];
  for (const m of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const e = m[1];
    const title = /<title>([\s\S]*?)<\/title>/.exec(e)?.[1] ?? "";
    const url = /<link href="([^"]+)"/.exec(e)?.[1] ?? "";
    const flair = /<category term="[^"]*" label="([^"]*)"/.exec(e)?.[1] ?? "";
    if (title) out.push({ title: decodeEntities(title.replace(/<!\[CDATA\[|\]\]>/g, "").trim()), score: -1, comments: -1, url: decodeEntities(url), flair: decodeEntities(flair) });
  }
  return out;
}

/** Anonymous read-only token for an installed app (no password, no user account). */
async function redditToken(f: Fetcher, clientId: string, store?: Store): Promise<string> {
  const key = `reddit-token:${clientId}`;
  const hit = store?.cacheGet<string>(key, 50 * 60 * 1000);
  if (hit) return hit;
  const deviceId = "nicheradar" + Math.random().toString(36).slice(2, 16).padEnd(14, "0");
  const resp = await f("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: { Authorization: "Basic " + btoa(`${clientId}:`), "Content-Type": "application/x-www-form-urlencoded", "User-Agent": API_UA },
    body: new URLSearchParams({ grant_type: "https://oauth.reddit.com/grants/installed_client", device_id: deviceId }).toString(),
    signal: AbortSignal.timeout(12000),
  });
  if (resp.status === 401) throw new UserError("Reddit didn’t accept the app ID. Check it in Settings, under Reddit. The app must be the “installed app” type.");
  if (!resp.ok) throw new UserError(`Reddit didn’t give access (${resp.status}). Check the app ID in Settings, under Reddit.`);
  const tok: any = await resp.json();
  if (!tok.access_token) throw new UserError("Reddit didn’t give access. Check the app ID in Settings, under Reddit.");
  store?.cacheSet(key, tok.access_token);
  return tok.access_token;
}

/**
 * Top posts of a subreddit. With an app ID it uses Reddit's API, which is reliable. Without one it reads
 * Reddit's public pages, trying the JSON listing on www and old Reddit, then the Atom feed.
 */
export async function redditTop(subreddit: string, period = "week", limit = 30, o: RedditOptions = {}): Promise<RedditPost[]> {
  const sub = subreddit.trim().replace(/^\/?r\//, "").replace(/\/+$/, "");
  if (!/^\w+$/.test(sub)) throw new UserError("Enter a subreddit name, such as personalfinance.");
  const f: Fetcher = o.fetcher ?? ((u, i) => fetch(u, i));
  const notFound = () => new UserError(`r/${sub} doesn’t exist or is private. Check the name and try again.`);
  const offline = (e: any) => new UserError(`Reddit couldn’t be reached (${e?.message ?? e}). Check your internet connection and try again.`);

  if (o.clientId?.trim()) {
    let resp: Response;
    try {
      const token = await redditToken(f, o.clientId.trim(), o.store);
      resp = await f(`https://oauth.reddit.com/r/${sub}/top?t=${period}&limit=${limit}&raw_json=1`, {
        headers: { Authorization: `Bearer ${token}`, "User-Agent": API_UA }, signal: AbortSignal.timeout(12000),
      });
    } catch (e) { if (e instanceof UserError) throw e; throw offline(e); }
    if (resp.status === 404 || resp.status === 403) throw notFound();
    if (resp.status === 429) throw new UserError("Reddit is limiting requests right now. Try again in a minute.");
    if (resp.status === 401) { o.store?.cacheSet(`reddit-token:${o.clientId.trim()}`, null); throw new UserError("Reddit access expired. Try again."); }
    if (!resp.ok) throw new UserError(`Reddit returned an error (${resp.status}). Try again in a minute.`);
    return postsFromListing(await resp.json());
  }

  const attempts: [string, "json" | "feed"][] = [
    [`https://www.reddit.com/r/${sub}/top.json?t=${period}&limit=${limit}&raw_json=1`, "json"],
    [`https://old.reddit.com/r/${sub}/top.json?t=${period}&limit=${limit}&raw_json=1`, "json"],
    [`https://www.reddit.com/r/${sub}/top/.rss?t=${period}&limit=${limit}`, "feed"],
  ];
  let limited = false, blocked = false, lastError: unknown = null;
  for (const [url, kind] of attempts) {
    let resp: Response;
    try {
      resp = await f(url, { headers: { "User-Agent": BROWSER_UA, Accept: kind === "json" ? "application/json" : "application/atom+xml" }, signal: AbortSignal.timeout(12000) });
    } catch (e) { lastError = e; continue; }
    if (resp.status === 404) throw notFound();
    if (resp.status === 429) { limited = true; continue; }
    if (resp.status === 403) { blocked = true; continue; }
    if (!resp.ok) continue;
    try {
      if (kind === "json") return postsFromListing(await resp.json());
      const posts = postsFromFeed(await resp.text());
      if (posts.length) return posts;
    } catch { blocked = true; } // an HTML block page instead of data
  }
  if (blocked) throw new UserError("Reddit blocked the request. Add a free Reddit app ID in Settings, under Reddit, and threads will load reliably.", "RedditBlocked");
  if (limited) throw new UserError("Reddit is limiting requests right now. Try again in a minute, or add a free Reddit app ID in Settings for reliable access.", "RedditBlocked");
  throw offline(lastError ?? "no response");
}
