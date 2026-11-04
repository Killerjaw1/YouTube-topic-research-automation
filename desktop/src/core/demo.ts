/**
 * Demo mode: a stand-in for the YouTube API that returns realistic, *made-up* data.
 *
 * Lets you explore every screen without an API key (and powers `npm run web`).
 * Results are deterministic per query. Nothing here is real YouTube data, and the
 * UI labels it as demo data everywhere.
 */

import { hash, rng } from "./util";
import type { SearchOptions, YouTubeSource } from "./youtube";

const TEMPLATES = [
  "{k} explained in 10 minutes", "I tried {k} for 30 days - here's what happened", "The truth about {k} nobody tells you",
  "{k} for beginners (complete guide)", "Why everyone is wrong about {k}", "{k}: 7 mistakes to avoid", "I spent $1,000 on {k}",
  "{k} tier list", "How {k} actually works", "Stop doing {k} like this", "{k} in 2026 - is it still worth it?", "The dark side of {k}",
  "{k} #shorts", "POV: you just discovered {k} #shorts", "{k} hack you need to know #shorts", "Ranking every {k}",
  "{k} vs the alternative - honest comparison", "My {k} setup tour", "Watch this before starting {k}", "{k} changed my life (not clickbait)",
];
const CH_WORDS = ["Pixel", "Atlas", "Nova", "Echo", "Summit", "Quartz", "Lumen", "Orbit", "Maple", "Cobalt", "Ember", "Harbor", "Vector", "Juniper", "Static", "Basil", "Kite", "Delta"];
const CH_SUFFIX = ["Labs", "TV", "Explained", "Daily", "Studio", "Academy", "HQ", "Bros", "Insider", "Uncut"];
export const DEMO_CATEGORIES: [string, string][] = [
  ["1", "Film & Animation"], ["2", "Autos & Vehicles"], ["10", "Music"], ["15", "Pets & Animals"], ["17", "Sports"], ["20", "Gaming"],
  ["22", "People & Blogs"], ["23", "Comedy"], ["24", "Entertainment"], ["25", "News & Politics"], ["26", "Howto & Style"],
  ["27", "Education"], ["28", "Science & Technology"],
];

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export class DemoYouTube implements YouTubeSource {
  readonly demo = true;
  private vids = new Map<string, any>();
  private chans = new Map<string, any>();

  private channel(cid: string, subs: number) {
    if (!this.chans.has(cid)) {
      const r = rng("ch", cid);
      const name = `${r.choice(CH_WORDS)} ${r.choice(CH_SUFFIX)}`;
      this.chans.set(cid, {
        id: cid,
        snippet: { title: name, thumbnails: {}, customUrl: "@" + name.replace(/ /g, "").toLowerCase() },
        statistics: { subscriberCount: String(subs), videoCount: String(r.int(20, 900)), viewCount: String(subs * r.int(40, 400)), hiddenSubscriberCount: false },
        contentDetails: { relatedPlaylists: { uploads: "UU" + cid.slice(2) } },
      });
    }
    return this.chans.get(cid);
  }

  private make(q: string, n: number, recentDays?: number, salt = "", onlyShort?: boolean): string[] {
    const topic = rng("topic", q.toLowerCase());
    const popularity = topic.uniform(2.0, 4.4); // log10 of typical views/day
    const dominance = topic.uniform(0.05, 0.9); // how much big channels own this topic
    const breakout = topic.uniform(0.0, 0.5); // chance small channels overperform
    const freshness = topic.uniform(0.1, 0.9);
    const shortsBias = topic.uniform(0.05, 0.55);
    const now = Date.now();
    const words = q.split(/\s+/);
    const ids: string[] = [];
    for (let i = 0; i < n; i++) {
      const r = rng("vid", q.toLowerCase(), salt, i);
      const vid = hash(`${q}${salt}${i}`).slice(0, 11);
      const big = r.random() < dominance * (i < 10 ? 1.2 : 0.8);
      let subs = Math.floor(10 ** (big ? r.uniform(5.8, 7.4) : r.uniform(2.3, 5.6)));
      const cid = "UC" + hash(`${q}${i % 37}${big}`) + hash(`${i % 37}`).slice(0, 6);
      subs = parseInt(this.channel(cid, subs).statistics.subscriberCount, 10);
      const age = recentDays ? r.uniform(1, recentDays) : r.random() < freshness ? r.uniform(2, 120) : r.uniform(120, 2400);
      let vpd = 10 ** (popularity + r.gauss(0, 0.45)) * (subs / 1e6) ** 0.35;
      if (!big && r.random() < breakout) vpd *= r.uniform(4, 30); // a small-channel breakout
      const views = Math.min(Math.floor(vpd * Math.max(age, 1) ** 0.85), subs * 300); // keep demo outliers believable
      const short = onlyShort ?? r.random() < shortsBias;
      const pool = TEMPLATES.filter((t) => t.includes("#shorts") === short);
      const template = r.choice(pool);
      const title = cap(template.replace("{k}", r.random() < 0.6 ? q : r.choice(words)).replace(/\s+/g, " "));
      const duration = short ? r.int(15, 59) : r.int(240, 2400);
      this.vids.set(vid, {
        id: vid,
        snippet: {
          title, channelId: cid, channelTitle: this.chans.get(cid).snippet.title,
          publishedAt: new Date(now - age * 86400000).toISOString().replace(/\.\d+Z$/, "Z"),
          thumbnails: {}, tags: [q, ...words, `${words[0]} tips`, `${q} guide`], description: `Demo video about ${q}.`,
        },
        statistics: { viewCount: String(views), likeCount: String(Math.floor(views * r.uniform(0.01, 0.06))), commentCount: String(Math.floor(views * r.uniform(0.0005, 0.006))) },
        contentDetails: { duration: `PT${Math.floor(duration / 60)}M${duration % 60}S` },
      });
      ids.push(vid);
    }
    return ids;
  }

  async search(q: string, o: SearchOptions = {}): Promise<string[]> {
    const recent = o.publishedAfter ? Math.max(1, Math.round((Date.now() - o.publishedAfter.getTime()) / 86400000)) : undefined;
    const only = o.videoDuration === "short" ? true : o.videoDuration ? false : undefined;
    const ids = this.make(q, o.maxResults ?? 50, recent, `${o.order ?? "relevance"}${recent ?? ""}${o.videoDuration ?? ""}`, only);
    const v = (id: string) => this.vids.get(id);
    if (o.order === "viewCount") ids.sort((a, b) => +v(b).statistics.viewCount - +v(a).statistics.viewCount);
    if (o.order === "date") ids.sort((a, b) => v(b).snippet.publishedAt.localeCompare(v(a).snippet.publishedAt));
    return ids;
  }

  async videos(ids: string[]) { return ids.map((i) => this.vids.get(i)).filter(Boolean); }
  async channels(ids: string[]) { return [...new Set(ids)].map((i) => this.chans.get(i)).filter(Boolean); }

  async channelLookup(text: string) {
    const cid = "UC" + hash(text) + hash(text + "x").slice(0, 6);
    const ch = this.channel(cid, 1200);
    ch.snippet.title = text.replace(/^@/, "") || "My channel";
    return ch;
  }

  async recentUploads(uploadsPlaylist: string, limit = 15) {
    const cid = "UC" + uploadsPlaylist.slice(2);
    const topics = ["retro game secrets", "weird geography", "science facts", "air fryer recipes", "meal prep", "space mysteries", "history oddities"];
    const ids = this.make(topics[parseInt(hash(cid).slice(0, 6), 16) % topics.length], limit, 120, cid);
    const name = this.chans.get(cid)?.snippet?.title;
    for (const i of ids) {
      const v = this.vids.get(i);
      v.snippet.channelId = cid;
      if (name) v.snippet.channelTitle = name;
      v.statistics.viewCount = String(Math.floor(+v.statistics.viewCount * 0.02) + 40);
    }
    return this.videos(ids);
  }

  async comments(videoId: string, max = 100) {
    const r = rng("comments", videoId);
    const subject = (this.vids.get(videoId)?.snippet?.title ?? "this").replace(/[^\w\s]/g, "").split(/\s+/).slice(-2).join(" ").toLowerCase();
    const asks = [`Why does ${subject} work like that?`, `How long did it take to figure out ${subject}?`, `What happens if you do ${subject} backwards?`,
      `Can you do a video on why air fryers dry out food?`, `Is it true that rice goes hard because of starch?`, `Why does freezer burn happen even in sealed bags?`,
      `How do restaurants keep fries crispy for so long?`, `What is the best way to reheat rice safely?`, `Great video!`, `First`, `This is so useful, thanks`];
    return Array.from({ length: Math.min(max, 24) }, () => ({ text: r.choice(asks), likes: r.int(0, 400) }));
  }

  async trending(region = "US", category?: string) {
    const label = DEMO_CATEGORIES.find(([id]) => id === category)?.[1] ?? "everything";
    const topics = ["new phone leak", "speedrun record", "street food tour", "budget build", "movie trailer reaction",
      "science experiment", "productivity system", "game update", "travel vlog", "ai tools"];
    let ids: string[] = [];
    for (const t of topics) ids = ids.concat(this.make(`${t} ${label}`, 6, 4, region));
    const vids = await this.videos(ids.slice(0, 50));
    return vids.sort((a, b) => +b.statistics.viewCount - +a.statistics.viewCount);
  }

  async categories() { return DEMO_CATEGORIES.map(([id, title]) => ({ id, title })); }
  async test() { /* nothing to test */ }
}

export function demoSuggestions(q: string): string[] {
  const r = rng("suggest", q.toLowerCase());
  const mods = ["for beginners", "explained", "2026", "tips", "mistakes", "vs", "tutorial", "challenge", "review", "at home",
    "on a budget", "for kids", "documentary", "hacks", "setup", "tier list", "reaction", "story", "guide", "ideas"];
  return r.shuffle(mods).slice(0, 10).map((m) => `${q} ${m}`);
}

export function demoReddit(sub: string) {
  const r = rng("reddit", sub);
  const stems = ["What's one thing you wish you knew before starting", "Unpopular opinion about", "I finally figured out",
    "Is it just me or is", "Complete beginner question about", "After 5 years, here's my honest take on", "The biggest myth about"];
  return Array.from({ length: 12 }, () => ({
    title: `${r.choice(stems)} ${sub}?`,
    score: r.int(150, 9000),
    comments: r.int(20, 1500),
    url: "",
    flair: r.choice(["Discussion", "Question", "", "Advice"]),
  }));
}
