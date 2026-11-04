/**
 * The engine: every operation the UI can ask for. Runs in the Electron main process
 * (real YouTube data) and, for `npm run web`, directly in the browser on demo data.
 */

import { Analytics, demoAudience, demoChannelVideos, demoGrowth, demoOpenings, demoOverview, demoRetention, demoSearchTerms, demoSeries } from "./analytics";
import { lengthReport, type SavedOpening, subscriberDrivers } from "./growth";
import { DemoYouTube, demoReddit, demoSuggestions } from "./demo";
import { checkDraft, playbook, type Draft } from "./optimize";
import { anglesRequest, claudeAiPrompt, metadataRequest } from "./prompts";
import { analyze, effectiveSmallMax, enrich, findOutliers, isBreakout, sizeClass, titleWords } from "./scoring";
import { autocomplete, expand, type Fetcher, redditTop } from "./sources";
import type { Store } from "./store";
import {
  type AIAngles, type AIMetadata, type Candidate, type Focus, type Idea, IDEA_STATUSES, type MyChannel, type OutlierResult, type PublicSettings,
  type RedditPost, type Report, type WeeklyCheckResult, type RetentionPlan, type Scan, type ScanMeta, type Settings, type Status, type Tracked, UserError, type VideoRow,
} from "./types";
import { csv, median, round } from "./util";
import { publishedAfterDays, YouTubeClient, type YouTubeSource } from "./youtube";

export const VERSION = "1.1.1";

export interface AIProvider {
  angles(apiKey: string, report: Report, note: string): Promise<AIAngles>;
  metadata(apiKey: string, draft: Draft, report: Report | null): Promise<{ feedback: string[]; metadata: AIMetadata; retention_plan: RetentionPlan }>;
}

export interface EngineOptions {
  /** true in the Electron app; false for the browser demo (always demo data). */
  desktop: boolean;
  ai?: AIProvider;
  /** fetch for sites that block scripted clients (Reddit). The desktop app passes Electron's Chromium-based fetch. */
  fetcher?: Fetcher;
}

export class Engine {
  readonly analytics: Analytics;
  private demoSource = new DemoYouTube();
  private real: YouTubeClient | null = null;
  private realKey = "";

  constructor(readonly store: Store, private opts: EngineOptions) {
    this.analytics = new Analytics(store);
  }

  private get settings(): Settings { return this.store.getSettings(); }

  isDemo(): boolean {
    return !this.opts.desktop || this.settings.demo_mode || !this.store.getSecret("youtube_api_key");
  }

  private yt(): YouTubeSource {
    if (this.isDemo()) return this.demoSource;
    const key = this.store.getSecret("youtube_api_key");
    if (!this.real || this.realKey !== key) {
      this.real = new YouTubeClient(key, this.store);
      this.realKey = key;
    }
    this.real.cacheMs = (this.settings.cache_hours || 12) * 3600 * 1000;
    return this.real;
  }

  // ------------------------------------------------------------------ status
  status(): Status {
    const s = this.settings;
    return {
      version: VERSION,
      demo: this.isDemo(),
      desktop: this.opts.desktop,
      has_youtube_key: Boolean(this.store.getSecret("youtube_api_key")),
      has_ai_key: Boolean(this.store.getSecret("anthropic_api_key")) && Boolean(this.opts.ai),
      analytics_connected: this.analytics.connected(),
      analytics_channel: s.analytics_channel,
      quota_used: this.store.quotaUsed(),
      quota_limit: s.daily_quota,
      quota_history: this.store.quotaHistory(),
      region: s.region,
      language: s.language,
      my_channel: s.my_channel,
      small_max: effectiveSmallMax(s),
      counts: { scans: this.store.countScans(), ideas: this.store.listIdeas().length, tracked: this.store.listTracked().length },
      onboarded: s.onboarded,
    };
  }

  // ---------------------------------------------------------------- settings
  getSettings(): PublicSettings {
    const hint = (v: string) => (v.length > 10 ? `${v.slice(0, 4)}…${v.slice(-4)}` : v ? "set" : "");
    return {
      ...this.settings,
      youtube_api_key_hint: hint(this.store.getSecret("youtube_api_key")),
      anthropic_api_key_hint: hint(this.store.getSecret("anthropic_api_key")),
      google_client_secret_hint: hint(this.store.getSecret("google_client_secret")),
      analytics_connected: this.analytics.connected(),
      data_dir: this.store.location,
    };
  }

  saveSettings(patch: Record<string, unknown>): PublicSettings {
    for (const k of ["youtube_api_key", "anthropic_api_key", "google_client_secret"] as const) {
      if (typeof patch[k] === "string") {
        const v = (patch[k] as string).trim();
        if (v) this.store.setSecret(k, v);
      }
      delete patch[k];
    }
    const clean: Partial<Settings> = {};
    const num = (v: unknown) => Math.max(1, Math.floor(Number(v)) || 0) || undefined;
    if (patch.region !== undefined) clean.region = String(patch.region).toUpperCase().slice(0, 2);
    if (patch.language !== undefined) clean.language = String(patch.language).trim().slice(0, 5) || "en";
    for (const k of ["small_channel_max", "big_channel_min", "daily_quota", "fresh_days", "cache_hours"] as const) {
      if (patch[k] !== undefined && num(patch[k])) (clean as any)[k] = num(patch[k]);
    }
    for (const k of ["demo_mode", "auto_small_threshold", "auto_update", "onboarded", "weekly_check"] as const) if (patch[k] !== undefined) clean[k] = Boolean(patch[k]);
    if (patch.google_client_id !== undefined) clean.google_client_id = String(patch.google_client_id).trim();
    if (patch.reddit_client_id !== undefined) clean.reddit_client_id = String(patch.reddit_client_id).trim().slice(0, 64);
    this.store.updateSettings(clean);
    return this.getSettings();
  }

  forgetSecret(name: "youtube_api_key" | "anthropic_api_key") {
    this.store.setSecret(name, null);
    return this.getSettings();
  }

  async testYouTube() {
    const key = this.store.getSecret("youtube_api_key");
    if (!key) throw new UserError("There’s no YouTube API key yet. Add one in Settings, under YouTube data.");
    await new YouTubeClient(key, this.store).test();
    return { ok: true };
  }

  clearCache() { return { cleared: this.store.cacheClear() }; }

  // ---------------------------------------------------------------- research
  async suggest(q: string): Promise<string[]> {
    if (this.isDemo()) return demoSuggestions(q);
    try { return await autocomplete(q, this.settings.language, this.settings.region, this.store); } catch { return []; }
  }

  private async rowsFor(ids: string[]) {
    const yt = this.yt();
    const videos = await yt.videos(ids);
    const channels = await yt.channels(videos.map((v) => v.snippet?.channelId).filter(Boolean));
    return { videos, channels };
  }

  /**
   * Score a topic. `focus` limits the competition to Shorts (searched with YouTube's under-4-minutes
   * filter, then kept to 3 minutes or less) or to long-form videos, for channels that only make one format.
   */
  async analyze(keyword: string, depth: "quick" | "deep" = "quick", focus: Focus = "all"): Promise<Report> {
    keyword = keyword.trim();
    if (!keyword) throw new UserError("Enter a topic to analyze.");
    if (focus !== "short" && focus !== "long") focus = "all";
    const s = this.settings, yt = this.yt();
    const before = this.store.quotaUsed();
    const videoDuration = focus === "short" ? "short" as const : undefined;
    const ids = await yt.search(keyword, { maxResults: 50, region: s.region, language: s.language, videoDuration });
    const recentIds = depth === "deep"
      ? await yt.search(keyword, { maxResults: 50, order: "viewCount", publishedAfter: publishedAfterDays(90), region: s.region, language: s.language, videoDuration })
      : [];
    const { videos, channels } = await this.rowsFor([...ids, ...recentIds]);
    const byId = new Map(videos.map((v) => [v.id, v]));
    const pick = (list: string[]) => list.map((i) => byId.get(i)).filter(Boolean);
    const keep = (r: VideoRow) => focus === "all" || (focus === "short" ? r.duration_s > 0 && r.duration_s <= 180 : r.format === "long");
    const fit = (r: VideoRow) => (focus === "short" ? { ...r, format: "short" as const } : r);
    const rows = enrich(pick(ids), channels, ids).filter(keep).map(fit);
    const recent = recentIds.length ? enrich(pick(recentIds), channels, recentIds).filter(keep).map(fit) : [];
    const report = analyze(keyword, rows, s, recent);
    report.focus = focus;
    if (focus !== "all") {
      report.formats.recommended = { format: focus, why: `Only ${focus === "short" ? "Shorts were" : "long-form videos were"} compared. Analyze with All videos to see which format does better for this topic.` };
      const what = focus === "short" ? "Shorts" : "long-form videos";
      report.reasons.unshift({ type: "info", text: rows.length >= 15
        ? `Scored against ${what} only: ${rows.length} of the top results.`
        : `Scored against ${what} only, but just ${rows.length} rank for this topic, so treat the score with caution.` });
    }
    report.demo = this.isDemo();
    report.depth = depth;
    report.suggestions = await this.suggest(keyword);
    report.quota_cost = this.store.quotaUsed() - before;
    report.created = Date.now() / 1000;
    report.playbook = playbook(report);
    report.scan_id = this.store.saveScan("analyze", keyword, report, report.score, report.verdict, Boolean(report.demo));
    if (this.store.isTracked(keyword)) this.store.addTrackPoint(keyword, this.point(report));
    return report;
  }

  private point(r: Report) {
    return { t: r.created ?? Date.now() / 1000, score: r.score, verdict: r.verdict, scan_id: r.scan_id!, demo: Boolean(r.demo) };
  }

  // ---------------------------------------------------------------- watchlist
  listTracked(): Tracked[] { return this.store.listTracked(); }

  /** Start tracking a topic. Seeds its history with the report it was tracked from, if any. */
  track(keyword: string, scanId?: number | null): Tracked {
    const scan = scanId ? this.store.getScan(scanId) : undefined;
    return this.store.track(keyword, scan?.kind === "analyze" ? this.point({ ...scan.payload, scan_id: scan.id }) : undefined);
  }

  untrack(keyword: string) { this.store.untrack(keyword); return { ok: true }; }

  /** Re-score a tracked topic with fresh data (a quick scan, same format focus as its last check) and record the result. */
  async refreshTracked(keyword: string): Promise<Tracked | undefined> {
    const t = this.store.listTracked().find((x) => x.keyword === keyword.trim().toLowerCase());
    const last = t?.history[t.history.length - 1];
    const focus = (last && (this.store.getScan(last.scan_id)?.payload as Report | undefined)?.focus) || "all";
    await this.analyze(keyword, "quick", focus);
    return this.store.listTracked().find((t) => t.keyword === keyword.trim().toLowerCase());
  }

  /**
   * The weekly watchlist check: re-scores every tracked topic once seven days have passed since the last run.
   * Skips sample data (unless allowSample) and stops before using more quota than today has left.
   */
  async weeklyCheck(o: { now?: number; force?: boolean; allowSample?: boolean } = {}): Promise<WeeklyCheckResult> {
    const s = this.settings, now = o.now ?? Date.now() / 1000;
    const skip = (skipped: string): WeeklyCheckResult => ({ ran: false, skipped, checked: 0, improved: [], dropped: [] });
    if (!s.weekly_check && !o.force) return skip("not_enabled");
    if (!o.force && now - (s.last_weekly_check || 0) < 7 * 86400) return skip("not_due");
    if (this.isDemo() && !o.allowSample) return skip("sample_data");
    const tracked = this.store.listTracked();
    if (!tracked.length) return skip("nothing_tracked");
    if (!this.isDemo() && s.daily_quota - this.store.quotaUsed() < tracked.length * 110) return skip("low_quota");
    const result: WeeklyCheckResult = { ran: true, checked: 0, improved: [], dropped: [] };
    for (const t of tracked) {
      const from = t.history[t.history.length - 1]?.score;
      try {
        const after = await this.refreshTracked(t.keyword);
        const to = after?.history[after.history.length - 1]?.score;
        result.checked++;
        if (from == null || to == null) continue;
        if (to - from >= 5 || (from < 55 && to >= 55)) result.improved.push({ keyword: t.keyword, from, to });
        else if (from - to >= 5) result.dropped.push({ keyword: t.keyword, from, to });
      } catch (e: any) {
        if (/quota|key/i.test(String(e?.message))) break;
      }
    }
    this.store.updateSettings({ last_weekly_check: now });
    return result;
  }

  async discover(seed: string, mode: "full" | "alphabet" | "questions" = "full"): Promise<Candidate[]> {
    if (!seed.trim()) throw new UserError("Enter a niche to explore.");
    if (this.isDemo()) {
      const base = mode === "questions"
        ? ["why", "how does", "what happens when", "why does", "how did", "is", "what is the", "why is"].map((q) => `${q} ${seed}`)
        : [...demoSuggestions(seed), `how to ${seed}`, `why ${seed}`, `is ${seed} worth it`, `best ${seed}`];
      return base.map((keyword, i) => ({ keyword, source: "demo", hits: 1 + (i % 4) }));
    }
    return expand(seed, mode, this.settings.language, this.settings.region, this.store);
  }

  async outliers(o: { keyword: string; days: number; max_subs?: number | null; format?: string }): Promise<OutlierResult> {
    const s = this.settings, yt = this.yt();
    const days = Math.max(1, Math.min(o.days || 90, 3650));
    const ids = await yt.search(o.keyword, { maxResults: 50, order: "viewCount", publishedAfter: publishedAfterDays(days), region: s.region, language: s.language });
    const { videos, channels } = await this.rowsFor(ids);
    const rows = enrich(videos, channels, ids);
    const maxSubs = o.max_subs ? Math.max(100, Math.floor(o.max_subs)) : effectiveSmallMax(s);
    let found = findOutliers(rows, maxSubs);
    if (o.format === "short" || o.format === "long") found = found.filter((r) => r.format === o.format);
    const result: OutlierResult = { keyword: o.keyword, days, max_subs: maxSubs, videos: found, scanned: rows.length, demo: this.isDemo() };
    result.scan_id = this.store.saveScan("outliers", o.keyword, result, null, `${found.length} outliers`, result.demo);
    return result;
  }

  categories() { return this.yt().categories(this.settings.region); }

  async trending(region?: string, category?: string) {
    const s = this.settings, yt = this.yt();
    const vids = await yt.trending(region || s.region, category || undefined);
    const chans = await yt.channels(vids.map((v) => v.snippet.channelId));
    const rows = enrich(vids, chans, vids.map((v) => v.id));
    const smallMax = effectiveSmallMax(s);
    for (const r of rows) { r.size = sizeClass(r.subs, smallMax, s.big_channel_min); r.breakout = isBreakout(r, smallMax); }
    return { videos: rows, title_words: titleWords(rows.map((r) => r.title), new Set()), small_max: smallMax, demo: this.isDemo() };
  }

  async reddit(sub: string, period = "week"): Promise<{ posts: RedditPost[]; demo: boolean }> {
    if (!["day", "week", "month", "year", "all"].includes(period)) period = "week";
    // Reddit needs no YouTube key, so it's live in the desktop app unless sample data is switched on.
    if (!this.opts.desktop || this.settings.demo_mode) return { posts: demoReddit(sub), demo: true };
    return { posts: await redditTop(sub, period, 30, { fetcher: this.opts.fetcher, clientId: this.settings.reddit_client_id, store: this.store }), demo: false };
  }

  // -------------------------------------------------------------- my channel
  async connectChannel(text: string): Promise<MyChannel> {
    if (text.trim().length < 2) throw new UserError("Enter your @handle or channel URL.");
    const yt = this.yt();
    const ch = await yt.channelLookup(text);
    if (!ch) throw new UserError("That channel couldn’t be found. Check the @handle, or paste the channel URL.");
    const st = ch.statistics ?? {};
    const uploads = ch.contentDetails?.relatedPlaylists?.uploads;
    const recent = uploads ? await yt.recentUploads(uploads, 15) : [];
    const rows = enrich(recent, [ch]);
    const info: MyChannel = {
      id: ch.id, title: ch.snippet?.title ?? "", handle: ch.snippet?.customUrl, thumb: ch.snippet?.thumbnails?.default?.url ?? "",
      subs: st.hiddenSubscriberCount ? null : parseInt(st.subscriberCount ?? "0", 10), videos: parseInt(st.videoCount ?? "0", 10),
      views: parseInt(st.viewCount ?? "0", 10), median_recent_views: Math.floor(median(rows.map((r) => r.views))),
      shorts_share: rows.length ? round(rows.filter((r) => r.format === "short").length / rows.length, 2) : 0,
      updated: Date.now() / 1000, demo: this.isDemo(),
    };
    this.store.updateSettings({ my_channel: info });
    return info;
  }

  forgetChannel() { this.store.updateSettings({ my_channel: null }); return { ok: true }; }

  // ---------------------------------------------------------------------- AI
  private aiKey() {
    if (!this.opts.ai) throw new UserError("AI features are available in the desktop app.");
    const key = this.store.getSecret("anthropic_api_key");
    if (!key) throw new UserError("Add an Anthropic API key in Settings to use AI features.");
    return key;
  }

  async aiAngles(scanId: number): Promise<AIAngles> {
    const scan = this.store.getScan(scanId);
    if (!scan || scan.kind !== "analyze") throw new UserError("Run a topic analysis first.");
    const mine = this.settings.my_channel;
    const result = await this.opts.ai!.angles(this.aiKey(), scan.payload, mine ? `${mine.title} has ${mine.subs} subscribers.` : "");
    this.store.updateScanPayload(scanId, { ...scan.payload, ai: result });
    return result;
  }

  /** The angles request as a message to paste into Claude.ai (no API key needed). */
  aiPrompt(scanId: number): string {
    const scan = this.store.getScan(scanId);
    if (!scan || scan.kind !== "analyze") throw new UserError("Run a topic analysis first.");
    const mine = this.settings.my_channel;
    return claudeAiPrompt(anglesRequest(scan.payload, mine ? `${mine.title} has ${mine.subs} subscribers.` : ""), "angles");
  }

  /** The draft review request as a message to paste into Claude.ai (no API key needed). */
  aiDraftPrompt(draft: Draft & { scan_id?: number | null }): string {
    return claudeAiPrompt(metadataRequest(draft, this.reportFor(draft.keyword ?? "", draft.scan_id)), "metadata");
  }

  async aiMetadata(draft: Draft & { scan_id?: number | null }) {
    const key = this.aiKey();
    return this.opts.ai!.metadata(key, draft, this.reportFor(draft.keyword ?? "", draft.scan_id));
  }

  // ---------------------------------------------------------------- optimizer
  private reportFor(keyword: string, scanId?: number | null): Report | null {
    if (scanId) {
      const scan = this.store.getScan(scanId);
      return scan?.kind === "analyze" ? scan.payload : null;
    }
    const kw = keyword.trim().toLowerCase();
    if (!kw) return null;
    const meta = this.store.listScans("analyze").find((s) => s.query.trim().toLowerCase() === kw);
    return meta ? (this.store.getScan(meta.id)?.payload ?? null) : null;
  }

  optimizeCheck(draft: Draft & { scan_id?: number | null }) {
    const report = this.reportFor(draft.keyword ?? "", draft.scan_id);
    if (report && !report.playbook) report.playbook = playbook(report);
    return {
      ...checkDraft(draft, report),
      playbook: report?.playbook ?? null,
      report: report ? { keyword: report.keyword, score: report.score, verdict: report.verdict } : null,
    };
  }

  // ---------------------------------------------------------------- analytics
  analyticsStatus() {
    return {
      connected: this.analytics.connected(),
      has_client: Boolean(this.settings.google_client_id && this.store.getSecret("google_client_secret")),
      channel: this.settings.analytics_channel,
      desktop: this.opts.desktop,
    };
  }

  async analyticsOverview(days = 28, demo = false) {
    days = Math.max(7, Math.min(days, 365));
    if (demo || !this.opts.desktop || !this.analytics.connected()) return demoOverview(days);
    return this.analytics.overview(days);
  }

  async analyticsRetention(videoId: string, demo = false) {
    if (demo || !this.opts.desktop || !this.analytics.connected() || videoId.startsWith("demo")) return demoRetention(videoId);
    return this.analytics.retention(videoId);
  }

  /** Your videos grouped into series over the last year, with cross-format ideas. */
  async analyticsSeries(demo = false) {
    if (demo || !this.opts.desktop || !this.analytics.connected()) return demoSeries();
    return this.analytics.series(365);
  }

  /** How well the openings of your most-viewed videos hold viewers. */
  async analyticsOpenings(demo = false) {
    if (demo || !this.opts.desktop || !this.analytics.connected()) return demoOpenings();
    return this.analytics.openings(12);
  }

  private get live() { return this.opts.desktop && this.analytics.connected(); }

  /** Partner Program progress with time estimates. */
  async analyticsGrowth(demo = false) { return demo || !this.live ? demoGrowth() : this.analytics.growth(); }

  /** The YouTube searches that brought viewers to your videos. */
  async analyticsSearchTerms(days = 28, demo = false) {
    days = Math.max(7, Math.min(days, 365));
    return demo || !this.live ? demoSearchTerms() : this.analytics.searchTerms(days);
  }

  async analyticsAudience(days = 28, demo = false) {
    days = Math.max(7, Math.min(days, 365));
    return demo || !this.live ? demoAudience() : this.analytics.audience(days);
  }

  /** Best lengths for Shorts and long videos, and the videos that bring subscribers, over the last 12 months. */
  async analyticsCatalog(demo = false) {
    const videos = demo || !this.live ? demoChannelVideos() : (await this.analytics.channelVideos(365)).videos;
    return { short: lengthReport(videos, "short"), long: lengthReport(videos, "long"), ...subscriberDrivers(videos), demo: demo || !this.live };
  }

  // Opening library: openings you want to reuse, with the first line you said.
  listSavedOpenings(): SavedOpening[] { return this.store.getDoc<SavedOpening[]>("openings", []); }
  saveOpening(o: Omit<SavedOpening, "id" | "saved" | "line"> & { line?: string }): SavedOpening[] {
    const list = this.listSavedOpenings().filter((x) => x.video !== o.video);
    list.unshift({ ...o, line: (o.line ?? "").slice(0, 300), id: `${o.video}-${Date.now().toString(36)}`, saved: Date.now() / 1000 });
    this.store.setDoc("openings", list.slice(0, 100));
    return this.listSavedOpenings();
  }
  updateSavedOpening(id: string, line: string): SavedOpening[] {
    this.store.setDoc("openings", this.listSavedOpenings().map((x) => (x.id === id ? { ...x, line: line.slice(0, 300) } : x)));
    return this.listSavedOpenings();
  }
  deleteSavedOpening(id: string): SavedOpening[] {
    this.store.setDoc("openings", this.listSavedOpenings().filter((x) => x.id !== id));
    return this.listSavedOpenings();
  }

  async analyticsDisconnect() { await this.analytics.disconnect(); return { ok: true }; }

  // -------------------------------------------------------------------- scans
  listScans(kind?: ScanMeta["kind"]): ScanMeta[] { return this.store.listScans(kind); }

  getScan(id: number): Scan {
    const scan = this.store.getScan(id);
    if (!scan) throw new UserError("That report was deleted. Open another one from History.");
    return scan;
  }

  deleteScan(id: number) { this.store.deleteScan(id); return { ok: true }; }

  scanCsv(id: number) {
    const scan = this.getScan(id);
    const vids = [...(scan.payload.videos ?? []), ...(scan.payload.recent ?? [])];
    const cols = ["rank", "title", "channel_title", "subs", "views", "vpd", "outlier", "multiple", "engagement", "age_days", "format", "duration_s", "url"];
    return { filename: `nicheradar-${scan.query.slice(0, 40).replace(/[^\w.-]+/g, "_")}.csv`, text: csv(vids, cols) };
  }

  // -------------------------------------------------------------------- ideas
  listIdeas(): { ideas: Idea[]; statuses: readonly string[] } { return { ideas: this.store.listIdeas(), statuses: IDEA_STATUSES }; }
  addIdea(data: Partial<Idea>) { return this.store.addIdea(data); }
  updateIdea(id: number, data: Partial<Idea>) {
    const idea = this.store.updateIdea(id, data);
    if (!idea) throw new UserError("That idea was deleted. Refresh the idea board.");
    return idea;
  }
  deleteIdea(id: number) { this.store.deleteIdea(id); return { ok: true }; }
  ideasCsv() {
    return { filename: "nicheradar-ideas.csv", text: csv(this.store.listIdeas() as any, ["title", "keyword", "score", "verdict", "format", "status", "notes"]) };
  }
}

/** Methods the UI may call over IPC (everything else on Engine stays internal). */
export const ENGINE_METHODS = [
  "status", "getSettings", "saveSettings", "forgetSecret", "testYouTube", "clearCache", "suggest", "analyze", "discover", "outliers",
  "categories", "trending", "reddit", "connectChannel", "forgetChannel", "aiAngles", "aiMetadata", "aiPrompt", "aiDraftPrompt", "optimizeCheck", "analyticsStatus",
  "analyticsOverview", "analyticsRetention", "analyticsSeries", "analyticsOpenings", "analyticsGrowth", "analyticsSearchTerms", "analyticsAudience", "analyticsCatalog",
  "listSavedOpenings", "saveOpening", "updateSavedOpening", "deleteSavedOpening", "analyticsDisconnect", "listScans", "getScan", "deleteScan", "scanCsv", "listIdeas",
  "addIdea", "updateIdea", "deleteIdea", "ideasCsv", "listTracked", "track", "untrack", "refreshTracked",
] as const;
export type EngineMethod = (typeof ENGINE_METHODS)[number];
