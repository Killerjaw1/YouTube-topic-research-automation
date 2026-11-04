/**
 * `npm run selftest`: end-to-end checks of the engine on demo and synthetic data.
 * Covers scoring, breakout detection, the upload playbook, the draft checker, storage
 * (settings, secrets, cache, quota, scans, ideas), analytics insights and CSV export.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { demoOverview, demoRetention, insights, retentionInsights } from "../src/core/analytics";
import { Engine } from "../src/core/engine";
import { checkDraft, playbook, titleCase } from "../src/core/optimize";
import { analyze, classifyFormat, enrich, isBreakout } from "../src/core/scoring";
import { MemoryPersist, Store } from "../src/core/store";
import { DEFAULT_SETTINGS, type VideoRow } from "../src/core/types";
import { hash, quartiles, quotaDay } from "../src/core/util";
import { parseDuration } from "../src/core/youtube";
import { groupSeries, holdAt, openingAt, subjectTerms } from "../src/core/series";
import { FilePersist } from "../src/main/persist";

let passed = 0, failed = 0;
async function test(name: string, fn: () => unknown | Promise<unknown>) {
  try { await fn(); passed++; console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  catch (e: any) { failed++; console.log(`  \x1b[31m✗ ${name}\x1b[0m\n    ${e?.stack?.split("\n").slice(0, 3).join("\n    ") ?? e}`); }
}

/** Raw API-shaped video + channel, so tests go through enrich() like real data does. */
function raw(id: string, o: { views: number; subs: number | null; ageDays: number; dur?: number; title?: string; chViews?: number; chVideos?: number }) {
  const cid = "UC" + id;
  return {
    video: {
      id, snippet: { title: o.title ?? `video ${id}`, channelId: cid, channelTitle: "ch " + id,
        publishedAt: new Date(Date.now() - o.ageDays * 86400000).toISOString(), tags: ["alpha tag", "beta tag"] },
      statistics: { viewCount: String(o.views), likeCount: String(Math.floor(o.views * 0.03)), commentCount: "10" },
      contentDetails: { duration: `PT${Math.floor((o.dur ?? 600) / 60)}M${(o.dur ?? 600) % 60}S` },
    },
    channel: {
      id: cid, snippet: { title: "ch " + id },
      statistics: o.subs == null ? { hiddenSubscriberCount: true } : { subscriberCount: String(o.subs), viewCount: String(o.chViews ?? o.subs * 50), videoCount: String(o.chVideos ?? 100) },
    },
  };
}
function rowsFrom(list: ReturnType<typeof raw>[]): VideoRow[] {
  return enrich(list.map((x) => x.video), list.map((x) => x.channel), list.map((x) => x.video.id));
}

async function main() {
  console.log("\nNicheRadar selftest\n");

  console.log("Parsing & helpers");
  await test("ISO-8601 durations", () => {
    assert.equal(parseDuration("PT1H2M3S"), 3723);
    assert.equal(parseDuration("PT45S"), 45);
    assert.equal(parseDuration("P1DT1M"), 86460);
    assert.equal(parseDuration("P0D"), 0);
    assert.equal(parseDuration(undefined), 0);
  });
  await test("Shorts detection", () => {
    assert.equal(classifyFormat(45, "x"), "short");
    assert.equal(classifyFormat(150, "my clip #shorts"), "short");
    assert.equal(classifyFormat(150, "a normal video"), "long");
    assert.equal(classifyFormat(900, "#shorts but long"), "long");
  });
  await test("Quartiles match Python statistics.quantiles", () => assert.deepEqual(quartiles([1, 2, 3, 4, 5, 6, 7, 8]), [2.25, 4.5, 6.75]));
  await test("Stable hashing and Pacific quota day", () => {
    assert.equal(hash("abc"), hash("abc"));
    assert.notEqual(hash("abc"), hash("abd"));
    assert.match(quotaDay(), /^\d{4}-\d{2}-\d{2}$/);
  });
  await test("Title case keeps acronyms", () => assert.equal(titleCase("budget gaming pc for ai"), "Budget Gaming PC for AI"));

  console.log("\nScoring");
  const settings = { ...DEFAULT_SETTINGS };
  await test("Breakout needs reach and outperformance", () => {
    const [a, b, c, d] = rowsFrom([
      raw("a", { views: 40000, subs: 2000, ageDays: 30 }), // 20x subs -> breakout
      raw("b", { views: 4000, subs: 200, ageDays: 30 }), // under 5K views -> not
      raw("c", { views: 90000, subs: 900000, ageDays: 30 }), // big channel -> not
      raw("d", { views: 9000, subs: 10000, ageDays: 30, chViews: 200000, chVideos: 100 }), // 4.5x channel avg -> breakout
    ]);
    assert.equal(isBreakout(a, 50000), true);
    assert.equal(isBreakout(b, 50000), false);
    assert.equal(isBreakout(c, 50000), false);
    assert.equal(isBreakout(d, 50000), true);
  });
  await test("A topic owned by big channels scores low", () => {
    const rows = rowsFrom(Array.from({ length: 20 }, (_, i) => raw("big" + i, { views: 2_000_000, subs: 5_000_000, ageDays: 900, title: "budget gaming pc build" })));
    const r = analyze("budget gaming pc", rows, settings);
    assert.ok(r.score <= 45, `score ${r.score}`);
    assert.equal(r.metrics.big_in_top10, 10);
    assert.ok(r.reasons.some((x) => x.type === "bad" && x.text.includes("Large channels")));
  });
  await test("A topic where small channels break out scores high", () => {
    const rows = rowsFrom(Array.from({ length: 20 }, (_, i) => raw("s" + i, { views: 60000 + i * 1000, subs: 3000 + i * 100, ageDays: 20 + i, title: `I tried sourdough ${i}` })));
    const r = analyze("sourdough starter", rows, settings);
    assert.ok(r.score >= 70, `score ${r.score}`);
    assert.equal(r.verdict, "Strong opportunity");
    assert.ok(Number(r.metrics.breakouts) >= 6);
  });
  await test("No demand caps the score even without competition", () => {
    const rows = rowsFrom(Array.from({ length: 20 }, (_, i) => raw("n" + i, { views: 40, subs: 50, ageDays: 400 })));
    assert.ok(analyze("nobody searches this", rows, settings).score <= 38);
  });
  await test("Content gap: old videos with high demand", () => {
    const rows = rowsFrom(Array.from({ length: 20 }, (_, i) => raw("g" + i, { views: 9_000_000, subs: 400_000, ageDays: 1500 })));
    const r = analyze("old topic", rows, settings);
    assert.equal(r.metrics.content_gap, true);
    assert.ok(r.subscores.freshness >= 70);
  });
  await test("Auto small-channel threshold follows your channel size", () => {
    const s = { ...settings, my_channel: { subs: 1000 } as any };
    const r = analyze("x", rowsFrom([raw("z", { views: 10, subs: 10, ageDays: 1 })]), s);
    assert.equal(r.thresholds.small_max, 25000);
  });
  await test("Hidden subscriber counts are handled", () => {
    const [r] = rowsFrom([raw("h", { views: 1000, subs: null, ageDays: 5 })]);
    assert.equal(r.subs, null);
    assert.equal(r.outlier, null);
  });

  console.log("\nUpload playbook & draft checker");
  const engine = new Engine(new Store(new MemoryPersist()), { desktop: false });
  const report = await engine.analyze("budget gaming pc", "deep");
  await test("Demo analysis produces a full report", () => {
    assert.ok(report.videos.length === 50 && report.recent.length === 50);
    assert.ok(report.score >= 0 && report.score <= 100);
    assert.ok(report.scan_id);
    assert.ok(report.demo);
  });
  await test("Playbook has titles, tags, hashtags, description and checklists", () => {
    const pb = report.playbook!;
    assert.ok(pb.titles.length >= 4 && pb.titles.every((t) => t.length <= 70));
    assert.ok(pb.titles.some((t) => t.includes("PC")), "acronym kept");
    assert.ok(pb.tags[0] === "budget gaming pc" && pb.tags_chars <= 500);
    assert.ok(pb.hashtags.length >= 2 && pb.hashtags.length <= 3 && pb.hashtags.every((h) => h.startsWith("#")));
    assert.match(pb.description, /0:00/);
    for (const k of ["ctr", "watch_time", "shorts", "metadata"] as const) assert.ok(pb.checklist[k].length >= 3);
  });
  await test("Draft checker flags a weak draft", () => {
    const r = checkDraft({ keyword: "budget gaming pc", title: "My new PC!!!", description: "check it out", tags: "pc" }, report);
    assert.ok(r.score < 60, `score ${r.score}`);
    assert.ok(r.checks.some((c) => c.status === "warn" && c.text.includes("clickbait")));
    assert.ok(r.checks.some((c) => c.text.includes("No chapters")));
  });
  await test("Draft checker rewards a strong draft", () => {
    const desc = "Building a budget gaming PC in 2026? Here is the exact parts list I used and what I'd change.\n\n0:00 Intro\n1:10 Parts\n6:30 Build\n10:00 Benchmarks\n\nhttps://example.com\n#budgetgamingpc #pcbuild";
    const r = checkDraft({ keyword: "budget gaming pc", title: "Budget Gaming PC: I Built One for $500 (Worth It?)", description: desc + " More detail about the build and testing.".repeat(3), tags: "budget gaming pc, cheap gaming pc", minutes: 12 }, report);
    assert.ok(r.score >= 85, `score ${r.score}`);
    assert.ok(!r.checks.some((c) => c.status === "fail"));
  });
  await test("Shorts longer than 3 minutes fail", () => {
    assert.ok(checkDraft({ title: "x", format: "short", minutes: 4 }).checks.some((c) => c.status === "fail" && c.group === "Format"));
  });
  await test("Optimizer finds the saved report by keyword", () => {
    const r = engine.optimizeCheck({ keyword: "Budget Gaming PC", title: "test title for the checker", description: "" });
    assert.equal(r.report?.keyword, "budget gaming pc");
    assert.ok(r.playbook);
  });
  await test("Playbook is rebuilt for an old report without one", () => assert.ok(playbook({ ...report, playbook: null })));

  console.log("\nEngine & storage");
  await test("Discover, outliers, trending, reddit, channel in demo mode", async () => {
    assert.ok((await engine.discover("chess")).length >= 10);
    const out = await engine.outliers({ keyword: "chess", days: 30 });
    assert.ok(out.videos.every((v) => (v.outlier ?? 0) >= 1 && (v.subs ?? 0) <= out.max_subs));
    assert.equal((await engine.trending()).videos.length, 50);
    assert.equal((await engine.reddit("chess")).posts.length, 12);
    const ch = await engine.connectChannel("@mychannel");
    assert.equal(engine.status().my_channel?.id, ch.id);
  });
  await test("Ideas: add, move, edit, delete, CSV", () => {
    const idea = engine.addIdea({ title: "Test idea", keyword: "chess", status: "idea" });
    assert.equal(engine.updateIdea(idea.id, { status: "scripting" }).status, "scripting");
    assert.equal(engine.updateIdea(idea.id, { status: "bogus" as any }).status, "scripting", "invalid status ignored");
    assert.match(engine.ideasCsv().text, /Test idea/);
    engine.deleteIdea(idea.id);
    assert.equal(engine.listIdeas().ideas.length, 0);
  });
  await test("Watchlist: track from a report, re-score, history and untrack", async () => {
    const r1 = await engine.analyze("Indoor Plants", "quick");
    const t = engine.track("Indoor Plants", r1.scan_id);
    assert.equal(t.keyword, "indoor plants");
    assert.equal(t.history.length, 1, "seeded from the report");
    engine.track("indoor plants", r1.scan_id);
    assert.equal(engine.listTracked().length, 1, "no duplicates");
    const after = await engine.refreshTracked("indoor plants");
    assert.equal(after?.history.length, 2, "re-score appends a point");
    await engine.analyze("indoor plants");
    assert.equal(engine.listTracked()[0].history.length, 3, "any analysis of a tracked topic is recorded");
    assert.equal(engine.status().counts.tracked, 1);
    engine.untrack("INDOOR PLANTS");
    assert.equal(engine.listTracked().length, 0);
  });
  await test("Weekly check: off by default, runs once a week, records each topic", async () => {
    assert.equal((await engine.weeklyCheck()).skipped, "not_enabled");
    engine.saveSettings({ weekly_check: true });
    assert.equal((await engine.weeklyCheck()).skipped, "sample_data", "never spends quota on sample data by itself");
    const r1 = await engine.analyze("retro game bugs");
    engine.track("retro game bugs", r1.scan_id);
    const now = Date.now() / 1000;
    const run = await engine.weeklyCheck({ now, allowSample: true });
    assert.ok(run.ran && run.checked === 1);
    assert.equal(engine.listTracked().find((t) => t.keyword === "retro game bugs")!.history.length, 2);
    assert.equal(engine.getSettings().last_weekly_check, now);
    assert.equal((await engine.weeklyCheck({ now: now + 86400, allowSample: true })).skipped, "not_due");
    assert.ok((await engine.weeklyCheck({ now: now + 8 * 86400, allowSample: true })).ran, "due again after 7 days");
    engine.untrack("retro game bugs");
    engine.saveSettings({ weekly_check: false });
  });
  await test("Format focus: Shorts-only and long-form-only scoring", async () => {
    const s = await engine.analyze("pac man secrets", "quick", "short");
    assert.equal(s.focus, "short");
    assert.ok(s.videos.length >= 15 && s.videos.every((v) => v.format === "short" && v.duration_s <= 180), "only Shorts are scored");
    assert.ok(s.reasons[0].text.startsWith("Scored against Shorts only"));
    assert.equal(s.formats.recommended?.format, "short");
    const l = await engine.analyze("pac man secrets", "quick", "long");
    assert.ok(l.videos.length > 0 && l.videos.every((v) => v.format === "long"), "only long-form is scored");
    const all = await engine.analyze("pac man secrets", "quick");
    assert.equal(all.focus, "all");
    assert.ok(!all.reasons[0].text.startsWith("Scored against"));
    engine.track("pac man secrets", s.scan_id);
    const t = await engine.refreshTracked("pac man secrets");
    const latest = engine.getScan(t!.history[t!.history.length - 1].scan_id).payload as typeof s;
    assert.equal(latest.focus, "short", "re-scoring keeps the topic's format focus");
    engine.untrack("pac man secrets");
  });
  await test("Copy for Claude.ai: self-contained requests without an API key", () => {
    const p = engine.aiPrompt(report.scan_id!);
    assert.ok(p.startsWith("You are a YouTube growth strategist"), "includes the role");
    assert.ok(p.includes(`Topic: ${report.keyword}`) && p.includes("Current top search results:"), "includes the research");
    assert.ok(p.includes("5. Keywords to research next."), "asks for a readable layout, not JSON");
    const d = engine.aiDraftPrompt({ keyword: report.keyword, title: "My draft title", description: "", tags: "", format: "short", minutes: null, scan_id: report.scan_id });
    assert.ok(d.includes("Draft title: My draft title") && d.includes("Research on this topic:") && d.includes("1. Feedback"));
  });
  await test("Scans: list, CSV, delete", () => {
    const scans = engine.listScans();
    assert.ok(scans.length >= 2);
    const c = engine.scanCsv(report.scan_id!);
    assert.ok(c.text.startsWith("﻿rank,title") && c.filename.endsWith(".csv"));
    engine.deleteScan(report.scan_id!);
    assert.throws(() => engine.getScan(report.scan_id!));
  });
  await test("Secrets are never returned to the UI", () => {
    engine.saveSettings({ youtube_api_key: "AIzaSyTESTKEY1234567890", region: "gb", small_channel_max: "20000" });
    const s = engine.getSettings() as any;
    assert.equal(s.youtube_api_key, undefined);
    assert.equal(s.youtube_api_key_hint, "AIza…7890");
    assert.equal(s.region, "GB");
    assert.equal(s.small_channel_max, 20000);
    assert.ok(!JSON.stringify(s).includes("TESTKEY"));
  });
  await test("Disk store: atomic files, cipher, cache expiry, quota ledger", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nicheradar-"));
    const cipher = { encrypt: (s: string) => "x" + Buffer.from(s).toString("base64"), decrypt: (s: string) => Buffer.from(s.slice(1), "base64").toString() };
    const st = new Store(new FilePersist(dir), cipher);
    st.setSecret("anthropic_api_key", "sk-ant-secret");
    assert.ok(!fs.readFileSync(path.join(dir, "secrets.json"), "utf8").includes("sk-ant-secret"), "secret encrypted at rest");
    st.cacheSet("k", { a: 1 });
    st.addQuota(100); st.addQuota(2);
    st.saveScan("analyze", "q", { videos: [] }, 50, "ok", false);
    const again = new Store(new FilePersist(dir), cipher);
    assert.equal(again.getSecret("anthropic_api_key"), "sk-ant-secret");
    assert.deepEqual(again.cacheGet("k", 60000), { a: 1 });
    assert.equal(again.cacheGet("k", -1), undefined);
    assert.equal(again.quotaUsed(), 102);
    assert.equal(again.listScans().length, 1);
    assert.equal(again.cacheClear(), 1);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  console.log("\nYouTube Analytics");
  await test("Demo overview + insights", () => {
    const ov = demoOverview(28);
    assert.equal(ov.daily.length, 28);
    assert.ok(ov.insights.length >= 4);
    assert.ok(ov.insights.some((i) => i.text.includes("search")));
  });
  await test("Low retention and low CTR produce warnings", () => {
    const ov = { ...demoOverview(28), ctr: { impressions: 1000, ctr: 0.021 } };
    ov.totals = { ...ov.totals, averageViewPercentage: 22 };
    const tips = insights(ov);
    assert.ok(tips.some((t) => t.type === "bad" && t.text.includes("22%")));
    assert.ok(tips.some((t) => t.type === "bad" && t.text.includes("click-through rate is 2.1%")));
  });
  await test("Shorts-first channels skip long-form tips", () => {
    const ov = { ...demoOverview(28), traffic: [
      { insightTrafficSourceType: "SHORTS", label: "Shorts feed", views: 8700, estimatedMinutesWatched: 0 },
      { insightTrafficSourceType: "SUBSCRIBER", label: "Browse features", views: 500, estimatedMinutesWatched: 0 },
      { insightTrafficSourceType: "YT_SEARCH", label: "YouTube search", views: 400, estimatedMinutesWatched: 0 },
      { insightTrafficSourceType: "RELATED_VIDEO", label: "Suggested videos", views: 30, estimatedMinutesWatched: 0 },
    ] };
    const tips = insights(ov);
    assert.ok(tips.some((t) => t.text.includes("Shorts feed")));
    assert.ok(!tips.some((t) => /end screen|Suggested videos/i.test(t.text)), "no end-screen or Suggested tips for Shorts");
  });
  await test("Series: videos grouped by shared subject, with verdicts and format ideas", async () => {
    assert.deepEqual(subjectTerms("Why Pac-Man's Ghosts Each Move Differently").slice(0, 3), ["pac", "pac man", "man"]);
    assert.ok(!subjectTerms("Why Most Jellyfish Die But This One Doesn't").some((t) => t.includes("doesn")), "contractions are not subjects");
    const v = (title: string, views: number, avp = 80, dur = 50) =>
      ({ video: title, title, thumbnail: "", views, averageViewPercentage: avp, averageViewDuration: 40, subscribersGained: 5, duration_s: dur, published_at: null });
    const r = groupSeries([v("Why Pac-Man's Ghosts Move Differently", 39000), v("What Happens When Pac-Man Hits Level 256", 6000),
      v("Minecraft Is 17 Years Old", 7700), v("Minecraft's Far Lands Bug", 5100, 45), v("The Stack Limit Minecraft Didn't Need", 2900),
      v("Why Canada Has Weird Lake Names", 32000), v("Lightning Strikes Up", 3500), v("Why Crows Hold Grudges", 3800)]);
    const pac = r.series.find((s) => s.keyword === "pac man");
    assert.ok(pac && pac.name === "Pac-Man" && pac.videos.length === 2 && pac.verdict === "more", "Pac-Man is a strong series");
    assert.equal(r.series.find((s) => s.keyword === "minecraft")?.videos.length, 3);
    assert.equal(r.other.videos, 3);
    assert.ok(r.ideas.some((i) => i.format === "long" && i.series === "Pac-Man"), "a strong Shorts series becomes a long-form idea");
    const demo = await engine.analyticsSeries(true);
    assert.ok(demo.demo && demo.series.length >= 3 && demo.ideas.some((i) => i.format === "short"), "long-form series give Shorts ideas");
  });
  await test("Openings: hold read off the retention curve at 3 s or 30 s", async () => {
    const pts = [{ elapsedVideoTimeRatio: 0, audienceWatchRatio: 1 }, { elapsedVideoTimeRatio: 0.1, audienceWatchRatio: 0.7 }, { elapsedVideoTimeRatio: 1, audienceWatchRatio: 0.4 }];
    assert.equal(openingAt(50), 3);
    assert.equal(openingAt(600), 30);
    assert.equal(holdAt(pts, 60, 3), 0.85, "3 s into a 60 s video is halfway to the 10% point");
    assert.equal(holdAt([], 60, 3), null);
    const o = await engine.analyticsOpenings(true);
    assert.ok(o.openings.length >= 10 && o.openings[0].hold >= o.openings[o.openings.length - 1].hold, "sorted best first");
    assert.ok(o.insights.some((i) => i.text.startsWith("Your strongest openings")));
  });
  await test("Retention curve: weak hook and steep drop detected", () => {
    const pts = Array.from({ length: 101 }, (_, i) => ({ elapsedVideoTimeRatio: i / 100, audienceWatchRatio: i < 10 ? 1 - i * 0.06 : i === 50 ? 0.2 : 0.35, relativeRetentionPerformance: 0.3 }));
    const tips = retentionInsights(pts);
    assert.ok(tips.some((t) => t.text.includes("intro loses people")));
    assert.ok(tips.some((t) => t.text.includes("Steep drop")));
    assert.ok(demoRetention("v1").points.length === 101);
  });
  await test("OAuth URL uses PKCE and a loopback redirect", async () => {
    const st = new Store(new MemoryPersist());
    st.updateSettings({ google_client_id: "abc.apps.googleusercontent.com" });
    st.setSecret("google_client_secret", "shh");
    const e = new Engine(st, { desktop: true });
    const u = new URL(await e.analytics.authUrl("http://127.0.0.1:4321/callback"));
    assert.equal(u.searchParams.get("code_challenge_method"), "S256");
    assert.equal(u.searchParams.get("redirect_uri"), "http://127.0.0.1:4321/callback");
    assert.match(u.searchParams.get("scope")!, /yt-analytics\.readonly/);
    assert.equal(u.searchParams.get("access_type"), "offline");
    await assert.rejects(e.analytics.finish("wrong-state", "code"), /expired/);
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
}

main();
