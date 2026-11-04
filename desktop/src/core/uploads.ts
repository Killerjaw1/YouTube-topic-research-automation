/**
 * Upload tools: description templates per series, and a log of YouTube Test & Compare results that shows which
 * title styles win for your audience.
 */

import { PATTERNS } from "./optimize";

// ------------------------------------------------------------------ templates
export interface Template { id: string; name: string; description: string; tags: string; hashtags: string; pinned: string; updated: number }

/** Fill a template for a draft: {title} and {keyword} are replaced; hashtags go at the end of the description. */
export function applyTemplate(t: Template, d: { title: string; keyword: string; description: string; tags: string }) {
  const fill = (s: string) => s.replace(/\{title\}/gi, d.title || "").replace(/\{keyword\}/gi, d.keyword || "");
  const body = fill(t.description).trim();
  const tags = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
  const hashtags = t.hashtags.split(/[\s,]+/).filter(Boolean).map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ");
  const description = [d.description.trim(), body, hashtags].filter(Boolean).join("\n\n");
  const merged = [...new Set([...tags(d.tags), ...tags(fill(t.tags))].map((x) => x.toLowerCase()))].join(", ");
  return { description, tags: merged, pinned: fill(t.pinned) };
}

// ------------------------------------------------------------------- test log
export interface TestEntry {
  id: string; date: string; video: string; kind: "title" | "thumbnail" | "both";
  /** The versions tested (titles, or short descriptions of thumbnails), and which won (index), or -1 for no clear winner. */
  options: string[]; winner: number; share: string; notes: string; created: number;
}

export interface TestInsight { label: string; wins: number; tests: number }

/**
 * For title tests: how often each title style (a number, a question, first person...) was on the winning title,
 * among tests where only some of the titles had it.
 */
export function titleTestInsights(tests: TestEntry[]): TestInsight[] {
  const out = new Map<string, TestInsight>();
  for (const t of tests) {
    if (t.kind === "thumbnail" || t.winner < 0 || t.options.length < 2) continue;
    for (const [id, label, re] of PATTERNS) {
      const has = t.options.map((o) => re.test(o));
      if (has.every(Boolean) || !has.some(Boolean)) continue; // the style didn't differ between versions
      const row = out.get(id) ?? { label, wins: 0, tests: 0 };
      row.tests++;
      if (has[t.winner]) row.wins++;
      out.set(id, row);
    }
  }
  return [...out.values()].sort((a, b) => b.tests - a.tests || b.wins / b.tests - a.wins / a.tests);
}

export interface ThumbContext { keyword: string; videos: { title: string; channel: string; thumbnail: string; views: number; age_days: number }[] }
