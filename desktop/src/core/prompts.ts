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
