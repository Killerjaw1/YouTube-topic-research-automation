/**
 * Optional AI features using Claude (needs an Anthropic API key in Settings).
 *
 * Given a scored topic (what big channels already rank with, and what small-channel
 * breakouts did differently) Claude proposes differentiated angles, ready-to-paste
 * metadata and a retention plan, so the video isn't a clone of what big channels own.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { AIProvider } from "../core/engine";
import type { Draft } from "../core/optimize";
import { type Report, UserError } from "../core/types";

const MODEL = "claude-opus-5-5";

const SYSTEM =
  "You are a YouTube growth strategist who helps brand-new, small channels pick video angles that YouTube will recommend. " +
  "Small channels lose when they make the same broad video big channels already rank for, because YouTube recommends the " +
  "established channel instead. They win with specific, differentiated angles: narrower audiences, fresher takes, personal " +
  "experiments, underserved questions, and formats the big channels skip. Base every suggestion on the research data you are " +
  "given. Keep titles under 70 characters and avoid misleading clickbait.";

const str = { type: "string" } as const;
const strs = { type: "array", items: { type: "string" } } as const;

const METADATA = {
  type: "object",
  description: "Ready-to-paste upload metadata for the strongest angle.",
  properties: {
    title_options: { ...strs, description: "5 titles, each 60 characters or fewer, keyword early." },
    description: { ...str, description: "Full description: 2-line keyword-rich summary, chapters starting 0:00, call to action, up to 3 hashtags at the end." },
    tags: { ...strs, description: "10-15 tags, under 500 characters total." },
    hashtags: { ...strs, description: "Exactly 3, each starting with #." },
    thumbnail_concepts: { ...strs, description: "3 thumbnail ideas: subject, expression/visual, 2-4 words of text." },
    pinned_comment: str,
  },
  required: ["title_options", "description", "tags", "hashtags", "thumbnail_concepts", "pinned_comment"],
  additionalProperties: false,
};

const RETENTION = {
  type: "object",
  description: "How to structure the video to maximise watch time.",
  properties: {
    hook_script: { ...str, description: "Word-for-word first 15 seconds." },
    target_length: str,
    outline: { ...strs, description: "Section-by-section structure with approximate timestamps and the open loop that carries viewers forward." },
    tips: strs,
  },
  required: ["hook_script", "target_length", "outline", "tips"],
  additionalProperties: false,
};

const ANGLES_SCHEMA = {
  type: "object",
  properties: {
    summary: { ...str, description: "2-3 sentences: how a small channel should approach this topic." },
    avoid: { ...strs, description: "Angles big channels already own that a small channel should not copy." },
    angles: {
      type: "array",
      items: {
        type: "object",
        properties: {
          angle: str,
          why_it_can_win: str,
          format: { type: "string", enum: ["short", "long", "both"] },
          titles: strs,
          hook: { ...str, description: "First 5-10 seconds of the video." },
          thumbnail_text: { ...str, description: "2-4 words." },
        },
        required: ["angle", "why_it_can_win", "format", "titles", "hook", "thumbnail_text"],
        additionalProperties: false,
      },
    },
    shorts_ideas: strs,
    keywords_to_research: { ...strs, description: "Narrower search phrases worth scoring next." },
    metadata: METADATA,
    retention_plan: RETENTION,
  },
  required: ["summary", "avoid", "angles", "shorts_ideas", "keywords_to_research", "metadata", "retention_plan"],
  additionalProperties: false,
};

const METADATA_SCHEMA = {
  type: "object",
  properties: {
    feedback: { ...strs, description: "Specific problems with the draft and why they hurt CTR or watch time." },
    metadata: METADATA,
    retention_plan: RETENTION,
  },
  required: ["feedback", "metadata", "retention_plan"],
  additionalProperties: false,
};

function brief(report: Report): string {
  const line = (v: Report["videos"][number]) =>
    `- "${v.title}" | ${v.channel_title} (${v.subs ?? "hidden"} subs) | ${v.views} views | ${Math.round(v.age_days)} days old | ${v.format}`;
  const breakouts = [...report.videos, ...report.recent].filter((v) => v.breakout).slice(0, 8);
  return [
    `Topic: ${report.keyword}`,
    `Opportunity score: ${report.score}/100 (${report.verdict})`,
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

async function call<T>(apiKey: string, prompt: string, schema: object): Promise<T> {
  const client = new Anthropic({ apiKey });
  let response;
  try {
    response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: SYSTEM,
      messages: [{ role: "user", content: prompt }],
      output_config: { effort: "medium", format: { type: "json_schema", schema: schema as any } },
      // If a safety classifier declines the request, retry server-side on Anthropic's recommended fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new UserError("Anthropic didn’t accept the API key. Check it in Settings, under AI assistant.");
    if (e instanceof Anthropic.RateLimitError) throw new UserError("Anthropic is limiting requests right now. Wait a minute and try again.");
    if (e instanceof Anthropic.APIConnectionError) throw new UserError("Anthropic couldn’t be reached. Check your internet connection and try again.");
    if (e instanceof Anthropic.APIError) throw new UserError(`Anthropic returned an error (${e.status}): ${e.message}`);
    throw e;
  }
  if (response.stop_reason === "refusal") throw new UserError("Claude didn’t write suggestions for this topic. Try a different wording.");
  if (response.stop_reason === "max_tokens") throw new UserError("Claude’s answer was cut off before it finished. Try again.");
  const text = response.content.find((b) => b.type === "text");
  try {
    return JSON.parse(text && "text" in text ? text.text : "") as T;
  } catch {
    throw new UserError("Claude’s answer couldn’t be read. Try again.");
  }
}

export const claude: AIProvider = {
  angles(apiKey, report, note) {
    const prompt = `${brief(report)}${note ? `\n\nAbout my channel: ${note}` : ""}

Give me 5 differentiated angles a small channel can realistically win with, plus Shorts ideas, narrower keywords to research next, ready-to-paste upload metadata for the strongest angle, and a retention plan for that video.`;
    return call(apiKey, prompt, ANGLES_SCHEMA);
  },
  metadata(apiKey, draft: Draft, report) {
    const parts = [
      "Here is my draft upload. Critique it for click-through rate and watch time, then rewrite the metadata.",
      `Target search keyword: ${draft.keyword || "(not set)"}`,
      `Format: ${draft.format ?? "long"}${draft.minutes ? `, about ${draft.minutes} minutes` : ""}`,
      `Draft title: ${draft.title || "(empty)"}`,
      `Draft description:\n${draft.description || "(empty)"}`,
      `Draft tags: ${draft.tags || "(empty)"}`,
    ];
    if (report) parts.push("", "Research on this topic:", brief(report));
    return call(apiKey, parts.join("\n"), METADATA_SCHEMA);
  },
};
