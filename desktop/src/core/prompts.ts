/**
 * What NicheRadar asks Claude. Used two ways:
 * - with an Anthropic API key, the desktop app sends these and gets structured answers back (main/ai.ts);
 * - without one, "Copy for Claude.ai" puts the same request on the clipboard to paste into a Claude.ai chat,
 *   so a Claude plan (Pro, Max, Team) can be used instead of the API.
 */

import type { Draft } from "./optimize";
import type { Report } from "./types";

export const SYSTEM_PROMPT =
  "You are a YouTube growth strategist who helps brand-new, small channels pick video angles that YouTube will recommend. " +
  "Small channels lose when they make the same broad video big channels already rank for, because YouTube recommends the " +
  "established channel instead. They win with specific, differentiated angles: narrower audiences, fresher takes, personal " +
  "experiments, underserved questions, and formats the big channels skip. Base every suggestion on the research data you are " +
  "given. Keep titles under 70 characters and avoid misleading clickbait.";

/** The research behind a report, as plain text: score, findings, what ranks and what broke out. */
export function brief(report: Report): string {
  const line = (v: Report["videos"][number]) =>
    `- "${v.title}" | ${v.channel_title} (${v.subs ?? "hidden"} subs) | ${v.views} views | ${Math.round(v.age_days)} days old | ${v.format}`;
  const breakouts = [...report.videos, ...report.recent].filter((v) => v.breakout).slice(0, 8);
  const focus = report.focus === "short" ? " (scored against Shorts only)" : report.focus === "long" ? " (scored against long-form videos only)" : "";
  return [
    `Topic: ${report.keyword}`,
    `Opportunity score: ${report.score}/100 (${report.verdict})${focus}`,
    `Sub-scores: ${JSON.stringify(report.subscores)}`,
    `Small channel = under ${report.thresholds.small_max} subs; big = ${report.thresholds.big_min}+ subs.`,
    "Findings:",
    ...report.reasons.map((r) => `- ${r.text}`),
    `Format data: ${JSON.stringify(report.formats)}`,
    "",
    "Current top search results:",
    ...report.videos.slice(0, 15).map(line),
    "",
    "Small-channel breakouts (videos far outperforming their channel size):",
    ...(breakouts.length ? breakouts.map(line) : ["- none found"]),
    "",
    "Words common in the best-performing titles: " + report.title_words.map((w) => w.word).join(", "),
  ].join("\n");
}

export function anglesRequest(report: Report, note = ""): string {
  return `${brief(report)}${note ? `\n\nAbout my channel: ${note}` : ""}

Give me 5 differentiated angles a small channel can realistically win with, plus Shorts ideas, narrower keywords to research next, ready-to-paste upload metadata for the strongest angle, and a retention plan for that video.`;
}

export function metadataRequest(draft: Draft, report: Report | null): string {
  const parts = [
    "Here is my draft upload. Critique it for click-through rate and watch time, then rewrite the metadata.",
    `Target search keyword: ${draft.keyword || "(not set)"}`,
    `Format: ${draft.format ?? "long"}${draft.minutes ? `, about ${draft.minutes} minutes` : ""}`,
    `Draft title: ${draft.title || "(empty)"}`,
    `Draft description:\n${draft.description || "(empty)"}`,
    `Draft tags: ${draft.tags || "(empty)"}`,
  ];
  if (report) parts.push("", "Research on this topic:", brief(report));
  return parts.join("\n");
}

const ANGLES_LAYOUT = `Answer with these sections, using headings:
1. Summary: 2–3 sentences on how a small channel should approach this topic.
2. Avoid: angles big channels already own.
3. Five angles: for each, the angle, why it can win, format (Short, long or both), 3 title options, a hook for the first 5–10 seconds, and 2–4 words of thumbnail text.
4. Shorts ideas.
5. Keywords to research next.
6. Upload metadata for the strongest angle: 5 titles of 60 characters or fewer, a full description (2-line summary, chapters from 0:00, call to action, 3 hashtags at the end), 10–15 tags under 500 characters in total, 3 thumbnail concepts, and a pinned comment.
7. Retention plan: a word-for-word hook for the first 15 seconds, target length, a section-by-section outline with timestamps and open loops, and tips.`;

const METADATA_LAYOUT = `Answer with these sections, using headings:
1. Feedback: specific problems with the draft and why they hurt click-through or watch time.
2. Rewritten metadata: 5 titles of 60 characters or fewer, a full description (2-line summary, chapters from 0:00, call to action, 3 hashtags at the end), 10–15 tags under 500 characters in total, 3 thumbnail concepts, and a pinned comment.
3. Retention plan: a word-for-word hook for the first 15 seconds, target length, a section-by-section outline with timestamps, and tips.`;

/** A self-contained message to paste into Claude.ai: the role, the research, the request and the answer layout. */
export function claudeAiPrompt(request: string, kind: "angles" | "metadata"): string {
  return [SYSTEM_PROMPT, "", "Research from NicheRadar, my YouTube topic research app:", "", request, "", kind === "angles" ? ANGLES_LAYOUT : METADATA_LAYOUT].join("\n");
}

// ------------------------------------------------------------- helpers for Claude.ai
export interface ScriptRequest {
  topic: string;
  title?: string;
  format: "short" | "long";
  /** Target length in seconds. */
  seconds?: number;
  notes?: string;
}

/** A Shorts (or long-video) script request, with the creator's own best openings as style examples. */
export function scriptPrompt(r: ScriptRequest, openings: { title: string; line: string; hold: number; at_s: number }[], report: Report | null): string {
  const short = r.format === "short";
  const secs = r.seconds ?? (short ? 45 : 600);
  const examples = openings.filter((o) => o.line.trim()).slice(0, 5);
  return [
    `You write scripts for a small YouTube channel that makes curiosity-driven explainer ${short ? "Shorts" : "videos"}.`,
    "",
    `Topic: ${r.topic}`,
    r.title ? `Working title: ${r.title}` : "",
    `Format: ${short ? `a vertical Short of about ${secs} seconds` : `a long video of about ${Math.round(secs / 60)} minutes`}`,
    r.notes ? `My notes: ${r.notes}` : "",
    examples.length ? ["", "Openings that kept the most viewers on my channel (match this style and pace):",
      ...examples.map((o) => `- "${o.line.trim()}" (from “${o.title}”, ${Math.round(o.hold * 100)}% still watching at ${o.at_s} s)`)].join("\n") : "",
    report ? ["", "Research on this topic from NicheRadar:", brief(report)].join("\n") : "",
    "",
    short
      ? `Write the script with these sections:
1. Hook (first 1–2 seconds): state the question or the surprising claim immediately, with what's on screen.
2. Setup: the one fact the viewer needs.
3. Payoff: the answer, with the most surprising detail.
4. Loop ending: a last line that leads naturally back into the first line, so the Short replays smoothly.
Mark each line with a timestamp and a short on-screen note (visual, text overlay). Keep sentences short and spoken.
Then give 3 title options under 60 characters, 2–4 words of on-screen text for the first frame, and the related long video this Short could point to.`
      : `Write the script with these sections:
1. Hook (first 15 seconds): the question, why it matters, and a promise of the payoff.
2. Sections with timestamps, each ending in an open loop that carries viewers to the next.
3. Payoff and a closing line that points to a related video.
Mark visuals and on-screen text. Then give 3 title options under 60 characters, chapter titles, and 3 thumbnail ideas.`,
  ].filter((l) => l !== "").join("\n");
}

export function translatePrompt(d: { title: string; description: string; tags: string }, languages: string[]): string {
  return [
    "Translate my YouTube title and description for viewers in other languages. I'll add these in YouTube Studio under Languages, so each viewer sees their own language.",
    "",
    `Languages: ${languages.join(", ")}`,
    "",
    `Title: ${d.title || "(empty)"}`,
    `Description:\n${d.description || "(empty)"}`,
    d.tags ? `Tags (for context only): ${d.tags}` : "",
    "",
    "For each language: a natural, idiomatic title under 70 characters (not word for word; keep the curiosity and the keyword people would actually search in that language), then the full description. Keep timestamps, links and hashtags as they are. Add one line noting any phrase that doesn't translate well and what you chose instead.",
  ].filter((l) => l !== "").join("\n");
}

export function factCheckPrompt(script: string, topic: string): string {
  return [
    "Fact-check this script for my YouTube explainer before I record it. Accuracy matters: viewers correct mistakes in the comments, and a wrong fact costs trust.",
    "",
    topic ? `Topic: ${topic}` : "",
    "Script:",
    script.trim() || "(paste the script here)",
    "",
    `Answer with:
1. Each factual claim, marked Correct, Needs nuance, Wrong or Can't verify, with a one-line explanation.
2. For anything not Correct, a corrected line I can say instead, in the same tone and length.
3. Sources I can check for the key facts (say if you're unsure a source exists, rather than inventing one).
4. Anything an expert viewer would object to, even if technically true.`,
  ].filter((l) => l !== "").join("\n");
}
