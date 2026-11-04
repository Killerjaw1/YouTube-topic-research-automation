/**
 * More idea sources, all free of YouTube quota except where noted:
 * - Viewer questions: the questions people ask in comments (YouTube Data API, 1 unit per video)
 * - On this day: dated events and anniversaries from Wikipedia
 * - Rising on Wikipedia: articles whose readership jumped since the day before (Wikimedia pageviews)
 * - Already made: whether one of your uploads already covers an idea
 */

import { subjectTerms } from "./series";
import { UserError } from "./types";

const WIKI_UA = "NicheRadar/1.2 (YouTube topic research desktop app; https://github.com/Killerjaw1/YouTube-topic-research-automation)";

// ----------------------------------------------------------- viewer questions
export interface CommentText { text: string; likes: number; video: string; videoTitle: string }
export interface ViewerQuestion { question: string; count: number; likes: number; video: string; videoTitle: string }

const QUESTION_WORD = /^(?:(?:but|so|and|ok|okay|wait|also|now|then|lol|hey|bro|like|ngl|honestly|seriously|genuinely|actually)[,\s]+)*(why|how|what|whats|what's|when|where|who|which|is|are|was|were|can|could|does|do|did|will|would|should|has|have|if)\b/i;

/** Questions in viewer comments, merged when worded alike, most asked and most liked first. */
export function extractQuestions(comments: CommentText[], limit = 40): ViewerQuestion[] {
  const groups = new Map<string, ViewerQuestion>();
  for (const c of comments) {
    const sentences = c.text.replace(/\s+/g, " ").split(/(?<=[?!.])\s+/);
    for (let s of sentences) {
      s = s.trim().replace(/^[@#][\w.-]+\s*/, "").replace(/\?+$/, "?");
      if (!s.endsWith("?") || s.length < 15 || s.length > 180 || /https?:\/\//.test(s)) continue;
      if (!QUESTION_WORD.test(s)) continue;
      const toks = subjectTerms(s).filter((t) => !t.includes(" "));
      if (toks.length < 2) continue; // "what song is this?" and similar say nothing about a topic
      const key = [...new Set(toks)].sort().slice(0, 6).join(" ");
      const g = groups.get(key);
      if (g) { g.count++; g.likes += c.likes; if (c.likes > 0 && s.length < g.question.length) g.question = s; }
      else groups.set(key, { question: s.charAt(0).toUpperCase() + s.slice(1), count: 1, likes: c.likes, video: c.video, videoTitle: c.videoTitle });
    }
  }
  return [...groups.values()].sort((a, b) => b.count * 3 + Math.log10(b.likes + 1) - (a.count * 3 + Math.log10(a.likes + 1))).slice(0, limit);
}

// ----------------------------------------------------------------- on this day
export interface DayEvent { year: number; text: string; page: string; description: string; years_ago: number; round: boolean; url: string }

/** Round anniversaries get a boost on YouTube and in the news: every 5 years, and the 1st. */
export const isRound = (n: number) => n > 0 && (n % 5 === 0 || n === 1);

export function parseOnThisDay(data: any, year: number): DayEvent[] {
  const seen = new Set<string>();
  const out: DayEvent[] = [];
  for (const e of [...(data?.selected ?? []), ...(data?.events ?? [])]) {
    const p = (e.pages ?? [])[0] ?? {};
    const page = p.normalizedtitle ?? p.titles?.normalized ?? p.title?.replace(/_/g, " ") ?? "";
    const text = String(e.text ?? "").trim();
    if (!text || seen.has(text) || typeof e.year !== "number") continue;
    seen.add(text);
    const ago = year - e.year;
    out.push({ year: e.year, text, page, description: p.description ?? "", years_ago: ago, round: isRound(ago),
      url: p.content_urls?.desktop?.page ?? (page ? `https://en.wikipedia.org/wiki/${encodeURIComponent(page.replace(/ /g, "_"))}` : "") });
  }
  return out.sort((a, b) => Number(b.round) - Number(a.round) || b.year - a.year);
}

export async function onThisDay(month: number, day: number, year: number, f: typeof fetch = fetch): Promise<DayEvent[]> {
  const mm = String(month).padStart(2, "0"), dd = String(day).padStart(2, "0");
  let resp: Response;
  try {
    resp = await f(`https://en.wikipedia.org/api/rest_v1/feed/onthisday/all/${mm}/${dd}`, { headers: { "Api-User-Agent": WIKI_UA, "User-Agent": WIKI_UA, Accept: "application/json" }, signal: AbortSignal.timeout(15000) });
  } catch (e: any) {
    throw new UserError(`Wikipedia couldn’t be reached (${e?.message ?? e}). Check your internet connection and try again.`);
  }
  if (!resp.ok) throw new UserError(`Wikipedia returned an error (${resp.status}). Try again in a minute.`);
  return parseOnThisDay(await resp.json(), year);
}

// ---------------------------------------------------------- rising on wikipedia
export interface RisingArticle { title: string; views: number; previous: number | null; ratio: number | null; url: string }

const NOT_ARTICLES = /^(Main_Page|Special:|Wikipedia:|Portal:|File:|Help:|Talk:|Category:|Template:|User:|-$|Undefined$|Cleopatra$|XXX|Pornhub|XHamster|XVideos|Bible$|Google$|YouTube$|Facebook$|Instagram$|Deaths_in_)/i;

/** Articles read far more yesterday than the day before. New entries (not in the previous top list) count as rising. */
export function risingArticles(today: { article: string; views: number }[], before: { article: string; views: number }[], minViews = 25000, limit = 40): RisingArticle[] {
  const prev = new Map(before.map((a) => [a.article, a.views]));
  const floor = before.length ? Math.min(...before.map((a) => a.views)) : 0;
  return today
    .filter((a) => !NOT_ARTICLES.test(a.article) && a.views >= minViews)
    .map((a) => {
      const p = prev.get(a.article) ?? null;
      const ratio = p ? a.views / p : floor ? a.views / floor : null;
      return { title: a.article.replace(/_/g, " "), views: a.views, previous: p, ratio: ratio ? Math.round(ratio * 10) / 10 : null, url: `https://en.wikipedia.org/wiki/${encodeURIComponent(a.article)}` };
    })
    .filter((a) => a.previous == null || (a.ratio ?? 0) >= 1.8)
    .sort((a, b) => (b.ratio ?? 0) - (a.ratio ?? 0) || b.views - a.views)
    .slice(0, limit);
}

export async function wikiTop(date: Date, f: typeof fetch = fetch): Promise<{ article: string; views: number }[] | null> {
  const y = date.getUTCFullYear(), m = String(date.getUTCMonth() + 1).padStart(2, "0"), d = String(date.getUTCDate()).padStart(2, "0");
  let resp: Response;
  try {
    resp = await f(`https://wikimedia.org/api/rest_v1/metrics/pageviews/top/en.wikipedia/all-access/${y}/${m}/${d}`, { headers: { "Api-User-Agent": WIKI_UA, "User-Agent": WIKI_UA }, signal: AbortSignal.timeout(15000) });
  } catch (e: any) {
    throw new UserError(`Wikipedia couldn’t be reached (${e?.message ?? e}). Check your internet connection and try again.`);
  }
  if (resp.status === 404) return null; // that day isn't published yet
  if (!resp.ok) throw new UserError(`Wikipedia returned an error (${resp.status}). Try again in a minute.`);
  const data: any = await resp.json();
  return (data?.items?.[0]?.articles ?? []).map((a: any) => ({ article: String(a.article), views: Number(a.views) || 0 }));
}

// ---------------------------------------------------------------- already made
export interface SimilarUpload { title: string; video: string; views: number; similarity: number }

/** Your uploads that already cover an idea: shared two-word subjects, or most of the same subject words. */
export function similarUploads(idea: string, uploads: { title: string; video: string; views: number }[], limit = 3): SimilarUpload[] {
  const a = subjectTerms(idea);
  const aw = new Set(a.filter((t) => !t.includes(" "))), ap = new Set(a.filter((t) => t.includes(" ")));
  if (!aw.size) return [];
  return uploads.map((u) => {
    const b = subjectTerms(u.title);
    const bw = new Set(b.filter((t) => !t.includes(" ")));
    const shared = [...aw].filter((w) => bw.has(w)).length;
    const pair = b.some((t) => t.includes(" ") && ap.has(t));
    const sim = shared / Math.max(1, Math.min(aw.size, bw.size));
    return { ...u, similarity: Math.round((pair ? Math.max(sim, 0.75) : sim) * 100) / 100 };
  }).filter((u) => u.similarity >= 0.6).sort((x, y) => y.similarity - x.similarity).slice(0, limit);
}

// ------------------------------------------------------------------- samples
/** Sample events for the browser preview, dated relative to the chosen day so anniversaries make sense. */
export function demoDayEvents(year: number): DayEvent[] {
  const rows: [number, string, string, string][] = [
    [1980, "Pac-Man is released in Japanese arcades.", "Pac-Man", "1980 maze arcade game"],
    [2001, "The first iPod is announced.", "IPod (1st generation)", "Portable media player"],
    [1952, "The first commercial jet airliner service begins.", "De Havilland Comet", "British jet airliner"],
    [1977, "Voyager 1 passes a milestone on its way out of the Solar System.", "Voyager 1", "NASA space probe"],
    [1996, "Super Mario 64 goes on sale.", "Super Mario 64", "1996 platform video game"],
    [2011, "Minecraft is fully released.", "Minecraft", "2011 sandbox video game"],
    [1908, "A huge explosion flattens forest near the Tunguska River.", "Tunguska event", "1908 explosion in Siberia"],
  ];
  return parseOnThisDay({ events: rows.map(([y, text, title, description]) => ({ year: y, text, pages: [{ normalizedtitle: title, description }] })) }, year);
}

export function demoRising(): RisingArticle[] {
  return [["Tunguska_event", 412000, 61000], ["Voyager_1", 288000, 52000], ["Pac-Man", 151000, 33000], ["Ball_lightning", 133000, null], ["Mandela_effect", 97000, 31000],
    ["Kessler_syndrome", 88000, null], ["Great_Emu_War", 74000, 29000], ["Boiling_frog", 51000, 18000]]
    .map(([a, v, p]) => ({ title: String(a).replace(/_/g, " "), views: Number(v), previous: p as number | null, ratio: p ? Math.round((Number(v) / Number(p)) * 10) / 10 : null, url: `https://en.wikipedia.org/wiki/${a}` }));
}
