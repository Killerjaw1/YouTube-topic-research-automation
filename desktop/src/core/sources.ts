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

export async function redditTop(subreddit: string, period = "week", limit = 30): Promise<RedditPost[]> {
  const sub = subreddit.trim().replace(/^\/?r\//, "").replace(/\/+$/, "");
  if (!/^\w+$/.test(sub)) throw new UserError("Enter a subreddit name, such as personalfinance.");
  let resp: Response;
  try {
    resp = await fetch(`https://www.reddit.com/r/${sub}/top.json?t=${period}&limit=${limit}`, {
      headers: { "User-Agent": UA }, signal: AbortSignal.timeout(12000),
    });
  } catch (e: any) {
    throw new UserError(`Reddit couldn’t be reached (${e?.message ?? e}). Try again in a minute.`);
  }
  if (resp.status === 403 || resp.status === 429) throw new UserError("Reddit is limiting requests right now. Try again in a minute.");
  if (resp.status === 404) throw new UserError(`r/${sub} doesn’t exist or is private. Check the name and try again.`);
  if (!resp.ok) throw new UserError(`Reddit returned an error (${resp.status}). Try again in a minute.`);
  const data: any = await resp.json();
  return (data?.data?.children ?? [])
    .map((c: any) => c.data ?? {})
    .filter((d: any) => !d.stickied && !d.over_18)
    .map((d: any) => ({ title: d.title ?? "", score: d.score ?? 0, comments: d.num_comments ?? 0, url: "https://www.reddit.com" + (d.permalink ?? ""), flair: d.link_flair_text ?? "" }));
}
