/**
 * YouTube Analytics: your own channel's private stats.
 *
 * Google OAuth 2.0 for installed apps, with PKCE and a loopback redirect that the
 * desktop app's main process listens on. You create your own (free) OAuth client in
 * Google Cloud, so your data only ever goes between your computer and Google.
 * Scopes are read-only: yt-analytics.readonly and youtube.readonly.
 */

import { type ChannelVideo, groupSeries, holdAt, type Opening, openingAt, openingInsights, type OpeningsReport, type SeriesReport } from "./series";
import type { Store } from "./store";
import { UserError } from "./types";
import { addDays, clamp, isoDate, mean, median, rng } from "./util";
import { parseDuration } from "./youtube";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const REPORTS_URL = "https://youtubeanalytics.googleapis.com/v2/reports";
const DATA_API = "https://www.googleapis.com/youtube/v3";
export const SCOPES = ["https://www.googleapis.com/auth/yt-analytics.readonly", "https://www.googleapis.com/auth/youtube.readonly"];

export const TRAFFIC_LABELS: Record<string, string> = {
  YT_SEARCH: "YouTube search", RELATED_VIDEO: "Suggested videos", SUBSCRIBER: "Browse features (Home, Subscriptions)",
  SHORTS: "Shorts feed", EXT_URL: "External websites", NO_LINK_OTHER: "Direct / unknown", YT_CHANNEL: "Your channel page",
  PLAYLIST: "Playlists", END_SCREEN: "End screens", NOTIFICATION: "Notifications", YT_OTHER_PAGE: "Other YouTube pages",
  HASHTAGS: "Hashtag pages", ANNOTATION: "Cards", CAMPAIGN_CARD: "Campaign cards", NO_LINK_EMBEDDED: "Embedded players",
  ADVERTISING: "YouTube ads", PROMOTED: "Promoted", SOUND_PAGE: "Sound pages", LIVE_REDIRECT: "Live redirects",
  VIDEO_REMIXES: "Remixes", IMMERSIVE_LIVE: "Immersive live",
};

export class NotConnected extends UserError {
  constructor(msg = "YouTube Analytics isn’t connected. Connect it in Settings.") {
    super(msg, "NotConnected");
  }
}

interface Tokens { access_token: string; refresh_token?: string; expires_at: number; scope?: string }
export interface Insight { type: "good" | "bad" | "info"; text: string }

export interface Overview {
  days: number;
  start: string;
  end: string;
  totals: Record<string, number>;
  previous: Record<string, number>;
  daily: { day: string; views: number; estimatedMinutesWatched: number; subscribersGained: number }[];
  videos: any[];
  traffic: { insightTrafficSourceType: string; label: string; views: number; estimatedMinutesWatched: number }[];
  ctr: { impressions: number; ctr: number } | null;
  channel: { title: string; thumb: string; subs: number } | null;
  demo: boolean;
  insights: Insight[];
}

function b64url(bytes: Uint8Array): string {
  let s = "";
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export class Analytics {
  private pending = new Map<string, { verifier: string; redirect: string; t: number }>();

  constructor(private store: Store) {}

  private client(): [string, string] {
    const id = this.store.getSettings().google_client_id.trim();
    const secret = this.store.getSecret("google_client_secret").trim();
    if (!id || !secret) throw new UserError("Add your Google OAuth client ID and secret in Settings first.");
    return [id, secret];
  }

  connected() { return Boolean(this.store.getSecret("google_tokens")); }

  /** Builds the Google sign-in URL for a loopback redirect (http://127.0.0.1:<port>/callback). */
  async authUrl(redirect: string): Promise<string> {
    const [id] = this.client();
    const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
    const challenge = b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
    const state = b64url(crypto.getRandomValues(new Uint8Array(18)));
    this.pending.clear();
    this.pending.set(state, { verifier, redirect, t: Date.now() });
    const u = new URL(AUTH_URL);
    Object.entries({
      client_id: id, redirect_uri: redirect, response_type: "code", scope: SCOPES.join(" "), access_type: "offline",
      prompt: "select_account consent", include_granted_scopes: "true", state, code_challenge: challenge, code_challenge_method: "S256",
    }).forEach(([k, v]) => u.searchParams.set(k, v));
    return u.toString();
  }

  async finish(state: string, code: string) {
    const p = this.pending.get(state);
    this.pending.delete(state);
    if (!p || Date.now() - p.t > 15 * 60 * 1000) throw new UserError("This sign-in link has expired. Choose Connect with Google in NicheRadar to get a new one.");
    const [id, secret] = this.client();
    const resp = await fetch(TOKEN_URL, {
      method: "POST",
      body: new URLSearchParams({ client_id: id, client_secret: secret, code, grant_type: "authorization_code", redirect_uri: p.redirect, code_verifier: p.verifier }),
    });
    if (!resp.ok) throw new UserError(`Google didn’t accept the sign-in. Check the client ID and secret in Settings. Details: ${(await resp.text()).slice(0, 200)}`);
    const tok: any = await resp.json();
    this.saveTokens({ access_token: tok.access_token, refresh_token: tok.refresh_token, expires_at: Date.now() + (tok.expires_in ?? 3600) * 1000 - 60000, scope: tok.scope });
    const info = await this.channelInfo();
    this.store.updateSettings({ analytics_channel: info });
    return info;
  }

  private saveTokens(t: Tokens | null) { this.store.setSecret("google_tokens", t ? JSON.stringify(t) : null); }
  private tokens(): Tokens | null {
    const raw = this.store.getSecret("google_tokens");
    try { return raw ? (JSON.parse(raw) as Tokens) : null; } catch { return null; }
  }

  private async accessToken(): Promise<string> {
    const t = this.tokens();
    if (!t) throw new NotConnected();
    if (Date.now() < t.expires_at) return t.access_token;
    if (!t.refresh_token) throw new NotConnected("Your Google sign-in expired. Reconnect YouTube Analytics.");
    const [id, secret] = this.client();
    const resp = await fetch(TOKEN_URL, {
      method: "POST",
      body: new URLSearchParams({ client_id: id, client_secret: secret, refresh_token: t.refresh_token, grant_type: "refresh_token" }),
    });
    if (!resp.ok) {
      this.saveTokens(null);
      throw new NotConnected("Google sign-in expired or was revoked. Reconnect YouTube Analytics. (If this happens weekly, publish your OAuth app. See Settings.)");
    }
    const tok: any = await resp.json();
    const next = { ...t, access_token: tok.access_token, expires_at: Date.now() + (tok.expires_in ?? 3600) * 1000 - 60000 };
    this.saveTokens(next);
    return next.access_token;
  }

  async disconnect() {
    const t = this.tokens();
    const tok = t?.refresh_token ?? t?.access_token;
    if (tok) await fetch(REVOKE_URL, { method: "POST", body: new URLSearchParams({ token: tok }) }).catch(() => undefined);
    this.saveTokens(null);
    this.store.updateSettings({ analytics_channel: null });
  }

  private async get(url: string, params: Record<string, string | number | undefined>): Promise<any> {
    const u = new URL(url);
    Object.entries(params).forEach(([k, v]) => v !== undefined && v !== "" && u.searchParams.set(k, String(v)));
    const resp = await fetch(u, { headers: { Authorization: "Bearer " + (await this.accessToken()) }, signal: AbortSignal.timeout(25000) });
    if (resp.status === 401) throw new NotConnected("Google sign-in expired. Reconnect YouTube Analytics.");
    if (!resp.ok) {
      const text = await resp.text();
      let msg = text.slice(0, 200);
      try { msg = JSON.parse(text).error?.message ?? msg; } catch { /* keep text */ }
      throw new UserError(`YouTube Analytics returned an error (${resp.status}): ${msg}`);
    }
    return resp.json();
  }

  async report(start: Date, end: Date, metrics: string, o: { dimensions?: string; sort?: string; maxResults?: number; filters?: string } = {}) {
    const data = await this.get(REPORTS_URL, { ids: "channel==MINE", startDate: isoDate(start), endDate: isoDate(end), metrics, ...o });
    const cols: string[] = (data.columnHeaders ?? []).map((h: any) => h.name);
    return ((data.rows ?? []) as any[][]).map((row) => Object.fromEntries(cols.map((c, i) => [c, row[i]])) as Record<string, any>);
  }

  async channelInfo() {
    const data = await this.get(`${DATA_API}/channels`, { part: "snippet,statistics", mine: "true" });
    const ch = data.items?.[0];
    if (!ch) throw new UserError("This Google account has no YouTube channel. Sign in with the account that owns your channel.");
    return { id: ch.id, title: ch.snippet.title, thumb: ch.snippet.thumbnails?.default?.url ?? "", subs: +(ch.statistics.subscriberCount ?? 0) };
  }

  private async videoMeta(ids: string[]) {
    const out = new Map<string, any>();
    for (let i = 0; i < ids.length; i += 50) {
      const data = await this.get(`${DATA_API}/videos`, { part: "snippet,contentDetails", id: ids.slice(i, i + 50).join(",") });
      for (const v of data.items ?? []) out.set(v.id, v);
    }
    return out;
  }

  async overview(days = 28): Promise<Overview> {
    const end = addDays(new Date(), -1); // analytics data lags 1-2 days
    const start = addDays(end, -(days - 1));
    const prevEnd = addDays(start, -1), prevStart = addDays(start, -days);
    const base = "views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,subscribersGained,subscribersLost,likes,comments,shares";
    const [totals, previous, daily, videos, traffic] = await Promise.all([
      this.report(start, end, base).then((r) => r[0] ?? {}),
      this.report(prevStart, prevEnd, base).then((r) => r[0] ?? {}),
      this.report(start, end, "views,estimatedMinutesWatched,subscribersGained", { dimensions: "day", sort: "day" }),
      this.report(start, end, "views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,likes,subscribersGained", { dimensions: "video", sort: "-views", maxResults: 25 }),
      this.report(start, end, "views,estimatedMinutesWatched", { dimensions: "insightTrafficSourceType", sort: "-views" }),
    ]);
    let ctr: Overview["ctr"] = null;
    try { // Thumbnail impressions/CTR aren't available for every channel or API version; optional.
      const row = (await this.report(start, end, "videoThumbnailImpressions,videoThumbnailImpressionsClickRate"))[0];
      if (row) ctr = { impressions: row.videoThumbnailImpressions, ctr: row.videoThumbnailImpressionsClickRate };
    } catch { ctr = null; }
    const meta = videos.length ? await this.videoMeta(videos.map((v) => v.video)) : new Map();
    for (const v of videos) {
      const m = meta.get(v.video);
      Object.assign(v, {
        title: m?.snippet?.title ?? v.video, thumbnail: m?.snippet?.thumbnails?.medium?.url ?? "",
        published_at: m?.snippet?.publishedAt ?? null, duration_s: parseDuration(m?.contentDetails?.duration),
      });
    }
    for (const t of traffic) t.label = TRAFFIC_LABELS[t.insightTrafficSourceType] ?? String(t.insightTrafficSourceType).replace(/_/g, " ").toLowerCase();
    const ov: Overview = {
      days, start: isoDate(start), end: isoDate(end), totals, previous, daily: daily as any, videos, traffic: traffic as any, ctr,
      channel: this.store.getSettings().analytics_channel, demo: false, insights: [],
    };
    ov.insights = insights(ov);
    return ov;
  }

  /** Your videos from the last `days` days with their stats, most viewed first (up to 200). */
  async channelVideos(days = 365): Promise<{ start: string; end: string; videos: ChannelVideo[] }> {
    const end = addDays(new Date(), -1), start = addDays(end, -(days - 1));
    const rows = await this.report(start, end, "views,averageViewDuration,averageViewPercentage,subscribersGained", { dimensions: "video", sort: "-views", maxResults: 200 });
    const meta = rows.length ? await this.videoMeta(rows.map((r) => r.video)) : new Map();
    const videos = rows.map((r) => {
      const m = meta.get(r.video);
      return {
        video: r.video, title: m?.snippet?.title ?? r.video, thumbnail: m?.snippet?.thumbnails?.medium?.url ?? "", views: r.views ?? 0,
        averageViewPercentage: r.averageViewPercentage ?? 0, averageViewDuration: r.averageViewDuration ?? 0, subscribersGained: r.subscribersGained ?? 0,
        duration_s: parseDuration(m?.contentDetails?.duration), published_at: m?.snippet?.publishedAt ?? null,
      };
    });
    return { start: isoDate(start), end: isoDate(end), videos };
  }

  async series(days = 365): Promise<SeriesReport> {
    const { start, end, videos } = await this.channelVideos(days);
    return { start, end, ...groupSeries(videos), demo: false };
  }

  /** Opening hold for your most-viewed videos (one retention request each). */
  async openings(limit = 12): Promise<OpeningsReport> {
    const { videos } = await this.channelVideos(365);
    const pick = videos.filter((v) => v.duration_s > 0).slice(0, limit);
    const openings: Opening[] = [];
    for (const v of pick) {
      try {
        const { points } = await this.retention(v.video);
        const at = openingAt(v.duration_s), hold = holdAt(points, v.duration_s, at);
        if (hold != null) openings.push({ video: v.video, title: v.title, thumbnail: v.thumbnail, views: v.views, duration_s: v.duration_s, at_s: at, hold });
      } catch (e) {
        if (e instanceof NotConnected) throw e;
      }
    }
    return { openings: openings.sort((a, b) => b.hold - a.hold), median_hold: median(openings.map((o) => o.hold)), insights: openingInsights(openings), demo: false };
  }

  async retention(videoId: string) {
    const end = addDays(new Date(), -1);
    const rows = await this.report(addDays(end, -365), end, "audienceWatchRatio,relativeRetentionPerformance", {
      dimensions: "elapsedVideoTimeRatio", filters: `video==${videoId}`,
    });
    return { video: videoId, points: rows as RetentionPoint[], insights: retentionInsights(rows as RetentionPoint[]), demo: false };
  }
}

export interface RetentionPoint { elapsedVideoTimeRatio: number; audienceWatchRatio: number; relativeRetentionPerformance: number }

// -------------------------------------------------------------------- insights
export function insights(ov: Overview): Insight[] {
  const t = ov.totals ?? {}, prev = ov.previous ?? {};
  const tips: Insight[] = [];
  const views = t.views ?? 0;
  if (!views) return [{ type: "info", text: "No views in this period yet. Upload consistently and check back." }];
  if (prev.views) {
    const ch = ((views - prev.views) / prev.views) * 100;
    tips.push({ type: ch >= 0 ? "good" : "bad", text: `Views are ${ch >= 0 ? "up" : "down"} ${Math.abs(ch).toFixed(1)}% versus the previous ${ov.days} days.` });
  }
  const total = ov.traffic.reduce((a, x) => a + x.views, 0) || 1;
  const share = Object.fromEntries(ov.traffic.map((x) => [x.insightTrafficSourceType, x.views / total]));
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  // Shorts don't have end screens or thumbnails in the feed, and get little Suggested traffic, so long-form tips don't apply.
  const shortsFirst = (share.SHORTS ?? 0) >= 0.5;
  const avp = t.averageViewPercentage ?? 0;
  if (avp && avp < 35) tips.push({ type: "bad", text: `Viewers watch ${avp.toFixed(0)}% of your videos on average. That’s low. Get to the point faster: show the payoff in the first 15 seconds and cut slow sections. Open a video’s retention curve below to see where people leave.` });
  else if (avp >= 50) tips.push({ type: "good", text: shortsFirst
    ? `Strong retention: viewers watch ${avp.toFixed(0)}% on average. In the Shorts feed, the first second decides whether people swipe away, so keep testing hooks that state the question straight away.`
    : `Strong retention: viewers watch ${avp.toFixed(0)}% on average. YouTube rewards this. Your content holds attention, so focus on getting more clicks (titles and thumbnails).` });
  else if (avp) tips.push({ type: "info", text: `Average view percentage is ${avp.toFixed(0)}%. Aim for 50%+ with tighter intros and pattern interrupts.` });

  if ((share.YT_SEARCH ?? 0) >= 0.35) tips.push({ type: "info", text: `${pct(share.YT_SEARCH)} of views come from search. Titles and descriptions that match what people type matter most for you, so use Analyze to find winnable search phrases.` });
  if (!shortsFirst && (share.RELATED_VIDEO ?? 0) < 0.12 && total > 500) tips.push({ type: "info", text: "Few views come from Suggested videos. Make videos that answer the follow-up question to popular videos in your niche, and use similar topics and wording, so YouTube recommends you next to them." });
  if ((share.SUBSCRIBER ?? 0) >= 0.3) tips.push({ type: "good", text: "Browse features (Home feed) drive a big share of your views. YouTube is actively recommending you. Thumbnail and title CTR is now your biggest lever." });
  if ((share.SHORTS ?? 0) >= 0.5) tips.push({ type: "info", text: `${pct(share.SHORTS)} of views come from the Shorts feed. Shorts viewers rarely subscribe, so set a related video on each Short (in YouTube Studio, under Related video) and turn your best topics into series viewers come back for.` });
  if (!shortsFirst && (share.END_SCREEN ?? 0) < 0.02 && total > 500) tips.push({ type: "info", text: "End screens bring almost no views. Point every end screen at your best related video or a playlist." });

  const perK = (((t.subscribersGained ?? 0) - (t.subscribersLost ?? 0)) / views) * 1000;
  tips.push({ type: perK >= 5 ? "good" : "info", text: `You gain ${perK.toFixed(1)} net subscribers per 1,000 views. ${perK >= 5 ? "That is a strong conversion rate."
    : shortsFirst ? "That’s common for Shorts. Recurring series and a closing line that teases the next one give viewers a reason to subscribe."
    : "Give viewers a clear reason to subscribe mid-video (what’s coming next), not only at the end."}` });

  if (ov.ctr?.ctr != null) {
    const c = ov.ctr.ctr <= 1 ? ov.ctr.ctr * 100 : ov.ctr.ctr;
    if (c < 4) tips.push({ type: "bad", text: `Thumbnail click-through rate is ${c.toFixed(1)}%. Below ~4% means the thumbnail or title isn’t earning clicks. Use bigger subjects, fewer words, stronger contrast, and test with Test & Compare.` });
    else if (c >= 8) tips.push({ type: "good", text: `Thumbnail click-through rate is ${c.toFixed(1)}%, which is excellent for most niches.` });
    else tips.push({ type: "info", text: `Thumbnail click-through rate is ${c.toFixed(1)}%. Typical is 4-8%.` });
  }

  const vids = ov.videos ?? [];
  if (vids.length >= 3) {
    const med = median(vids.map((v) => v.views));
    const best = vids.reduce((a, v) => (v.views > a.views ? v : a));
    if (med && best.views >= 3 * med) tips.push({ type: "good", text: `“${String(best.title).slice(0, 70)}” got ${(best.views / med).toFixed(1)}× your typical views. Make a follow-up or a different angle on the same topic while it’s hot.` });
    const weak = vids.find((v) => (v.averageViewPercentage ?? 100) < 25 && v.views > med);
    if (weak) tips.push({ type: "bad", text: `“${String(weak.title).slice(0, 70)}” gets clicks but viewers leave early (${weak.averageViewPercentage.toFixed(0)}% watched). Check that the intro delivers what the title promises.` });
  }
  return tips;
}

export function retentionInsights(points: RetentionPoint[]): Insight[] {
  if (!points.length) return [{ type: "info", text: "No retention data yet. YouTube needs enough views to build the curve." }];
  const pts = [...points].sort((a, b) => a.elapsedVideoTimeRatio - b.elapsedVideoTimeRatio);
  const tips: Insight[] = [];
  const early = pts.find((p) => p.elapsedVideoTimeRatio >= 0.1) ?? pts[0];
  if (early.audienceWatchRatio < 0.6) tips.push({ type: "bad", text: `Only ${Math.round(early.audienceWatchRatio * 100)}% of viewers are still watching at 10%. The intro loses people. Open with the payoff and drop the greeting.` });
  else tips.push({ type: "good", text: `${Math.round(early.audienceWatchRatio * 100)}% of viewers are still there at 10%. The hook works.` });
  const drops: [number, number][] = [];
  pts.slice(1).forEach((b, i) => {
    const d = pts[i].audienceWatchRatio - b.audienceWatchRatio;
    if (d > 0.04 && b.elapsedVideoTimeRatio > 0.1) drops.push([d, b.elapsedVideoTimeRatio]);
  });
  for (const [d, at] of drops.sort((a, b) => b[0] - a[0]).slice(0, 2)) {
    tips.push({ type: "bad", text: `Steep drop around ${Math.round(at * 100)}% through the video (-${Math.round(d * 100)}%). Rewatch that moment: slow section, off-topic tangent or a payoff that came too early?` });
  }
  const bump = pts.slice(1).find((b, i) => b.audienceWatchRatio - pts[i].audienceWatchRatio > 0.01 && b.elapsedVideoTimeRatio > 0.05);
  if (bump) tips.push({ type: "good", text: `Retention rises around ${Math.round(bump.elapsedVideoTimeRatio * 100)}%, so viewers rewatch or skip to this moment. Consider using it in the thumbnail, the hook or a Short.` });
  const rel = mean(pts.map((p) => p.relativeRetentionPerformance ?? 0.5));
  tips.push({ type: rel >= 0.5 ? "good" : "info", text: `Retention is ${rel >= 0.5 ? "above" : "below"} average compared with similar-length YouTube videos (relative score ${rel.toFixed(2)}, where 0.5 is average).` });
  return tips;
}

// ------------------------------------------------------------------------ demo
export function demoOverview(days = 28): Overview {
  const r = rng("analytics", days);
  const end = addDays(new Date(), -1), start = addDays(end, -(days - 1));
  const daily = Array.from({ length: days }, (_, i) => {
    const v = Math.floor(180 * (1 + 0.35 * Math.sin(i / 3.5)) * (1 + i / days) * r.uniform(0.75, 1.3)) + (i === days - 9 ? 900 : 0);
    return { day: isoDate(addDays(start, i)), views: v, estimatedMinutesWatched: Math.floor(v * r.uniform(2.2, 3.4)), subscribersGained: Math.floor(v * r.uniform(0.004, 0.012)) };
  });
  const views = daily.reduce((a, d) => a + d.views, 0);
  const titles = ["I tried budget meal prep for 30 days", "5 meal prep mistakes beginners make", "Cheap high protein lunches (under $3)",
    "Meal prep for one person - the honest guide", "What I eat in a week on $40", "Air fryer meal prep that doesn't get soggy",
    "My fridge organization system", "Batch cooking for busy students"];
  const shares = [0.32, 0.18, 0.14, 0.1, 0.09, 0.07, 0.06, 0.04];
  const videos = titles.map((title, i) => {
    const vv = Math.floor(views * shares[i]), avp = r.uniform(22, 58), dur = r.int(360, 900);
    return { video: `demo${i}`, title, thumbnail: "", views: vv, estimatedMinutesWatched: Math.floor(((vv * dur) / 60) * (avp / 100)),
      averageViewDuration: Math.floor((dur * avp) / 100), averageViewPercentage: Math.round(avp * 10) / 10, likes: Math.floor(vv * 0.04),
      subscribersGained: Math.floor(vv * 0.008), duration_s: dur, published_at: null };
  });
  const mix: [string, number][] = [["YT_SEARCH", 0.38], ["SUBSCRIBER", 0.2], ["RELATED_VIDEO", 0.09], ["SHORTS", 0.16], ["EXT_URL", 0.06],
    ["NO_LINK_OTHER", 0.05], ["YT_CHANNEL", 0.04], ["PLAYLIST", 0.015], ["END_SCREEN", 0.005]];
  const traffic = mix.map(([k, s]) => ({ insightTrafficSourceType: k, label: TRAFFIC_LABELS[k], views: Math.floor(views * s), estimatedMinutesWatched: Math.floor(views * s * 2.5) }));
  const totals = { views, estimatedMinutesWatched: daily.reduce((a, d) => a + d.estimatedMinutesWatched, 0), averageViewDuration: 196,
    averageViewPercentage: 38.4, subscribersGained: daily.reduce((a, d) => a + d.subscribersGained, 0), subscribersLost: 9,
    likes: Math.floor(views * 0.04), comments: Math.floor(views * 0.004), shares: Math.floor(views * 0.003) };
  const ov: Overview = { days, start: isoDate(start), end: isoDate(end), totals, previous: { ...totals, views: Math.floor(views * 0.78), estimatedMinutesWatched: Math.floor(totals.estimatedMinutesWatched * 0.84) },
    daily, videos, traffic, ctr: { impressions: views * 14, ctr: 0.051 }, channel: { title: "Demo Kitchen", subs: 1240, thumb: "" }, demo: true, insights: [] };
  ov.insights = insights(ov);
  return ov;
}

/** A sample catalog with clear series, for the browser preview and for channels without Analytics. */
export function demoChannelVideos(): ChannelVideo[] {
  const r = rng("catalog");
  const rows: [string, number, number, number][] = [ // title, views, % viewed, seconds
    ["Air fryer chicken that actually crisps", 48200, 81, 42], ["Why air fryer fries go soggy", 31900, 78, 38], ["The air fryer setting nobody uses", 22400, 74, 44],
    ["Air fryer vs oven: the honest test", 9100, 52, 610], ["Meal prep for one person, the honest guide", 7400, 46, 720], ["5 meal prep mistakes beginners make", 6800, 49, 540],
    ["Meal prep that lasts 5 days", 5200, 44, 660], ["Why rice goes hard in the fridge", 12600, 83, 35], ["Rice cooker tricks restaurants use", 4100, 71, 47],
    ["Cheap high protein lunches under $3", 3900, 41, 480], ["High protein snacks that aren't bars", 2700, 68, 40], ["Freezer burn, explained in 40 seconds", 3300, 79, 41],
    ["What I eat in a week on $40", 2200, 38, 780], ["My fridge organization system", 1500, 63, 52], ["Batch cooking for busy students", 1200, 35, 690],
  ];
  return rows.map(([title, views, avp, dur], i) => ({
    video: `demo${i}`, title, thumbnail: "", views, averageViewPercentage: avp, averageViewDuration: Math.round((dur * avp) / 100),
    subscribersGained: Math.round(views * (dur > 180 ? 0.009 : 0.0012) * r.uniform(0.7, 1.3)), duration_s: dur, published_at: null,
  }));
}

export function demoSeries(): SeriesReport {
  const end = addDays(new Date(), -1);
  return { start: isoDate(addDays(end, -364)), end: isoDate(end), ...groupSeries(demoChannelVideos()), demo: true };
}

export function demoOpenings(): OpeningsReport {
  const openings: Opening[] = demoChannelVideos().slice(0, 12).map((v) => {
    const at = openingAt(v.duration_s);
    const hold = holdAt(demoRetention(v.video).points, v.duration_s, at) ?? 0;
    const tweak = rng("hook", v.video).uniform(-0.12, 0.08); // spread the sample so the comparison shows something
    return { video: v.video, title: v.title, thumbnail: "", views: v.views, duration_s: v.duration_s, at_s: at, hold: Math.round(clamp(hold + tweak, 0.3, 1) * 1000) / 1000 };
  }).sort((a, b) => b.hold - a.hold);
  return { openings, median_hold: median(openings.map((o) => o.hold)), insights: openingInsights(openings), demo: true };
}

export function demoRetention(videoId: string) {
  const r = rng("retention", videoId);
  const points: RetentionPoint[] = [];
  let w = 1;
  for (let i = 0; i <= 100; i++) {
    const x = i / 100;
    w = i === 0 ? 1 : w * (x < 0.08 ? 0.955 : r.uniform(0.985, 0.998));
    if (x > 0.42 && x < 0.46) w *= 0.96;
    const bump = 0.07 * Math.exp(-(((x - 0.64) / 0.025) ** 2)); // a moment people rewatch
    points.push({ elapsedVideoTimeRatio: x, audienceWatchRatio: Math.round((w + bump) * 1000) / 1000, relativeRetentionPerformance: Math.round(r.uniform(0.42, 0.62) * 100) / 100 });
  }
  return { video: videoId, points, insights: retentionInsights(points), demo: true };
}
