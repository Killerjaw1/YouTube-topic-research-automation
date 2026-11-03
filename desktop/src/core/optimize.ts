/**
 * Upload playbook: metadata suggestions and click-through / watch-time best practices.
 *
 * Built from the videos actually winning a topic (top-ranked results and small-channel
 * breakouts), so the advice is specific to the topic rather than generic. Also grades
 * your own draft metadata before upload.
 */

import { STOPWORDS, tokens } from "./scoring";
import type { DraftCheck, Playbook, Report, TitlePattern, VideoRow } from "./types";
import { mean, median, quartiles, round } from "./util";

export const TAG_CHAR_LIMIT = 500; // YouTube's limit for all tags combined

const PATTERNS: [string, string, RegExp][] = [
  ["number", 'a number ("7 mistakes", "30 days")', /\d/],
  ["question", "a question", /\?/],
  ["first_person", 'first person ("I tried", "my")', /\b(i|i'm|i've|my|me)\b/i],
  ["brackets", "brackets or parentheses", /[([]/],
  ["versus", 'a comparison ("vs")', /\bvs\.?\b|\bversus\b/i],
  ["year", "the year", /\b20\d\d\b/],
  ["how_why", '"how" / "why"', /\b(how|why)\b/i],
  ["caps_word", "one ALL-CAPS word for emphasis", /\b[A-Z]{3,}\b/],
  ["negative", 'a warning ("mistakes", "don\'t", "stop")', /\b(mistakes?|don't|stop|never|wrong|avoid|worst)\b/i],
  ["separator", "a colon or dash splitting topic and promise", /[:|–—-]/],
];

const ACRONYMS = new Set(["pc", "ai", "diy", "rpg", "fps", "vr", "ar", "tv", "ps5", "ps4", "usa", "uk", "eu", "gpu", "cpu", "seo", "asmr",
  "mmo", "ios", "nba", "nfl", "ufc", "f1", "gta", "llm", "ui", "ux", "api", "pdf", "rv", "ev", "faq", "hiit", "adhd"]);
const SMALL_WORDS = new Set(["a", "an", "the", "and", "or", "for", "of", "in", "on", "to", "vs", "with", "at", "by"]);

export function titleCase(text: string): string {
  return text.split(/\s+/).filter(Boolean).map((w, i) => {
    const lw = w.toLowerCase();
    if (ACRONYMS.has(lw)) return w.toUpperCase();
    if (i && SMALL_WORDS.has(lw)) return lw;
    return w[0].toUpperCase() + w.slice(1);
  }).join(" ");
}

/** Top-ranked results plus small-channel breakouts: the videos worth learning from. */
function referenceSet(report: Report): VideoRow[] {
  const seen = new Set<string>();
  const out: VideoRow[] = [];
  for (const v of [...report.videos.slice(0, 10), ...[...report.videos, ...report.recent].filter((x) => x.breakout)]) {
    if (!seen.has(v.id)) { seen.add(v.id); out.push(v); }
  }
  return out;
}

export function titlePatterns(titles: string[]): TitlePattern[] {
  if (!titles.length) return [];
  return PATTERNS.map(([key, label, rx]) => ({ key, label, share: round(titles.filter((t) => rx.test(t)).length / titles.length, 2) }))
    .sort((a, b) => b.share - a.share);
}

function lengthTarget(vids: VideoRow[]): Playbook["length"] {
  const longs = vids.filter((v) => v.format === "long" && v.duration_s).map((v) => v.duration_s).sort((a, b) => a - b);
  const shorts = vids.filter((v) => v.format === "short" && v.duration_s).map((v) => v.duration_s).sort((a, b) => a - b);
  const out: Playbook["length"] = {};
  if (longs.length >= 3) {
    const q = quartiles(longs);
    out.long = { low_min: Math.max(1, Math.round(q[0] / 60)), high_min: Math.max(2, Math.round(q[2] / 60)), median_min: round(median(longs) / 60, 1), n: longs.length };
  }
  if (shorts.length >= 3) out.short = { median_s: Math.round(median(shorts)), n: shorts.length };
  return out;
}

function pickTags(report: Report, ref: VideoRow[]): string[] {
  const counts = new Map<string, number>();
  for (const v of ref) for (const raw of v.tags ?? []) {
    const t = raw.toLowerCase().trim();
    if (t.length > 2 && t.length <= 40 && !STOPWORDS.has(t)) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  const picked = [
    report.keyword.toLowerCase().trim(),
    ...(report.suggestions ?? []).slice(0, 6).map((s) => s.toLowerCase()),
    ...[...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).filter(([, c]) => c >= 2).map(([t]) => t),
    ...report.title_words.slice(0, 5).map((w) => w.word).filter((w) => w.includes(" ")),
  ];
  const out: string[] = [];
  let total = 0;
  for (const t of new Set(picked)) {
    if (total + t.length + 1 > TAG_CHAR_LIMIT || out.length >= 15) break;
    out.push(t);
    total += t.length + 1;
  }
  return out;
}

function pickHashtags(keyword: string, tags: string[]): string[] {
  const tagify = (s: string) => "#" + s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const kw = keyword.toLowerCase();
  const out = tagify(keyword).length <= 26 ? [tagify(keyword)] : [];
  // Prefer short, distinct tags (not the keyword plus a suffix), then single keyword words.
  const pool = [
    ...tags.slice(1).filter((t) => !t.toLowerCase().includes(kw) && t.length <= 20),
    ...tokens(keyword).filter((w) => w.length > 3).sort((a, b) => b.length - a.length),
  ];
  for (const t of pool) {
    const h = tagify(t);
    if (h.length > 3 && !out.includes(h)) out.push(h);
    if (out.length === 3) break;
  }
  return out;
}

function suggestTitles(report: Report, patterns: TitlePattern[]): string[] {
  const kw = titleCase(report.keyword);
  const low = report.keyword.toLowerCase();
  const year = new Date().getFullYear();
  const strong = new Set(patterns.filter((p) => p.share >= 0.3).map((p) => p.key));
  const c: string[] = [];
  if (strong.has("first_person") || !strong.size) c.push(`I Tried ${kw} for 30 Days (Honest Results)`);
  if (strong.has("number")) c.push(`${kw}: 7 Things I Wish I Knew Sooner`);
  if (strong.has("negative") || strong.has("number")) c.push(`5 ${kw} Mistakes Beginners Make`);
  if (strong.has("question") || strong.has("year")) c.push(`Is ${kw} Still Worth It in ${year}?`);
  if (strong.has("how_why")) c.push(`Why Most People Get ${kw} Wrong`);
  if (strong.has("versus")) {
    const vs = (report.suggestions ?? []).find((s) => / vs\b/.test(s) && !/ vs$/.test(s));
    c.push(vs ? `${titleCase(vs)}: Which One Wins?` : `${kw} vs The Popular Alternative: Honest Test`);
  }
  if (!low.includes("beginner")) c.push(`${kw} for Complete Beginners (Step by Step)`);
  if (!low.includes("guide")) c.push(`The ${kw} Guide I Wish I Had`);
  c.push(/budget|cheap|free/.test(low) ? `${kw}: What Actually Works (and What's a Waste)` : `${kw} on a Budget: What Actually Works`);
  // Long-tail angles from real autocomplete phrases: narrower is easier for small channels.
  for (const s of (report.suggestions ?? []).slice(0, 4)) {
    const sl = s.toLowerCase();
    const tail = (sl.startsWith(low) ? sl.slice(low.length) : sl).split(/\s+/).filter(Boolean);
    if (sl === low || !tail.length || STOPWORDS.has(tail[tail.length - 1])) continue;
    if (tail.some((w) => w.length > 2 && (low.includes(w) || c.some((x) => x.toLowerCase().includes(w))))) continue;
    c.push(`${titleCase(s)}: Everything You Need to Know`);
  }
  return [...new Set(c)].filter((t) => t.length <= 70).slice(0, 10);
}

function descriptionTemplate(report: Report, hashtags: string[], length: Playbook["length"]): string {
  const kw = report.keyword;
  const step = Math.max(1, Math.floor(((length.long?.median_min ?? 10) * 60) / 5));
  const ts = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
  const chapters = ["Intro: the result / payoff up front", "The problem (why most people struggle)", "Step-by-step / main section",
    "Common mistakes", "Final verdict + what to watch next"];
  return [
    `[Line 1-2 show in search: say exactly what the viewer gets. Use "${kw}" naturally.]`,
    `In this video I break down ${kw}: what works, what doesn't, and the mistakes to avoid.`,
    "",
    "⏱️ Chapters",
    ...chapters.map((ch, i) => `${i ? ts(i * step) : "0:00"} ${ch}`),
    "",
    "🔗 Resources mentioned",
    "- [link]",
    "",
    "📺 Watch next: [link to your most related video or playlist]",
    "",
    "💬 Question for you: [ask something specific - it drives comments]",
    "",
    hashtags.join(" "),
  ].join("\n");
}

/** The full upload playbook for an analyzed topic. */
export function playbook(report: Report): Playbook | null {
  if (!report.videos.length) return null;
  const ref = referenceSet(report);
  const breakoutTitles = ref.filter((v) => v.breakout).map((v) => v.title);
  const patterns = titlePatterns(breakoutTitles.length ? breakoutTitles : ref.map((v) => v.title));
  const lens = ref.map((v) => v.title.length);
  const avgLen = lens.length ? Math.round(mean(lens)) : null;
  const length = lengthTarget(ref);
  const tags = pickTags(report, ref);
  const hashtags = pickHashtags(report.keyword, tags);
  const m = report.metrics;

  const ctr = [
    `Put "${report.keyword}" (or a close variant) in the first ~40 characters of the title, the part that never gets cut off on mobile.`,
    `Keep the title around 40-60 characters. Top videos here average ${avgLen ?? 50}.`,
    "Thumbnail: one clear subject, 2-4 large words that add to the title rather than repeat it, and strong contrast. Check it at phone size before uploading.",
    "Use YouTube Studio's thumbnail Test & Compare to A/B test 2-3 thumbnails on every upload.",
    ...patterns.filter((p) => p.share >= 0.3).slice(0, 3).map((p) => `${Math.round(p.share * 100)}% of the winning titles use ${p.label}. Consider it.`),
  ];
  if (Number(m.big_in_top10) >= 5) ctr.push("Big channels own the broad title. Don't copy their framing. Make a narrower promise (a specific audience, budget, timeframe or result) so you're not competing head-on.");
  if (m.content_gap) ctr.push(`The top videos are old. Signal freshness with "${new Date().getFullYear()}" or "updated" in the title/thumbnail.`);

  const watch = [
    "Show the payoff or result in the first 5-15 seconds, then explain how you got there. No long intro or channel greeting.",
    "Deliver what the title and thumbnail promised early. A mismatch kills retention and tells YouTube to stop recommending the video.",
    "Change something on screen every 20-40 seconds (b-roll, zoom, graphic, angle) to reset attention.",
    "Use open loops: tease the best tip or the final result so viewers stay to the end.",
    "Add chapters (start at 0:00, at least 3, each 10s or longer). They help search and let viewers jump instead of leaving.",
    "Point the end screen at your most related video or a playlist to turn one view into a session.",
  ];
  if (length.long) {
    const L = length.long;
    watch.splice(1, 0, `Target length: about ${L.low_min}-${L.high_min} min. That's the typical range of the winning long-form videos (median ${L.median_min} min). Only go longer if every minute earns its place.`);
  }
  const shorts = [
    "Hook with on-screen text in the first second. Shorts viewers swipe within 1-2 seconds.",
    "Loop the ending into the beginning so replays count as extra watch time.",
    length.short ? `Keep it tight: winning Shorts here run about ${length.short.median_s}s.` : "20-45 seconds is the sweet spot for most Shorts.",
    "Link a related long video from the Short to move viewers to long-form (where watch time compounds).",
  ];
  const metadata = [
    "First 2 lines of the description (~150 characters) show in search. Make them a clear summary with the keyword.",
    "Use 3 hashtags at most. They appear above the title; more than 15 and YouTube ignores all of them.",
    "Tags matter very little, mostly for misspellings. Don't spend time on them, but fill in the suggested set.",
    "Pin a comment with a specific question to start the comment section.",
    "Add the video to a playlist with similar videos to increase session time.",
  ];
  return {
    titles: suggestTitles(report, patterns),
    title_patterns: patterns,
    title_length: { avg: avgLen, ideal: [40, 60] },
    tags,
    tags_chars: tags.reduce((a, t) => a + t.length + 1, 0),
    hashtags,
    description: descriptionTemplate(report, hashtags, length),
    length,
    recommended_format: report.formats.recommended?.format ?? "long",
    checklist: { ctr, watch_time: watch, shorts, metadata },
  };
}

export interface Draft {
  keyword?: string;
  title?: string;
  description?: string;
  tags?: string;
  format?: "long" | "short";
  minutes?: number | null;
}

/** Grade the user's own title / description / tags before upload. */
export function checkDraft(draft: Draft, report?: Report | null): { score: number; checks: DraftCheck[] } {
  const kw = (draft.keyword ?? "").trim().toLowerCase();
  const title = (draft.title ?? "").trim();
  const desc = draft.description ?? "";
  const tags = (draft.tags ?? "").split(/[,\n]/).map((t) => t.trim()).filter(Boolean);
  const fmt = draft.format ?? "long";
  const checks: DraftCheck[] = [];
  const add = (group: string, status: DraftCheck["status"], text: string, fix = "") => checks.push({ group, status, text, fix });
  const kwTokens = tokens(kw);
  const hasAll = (text: string) => { const t = new Set(tokens(text)); return kwTokens.length > 0 && kwTokens.every((k) => t.has(k)); };

  // Title
  if (!title) add("Title", "fail", "No title yet.", "Write a title that makes a specific promise.");
  else {
    const n = title.length;
    if (n > 100) add("Title", "fail", `Title is ${n} characters. YouTube's maximum is 100.`, "Cut it to 60 or fewer.");
    else if (n > 70) add("Title", "warn", `Title is ${n} characters. It gets cut off on most screens past ~60-70.`, "Move the hook to the front and trim.");
    else if (n < 25) add("Title", "warn", `Title is only ${n} characters. It may be too vague to earn the click.`, "Add the specific promise or result.");
    else add("Title", "pass", `Title length is good (${n} characters).`);
    if (kw) {
      if (title.toLowerCase().includes(kw) || hasAll(title)) {
        const pos = title.toLowerCase().indexOf(kw.split(/\s+/)[0]);
        if (pos >= 0 && pos <= 40) add("Title", "pass", "Keyword appears early in the title.");
        else add("Title", "warn", "Keyword is in the title but late.", "Move it into the first ~40 characters.");
      } else if (kwTokens.some((k) => tokens(title).includes(k))) add("Title", "warn", "Title only partially matches the keyword.", `Include "${kw}" or a close variant.`);
      else add("Title", "fail", "Title doesn't contain the target keyword.", `Work "${kw}" into the title naturally.`);
    }
    const caps = (title.match(/[A-Za-z]{3,}/g) ?? []).filter((w) => w === w.toUpperCase()).length;
    if (caps > 2) add("Title", "warn", "Many ALL-CAPS words read as spammy.", "Use caps on one word at most.");
    if (/[!?]{3,}/.test(title)) add("Title", "warn", "Repeated punctuation (!!!/???) looks like clickbait.", "Use one at most.");
    if (/\d/.test(title) || title.includes("?") || /\b(i|my)\b/i.test(title)) add("Title", "pass", "Uses a proven click pattern (number, question or first person).");
    else add("Title", "info", "No number, question or first-person hook.", "These patterns often lift CTR. Test one.");
    for (const p of (report?.playbook?.title_patterns ?? []).filter((x) => x.share >= 0.4).slice(0, 2)) {
      const rx = PATTERNS.find(([k]) => k === p.key)?.[2];
      if (rx && !rx.test(title)) add("Title", "info", `${Math.round(p.share * 100)}% of winning titles for this topic use ${p.label}. Yours doesn't.`);
    }
  }

  // Description
  if (!desc.trim()) add("Description", "fail", "No description.", "Write 2 strong opening lines with the keyword, then chapters and links.");
  else {
    const first = desc.trim().slice(0, 150).toLowerCase();
    if (kw && (first.includes(kw) || hasAll(first))) add("Description", "pass", "Keyword is in the first 150 characters (shown in search).");
    else if (kw) add("Description", "warn", "Keyword missing from the first 150 characters.", "Open the description with a sentence that includes it.");
    if (desc.length < 200) add("Description", "warn", `Description is short (${desc.length} characters).`, "Aim for 200+ characters with context, chapters and links.");
    else add("Description", "pass", "Description has enough context.");
    const chapters = /(^|\n)\s*0?0:00\b/.test(desc) && (desc.match(/\b\d{1,2}:\d{2}\b/g) ?? []).length >= 3;
    if (fmt === "long") {
      if (chapters) add("Description", "pass", "Chapters detected (start at 0:00, 3 or more).");
      else add("Description", "warn", "No chapters.", "Add timestamps starting at 0:00 (3 or more). They help search and retention.");
    }
    const hashtags = desc.match(/(?<!\w)#\w+/g) ?? [];
    if (hashtags.length > 15) add("Description", "fail", `${hashtags.length} hashtags: YouTube ignores all of them past 15.`, "Use 3.");
    else if (hashtags.length > 5) add("Description", "warn", `${hashtags.length} hashtags.`, "3 focused hashtags work best.");
    else if (hashtags.length) add("Description", "pass", `${hashtags.length} hashtag(s).`);
    else add("Description", "info", "No hashtags.", "Add 1-3 relevant hashtags.");
    if (/https?:\/\//.test(desc)) add("Description", "pass", "Includes links.");
  }

  // Tags
  const total = tags.reduce((a, t) => a + t.length + 1, 0);
  if (!tags.length) add("Tags", "info", "No tags.", "Tags matter little, but add the keyword plus a few variants.");
  else {
    if (total > TAG_CHAR_LIMIT) add("Tags", "fail", `Tags total ${total} characters (limit 500).`, "Remove the least relevant ones.");
    else add("Tags", "pass", `${tags.length} tags, ${total}/500 characters.`);
    if (kw && !tags.map((t) => t.toLowerCase()).includes(kw)) add("Tags", "info", "Exact keyword isn't a tag.", `Add "${kw}" as the first tag.`);
  }

  // Length / format
  const mins = Number(draft.minutes) || 0;
  if (mins) {
    if (fmt === "short" && mins * 60 > 180) add("Format", "fail", "Shorts can be at most 3 minutes.", "Trim it or publish as long-form.");
    const target = fmt === "long" ? report?.playbook?.length.long : undefined;
    if (target) {
      const range = `${target.low_min}-${target.high_min} min`;
      if (mins < target.low_min * 0.6) add("Format", "info", `Shorter than the winners here (${range}).`, "Fine if it's tight, but make sure it fully delivers.");
      else if (mins > target.high_min * 1.5) add("Format", "warn", `Much longer than the winners (${range}).`, "Cut slow sections. Long videos only work if retention holds.");
      else add("Format", "pass", `Length fits the winning range (${range}).`);
    }
  }

  // Start from 100 and take off points per problem, so one serious issue can't hide behind many passes.
  const penalty = { pass: 0, info: 3, warn: 10, fail: 25 };
  const score = checks.length ? Math.max(0, 100 - checks.reduce((a, c) => a + penalty[c.status], 0)) : 0;
  return { score, checks };
}
