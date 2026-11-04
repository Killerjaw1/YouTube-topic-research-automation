/** Shared types for the engine (main process / web demo) and the UI. */

export type SizeClass = "small" | "mid" | "big" | "unknown";
export type VideoFormat = "short" | "long";
/** Which videos a topic is scored against: everything that ranks, Shorts only, or long-form only. */
export type Focus = "all" | "short" | "long";
export type Tone = "great" | "good" | "warn" | "bad";

export interface MyChannel {
  id: string;
  title: string;
  handle?: string;
  thumb: string;
  subs: number | null;
  videos: number;
  views: number;
  median_recent_views: number;
  shorts_share: number;
  updated: number;
  demo: boolean;
}

export interface Settings {
  region: string;
  language: string;
  demo_mode: boolean;
  daily_quota: number;
  small_channel_max: number;
  big_channel_min: number;
  auto_small_threshold: boolean;
  fresh_days: number;
  cache_hours: number;
  my_channel: MyChannel | null;
  google_client_id: string;
  analytics_channel: { id: string; title: string; thumb: string; subs: number } | null;
  auto_update: boolean;
  onboarded: boolean;
  /** Re-score the watchlist once a week while the desktop app is open. */
  weekly_check: boolean;
  /** When the weekly check last ran (seconds since epoch), or 0. */
  last_weekly_check: number;
}

export interface WeeklyCheckResult {
  ran: boolean;
  /** Why it didn't run: not_enabled, not_due, sample_data, nothing_tracked or low_quota. */
  skipped?: string;
  checked: number;
  /** Topics whose score rose by 5 or more, or that crossed into the good range (55+). */
  improved: { keyword: string; from: number; to: number }[];
  dropped: { keyword: string; from: number; to: number }[];
}

export const DEFAULT_SETTINGS: Settings = {
  region: "US",
  language: "en",
  demo_mode: false,
  daily_quota: 10000,
  small_channel_max: 50000,
  big_channel_min: 1000000,
  auto_small_threshold: true,
  fresh_days: 180,
  cache_hours: 12,
  my_channel: null,
  google_client_id: "",
  analytics_channel: null,
  auto_update: true,
  onboarded: false,
  weekly_check: false,
  last_weekly_check: 0,
};

/** Values kept apart from settings and encrypted at rest in the desktop app. */
export type SecretName = "youtube_api_key" | "anthropic_api_key" | "google_client_secret" | "google_tokens";

export interface VideoRow {
  id: string;
  rank: number | null;
  title: string;
  channel_id: string;
  channel_title: string;
  published_at: string | null;
  age_days: number;
  views: number;
  likes: number;
  comments: number;
  duration_s: number;
  format: VideoFormat;
  thumbnail: string;
  subs: number | null;
  channel_videos: number;
  channel_avg_views: number | null;
  /** views relative to the channel's average video */
  multiple: number | null;
  vpd: number;
  /** views ÷ subscribers */
  outlier: number | null;
  engagement: number;
  url: string;
  tags: string[];
  size?: SizeClass;
  breakout?: boolean;
}

export interface Reason {
  type: "good" | "bad" | "info";
  text: string;
}

export interface FormatStats {
  count: number;
  median_vpd: number;
  median_views: number;
  breakouts: number;
  small_share: number;
}

export interface Subscores {
  demand: number;
  breakout: number;
  openness: number;
  freshness: number;
}

export interface TitlePattern {
  key: string;
  label: string;
  share: number;
}

export interface Playbook {
  titles: string[];
  title_patterns: TitlePattern[];
  title_length: { avg: number | null; ideal: [number, number] };
  tags: string[];
  tags_chars: number;
  hashtags: string[];
  description: string;
  length: { long?: { low_min: number; high_min: number; median_min: number; n: number }; short?: { median_s: number; n: number } };
  recommended_format: string;
  checklist: { ctr: string[]; watch_time: string[]; shorts: string[]; metadata: string[] };
}

export interface AIMetadata {
  title_options: string[];
  description: string;
  tags: string[];
  hashtags: string[];
  thumbnail_concepts: string[];
  pinned_comment: string;
}

export interface RetentionPlan {
  hook_script: string;
  target_length: string;
  outline: string[];
  tips: string[];
}

export interface AIAngles {
  summary: string;
  avoid: string[];
  angles: { angle: string; why_it_can_win: string; format: "short" | "long" | "both"; titles: string[]; hook: string; thumbnail_text: string }[];
  shorts_ideas: string[];
  keywords_to_research: string[];
  metadata: AIMetadata;
  retention_plan: RetentionPlan;
}

export interface Report {
  keyword: string;
  score: number;
  verdict: string;
  tone: Tone;
  subscores: Subscores;
  metrics: Record<string, number | boolean>;
  reasons: Reason[];
  formats: { short?: FormatStats; long?: FormatStats; recommended?: { format: string; why: string } };
  videos: VideoRow[];
  recent: VideoRow[];
  title_words: { word: string; count: number }[];
  thresholds: { small_max: number; big_min: number; fresh_days?: number };
  demo?: boolean;
  depth?: "quick" | "deep";
  focus?: Focus;
  suggestions?: string[];
  quota_cost?: number;
  created?: number;
  scan_id?: number;
  playbook?: Playbook | null;
  ai?: AIAngles;
}

export interface OutlierResult {
  keyword: string;
  days: number;
  max_subs: number;
  videos: VideoRow[];
  scanned: number;
  demo: boolean;
  scan_id?: number;
}

export interface ScanMeta {
  id: number;
  kind: "analyze" | "outliers";
  query: string;
  created: number;
  score: number | null;
  verdict: string | null;
  demo: boolean;
}

export interface Scan extends ScanMeta {
  payload: any;
}

export const IDEA_STATUSES = ["idea", "researching", "scripting", "filming", "uploaded"] as const;
export type IdeaStatus = (typeof IDEA_STATUSES)[number];

export interface Idea {
  id: number;
  title: string;
  keyword: string;
  score: number | null;
  verdict: string | null;
  format: string | null;
  status: IdeaStatus;
  notes: string;
  scan_id: number | null;
  created: number;
  updated: number;
}

export interface TrackPoint { t: number; score: number; verdict: string; scan_id: number; demo: boolean }

export interface Tracked {
  keyword: string;
  added: number;
  history: TrackPoint[];
}

export interface Candidate {
  keyword: string;
  source: string;
  hits: number;
}

export interface RedditPost {
  title: string;
  score: number;
  comments: number;
  url: string;
  flair: string;
}

export interface DraftCheck {
  group: string;
  status: "pass" | "warn" | "fail" | "info";
  text: string;
  fix: string;
}

export interface Status {
  version: string;
  demo: boolean;
  desktop: boolean;
  has_youtube_key: boolean;
  has_ai_key: boolean;
  analytics_connected: boolean;
  analytics_channel: Settings["analytics_channel"];
  quota_used: number;
  quota_limit: number;
  quota_history: { day: string; units: number }[];
  region: string;
  language: string;
  my_channel: MyChannel | null;
  small_max: number;
  counts: { scans: number; ideas: number; tracked: number };
  onboarded: boolean;
}

/** Settings as shown to the UI: secrets replaced by masked hints. */
export interface PublicSettings extends Settings {
  youtube_api_key_hint: string;
  anthropic_api_key_hint: string;
  google_client_secret_hint: string;
  analytics_connected: boolean;
  data_dir: string;
}

export class UserError extends Error {
  constructor(message: string, public kind = "UserError") {
    super(message);
  }
}
