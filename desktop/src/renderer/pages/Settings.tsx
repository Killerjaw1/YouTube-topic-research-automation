import { useEffect, useState } from "react";
import type { PublicSettings } from "../../core/types";
import { appVersion, call, isDesktop, openDataFolder, type UpdateState, updates } from "../api";
import { Banner, Button, Segmented, SettingRow, SettingsGroup, Status, Switch } from "../components/kit";
import { Loading, PageHead, type ThemePref, useApp } from "../components/ui";
import { fmt } from "../format";
import { useConnectAnalytics } from "./Analytics";
import { REGIONS } from "./Trending";

const LINK = (href: string, text: string) => <a href={href} target="_blank" rel="noopener">{text}</a>;
const SECTIONS: [string, string][] = [["youtube", "YouTube data"], ["channel", "Your channel"], ["analytics", "YouTube Analytics"], ["research", "Research"], ["watchlist", "Watchlist"],
  ["ai", "AI assistant"], ["appearance", "Appearance"], ["updates", "Updates"], ["data", "Data and privacy"]];
const RESEARCH_KEYS = ["region", "language", "small_channel_max", "big_channel_min", "fresh_days", "cache_hours", "daily_quota"] as const;

function HowTo({ summary, children }: { summary: string; children: React.ReactNode }) {
  return <details className="howto"><summary><span className="ico" aria-hidden>›</span>{summary}</summary><ol>{children}</ol></details>;
}

export function SettingsPage() {
  const { toast, fail, refresh, theme, setTheme } = useApp();
  const connect = useConnectAnalytics();
  const [s, setS] = useState<PublicSettings | null>(null);
  const [keys, setKeys] = useState({ yt: "", ai: "", gSecret: "", channel: "" });
  const [form, setForm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [version, setVersion] = useState("");
  const [upd, setUpd] = useState<UpdateState>({ state: "idle" });
  const formOf = (x: PublicSettings) => ({ region: x.region, language: x.language, small_channel_max: String(x.small_channel_max), big_channel_min: String(x.big_channel_min),
    fresh_days: String(x.fresh_days), cache_hours: String(x.cache_hours), daily_quota: String(x.daily_quota), google_client_id: x.google_client_id });
  const load = () => call("getSettings").then((x) => { setS(x); setForm(formOf(x)); }).catch((e) => fail(e, "Settings couldn’t be loaded"));
  useEffect(() => {
    load();
    appVersion().then(setVersion);
    updates.state().then(setUpd);
    return updates.onChange(setUpd);
  }, []); // eslint-disable-line
  if (!s) return <><PageHead title="Settings" /><Loading title="Loading settings" /></>;

  const run = async (what: string, fn: () => Promise<unknown>) => { setBusy(what); try { await fn(); } finally { setBusy(null); } };
  const save = async (patch: Record<string, unknown>, msg = "Settings saved") => {
    try { setS(await call("saveSettings", patch)); toast(msg); await refresh(); return true; } catch (e) { fail(e, "Settings weren’t saved"); return false; }
  };
  const verifyYouTube = async () => {
    try { await call("testYouTube"); toast("API key verified", "ok", "YouTube accepted the key."); } catch (e) { fail(e, "The API key couldn’t be verified"); }
    refresh();
  };
  const saveYouTube = () => run("yt", async () => {
    if (!keys.yt.trim()) return;
    if (!(await save({ youtube_api_key: keys.yt, demo_mode: false }, "API key saved"))) return;
    setKeys((k) => ({ ...k, yt: "" }));
    await verifyYouTube();
  });
  const connectChannel = (text: string) => run("channel", async () => {
    if (!text.trim()) return;
    try { const c = await call("connectChannel", text.trim()); toast("Channel added", "ok", c.title); setKeys((k) => ({ ...k, channel: "" })); load(); refresh(); }
    catch (e) { fail(e, "The channel couldn’t be found"); }
  });
  const forget = async (key: "youtube_api_key" | "anthropic_api_key", msg: string) => {
    try { setS(await call("forgetSecret", key)); toast(msg); refresh(); } catch (e) { fail(e, "The key wasn’t removed"); }
  };
  const ch = s.my_channel;
  const field = (k: string) => ({ value: form[k] ?? "", onChange: (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value }) });
  const researchDirty = RESEARCH_KEYS.some((k) => form[k] !== formOf(s)[k]);
  const pct = "percent" in upd ? upd.percent ?? 0 : 0;
  const updText: Record<UpdateState["state"], string> = {
    idle: "Not checked yet", checking: "Checking for updates…", none: "You’re on the latest version", unsupported: "Updates are available in the installed app",
    available: "Update found. Downloading…", downloading: `Downloading the update, ${pct}%`,
    ready: `Version ${"version" in upd ? upd.version : ""} is ready to install`, error: `The update check didn’t finish. ${"message" in upd ? upd.message : ""} Try again later.`,
  };
  const updTone = upd.state === "ready" || upd.state === "none" ? "ok" : upd.state === "error" ? "danger" : upd.state === "idle" || upd.state === "unsupported" ? "idle" : "accent";

  return (
    <>
      <PageHead title="Settings" desc="Keys, your channel and how topics are researched. Everything is saved on this computer." />
      {!isDesktop && (
        <Banner tone="accent" icon="info" title="Browser preview">API keys, YouTube Analytics and AI features need the desktop app.</Banner>
      )}
      <nav className="settings-jump" aria-label="Settings sections">
        {SECTIONS.map(([id, l]) => <a key={id} href="#/settings" onClick={(e) => { e.preventDefault(); document.getElementById(`s-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>{l}</a>)}
      </nav>

      <SettingsGroup id="s-youtube" title="YouTube data" desc="NicheRadar reads public search results with your own YouTube Data API key. The free quota is 10,000 units a day, about 95 standard analyses.">
        <SettingRow title="API key" desc={s.youtube_api_key_hint ? <Status tone="ok">Saved, ends in {s.youtube_api_key_hint}</Status> : <Status>Not added. Sample data is in use.</Status>}>
          {s.youtube_api_key_hint && <>
            <Button size="sm" variant="ghost" className="danger" onClick={() => forget("youtube_api_key", "API key removed")}>Remove</Button>
            <Button size="sm" busy={busy === "verify"} onClick={() => run("verify", verifyYouTube)}>Verify</Button>
          </>}
        </SettingRow>
        <SettingRow title={s.youtube_api_key_hint ? "Replace the key" : "Add a key"} desc="Paste a key from Google Cloud Console. It’s checked with YouTube when you save it.">
          <form className="row nowrap" onSubmit={(e) => { e.preventDefault(); saveYouTube(); }}>
            <input className="input" type="password" value={keys.yt} onChange={(e) => setKeys({ ...keys, yt: e.target.value })}
              placeholder="AIza…" disabled={!isDesktop} aria-label="YouTube API key" autoComplete="off" />
            <Button type="submit" variant="primary" busy={busy === "yt"} disabled={!isDesktop || !keys.yt.trim()}>Save and verify</Button>
          </form>
        </SettingRow>
        <SettingRow title="Use sample data" desc="Explore with made-up results instead of live YouTube data. No quota is used.">
          <Switch label="Use sample data" checked={s.demo_mode} onChange={(v) => save({ demo_mode: v }, v ? "Sample data turned on" : "Sample data turned off")} />
        </SettingRow>
        <HowTo summary="How to create an API key">
          <li>Create a project in {LINK("https://console.cloud.google.com/projectcreate", "Google Cloud Console")}.</li>
          <li>Turn on {LINK("https://console.cloud.google.com/apis/library/youtube.googleapis.com", "YouTube Data API v3")} for the project.</li>
          <li>Open {LINK("https://console.cloud.google.com/apis/credentials", "Credentials")} and choose Create credentials, then API key.</li>
          <li>Recommended: under API restrictions, limit the key to YouTube Data API v3.</li>
        </HowTo>
      </SettingsGroup>

      <SettingsGroup id="s-channel" title="Your channel" desc="Scores treat channels within reach of yours as small, so the competition reflects what you can realistically outrank.">
        {ch && (
          <div className="setting-row">
            <div className="avatar">{ch.thumb ? <img src={ch.thumb} alt="" /> : (ch.title || "?")[0]}</div>
            <div className="text"><b>{ch.title} <span className="muted" style={{ fontWeight: 400 }}>{ch.handle}</span></b>
              <span>{fmt(ch.subs)} subscribers · {fmt(ch.videos)} videos · median {fmt(ch.median_recent_views)} views on recent uploads · {Math.round(ch.shorts_share * 100)}% Shorts</span></div>
            <div className="control">
              <Button size="sm" variant="ghost" className="danger" onClick={async () => { try { await call("forgetChannel"); toast("Channel removed"); load(); refresh(); } catch (e) { fail(e, "The channel wasn’t removed"); } }}>Remove</Button>
              <Button size="sm" icon="refresh" busy={busy === "channel"} onClick={() => connectChannel(ch.id)}>Refresh</Button>
            </div>
          </div>
        )}
        <SettingRow title={ch ? "Change channel" : "Add your channel"} desc="Your @handle or channel URL.">
          <form className="row nowrap" onSubmit={(e) => { e.preventDefault(); connectChannel(keys.channel); }}>
            <input className="input" placeholder="@handle or channel URL" value={keys.channel} onChange={(e) => setKeys({ ...keys, channel: e.target.value })} aria-label="Channel" />
            <Button type="submit" busy={busy === "channel" && !!keys.channel} disabled={!keys.channel.trim()}>{ch ? "Change" : "Add channel"}</Button>
          </form>
        </SettingRow>
        <SettingRow title="Set the small-channel limit from my channel" desc="25 times your subscribers, between 10K and 250K.">
          <Switch label="Set the small-channel limit from my channel" checked={s.auto_small_threshold} onChange={(v) => save({ auto_small_threshold: v })} />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup id="s-analytics" title="YouTube Analytics" desc="Read-only access to your channel’s private statistics: retention, watch time, traffic sources and click-through rate.">
        <SettingRow title="Connection" desc={s.analytics_connected ? <Status tone="ok">Connected{s.analytics_channel ? ` to ${s.analytics_channel.title}` : ""}</Status>
          : <Status>{s.google_client_id && s.google_client_secret_hint ? "Not connected" : "Not connected. Save an OAuth client below first."}</Status>}>
          {s.analytics_connected && <Button size="sm" variant="ghost" className="danger" onClick={async () => {
            try { await call("analyticsDisconnect"); toast("YouTube Analytics disconnected"); load(); refresh(); } catch (e) { fail(e, "YouTube Analytics wasn’t disconnected"); }
          }}>Disconnect</Button>}
          <Button size="sm" variant={s.analytics_connected ? "default" : "primary"} disabled={!isDesktop || !s.google_client_id || !s.google_client_secret_hint} onClick={() => connect(load)}>
            {s.analytics_connected ? "Reconnect…" : "Connect with Google…"}</Button>
        </SettingRow>
        <SettingRow title="OAuth client ID" desc="From a Desktop app client in your Google Cloud project.">
          <input className="input" placeholder="….apps.googleusercontent.com" {...field("google_client_id")} disabled={!isDesktop} aria-label="OAuth client ID" autoComplete="off" />
        </SettingRow>
        <SettingRow title="Client secret" desc={s.google_client_secret_hint ? `Saved, ends in ${s.google_client_secret_hint}. Enter a new one to replace it.` : "Shown next to the client ID in Google Cloud Console."}>
          <input className="input" type="password" value={keys.gSecret} onChange={(e) => setKeys({ ...keys, gSecret: e.target.value })}
            placeholder="GOCSPX-…" disabled={!isDesktop} aria-label="Client secret" autoComplete="off" />
        </SettingRow>
        <SettingRow title="Save the client" desc="Save the ID and secret, then connect.">
          <Button disabled={!isDesktop || (form.google_client_id === s.google_client_id && !keys.gSecret.trim())} busy={busy === "client"} onClick={() => run("client", async () => {
            const patch: Record<string, unknown> = { google_client_id: form.google_client_id };
            if (keys.gSecret.trim()) patch.google_client_secret = keys.gSecret;
            if (await save(patch, "OAuth client saved")) setKeys((k) => ({ ...k, gSecret: "" }));
          })}>Save client</Button>
        </SettingRow>
        <HowTo summary="How to create an OAuth client">
          <li>In your Google Cloud project, turn on {LINK("https://console.cloud.google.com/apis/library/youtubeanalytics.googleapis.com", "YouTube Analytics API")}.</li>
          <li>Set up the {LINK("https://console.cloud.google.com/auth/branding", "OAuth consent screen")} with the External user type.</li>
          <li>Under Audience, publish the app or add your Google account as a test user. In testing mode, Google asks you to sign in again every 7 days.</li>
          <li>Under {LINK("https://console.cloud.google.com/auth/clients", "Clients")}, create a client of type Desktop app and copy its ID and secret here.</li>
          <li>Choose Connect with Google and sign in with the account that owns your channel. Google may say the app isn’t verified, because the client is your own; choose Advanced, then Continue.</li>
        </HowTo>
      </SettingsGroup>

      <SettingsGroup id="s-research" title="Research" desc="Where topics are searched and how channels are classified.">
        <SettingRow title="Region" desc="Search results and trending videos come from this country.">
          <select className="select" {...field("region")} aria-label="Region">{REGIONS.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</select>
        </SettingRow>
        <SettingRow title="Language" desc="A two-letter code, such as en or es.">
          <input className="input sm" maxLength={5} {...field("language")} aria-label="Language" />
        </SettingRow>
        <SettingRow title="Small channel below" desc={s.auto_small_threshold ? "Subscribers. Set from your channel while that’s turned on above." : "Subscribers. Channels below this count as small."}>
          <input className="input sm tabular" type="number" min={0} {...field("small_channel_max")} aria-label="Small channel below, subscribers" />
        </SettingRow>
        <SettingRow title="Large channel from" desc="Subscribers. Channels from this size count as large.">
          <input className="input sm tabular" type="number" min={0} {...field("big_channel_min")} aria-label="Large channel from, subscribers" />
        </SettingRow>
        <SettingRow title="Recent upload within" desc="Days. Used for freshness and content gaps.">
          <input className="input sm tabular" type="number" min={1} {...field("fresh_days")} aria-label="Recent upload within, days" />
        </SettingRow>
        <SettingRow title="Keep results for" desc="Hours. Repeating a search in this time uses no quota.">
          <input className="input sm tabular" type="number" min={0} {...field("cache_hours")} aria-label="Keep results for, hours" />
        </SettingRow>
        <SettingRow title="Daily quota" desc="Units. The free YouTube quota is 10,000 a day.">
          <input className="input sm tabular" type="number" min={0} {...field("daily_quota")} aria-label="Daily quota, units" />
        </SettingRow>
        <div className="setting-row actions-row">
          {researchDirty && <Button variant="ghost" onClick={() => setForm(formOf(s))}>Discard changes</Button>}
          <Button variant="primary" disabled={!researchDirty} busy={busy === "research"} onClick={() => run("research", async () => {
            const patch: Record<string, string> = {};
            for (const k of RESEARCH_KEYS) patch[k] = form[k];
            await save(patch);
          })}>Save changes</Button>
        </div>
      </SettingsGroup>

      <SettingsGroup id="s-watchlist" title="Watchlist">
        <SettingRow title="Check every week" desc="Re-scores tracked topics once a week while NicheRadar is open, about 102 quota units each, and notifies you when one improves.">
          <Switch label="Check the watchlist every week" checked={s.weekly_check} disabled={!isDesktop} onChange={(v) => save({ weekly_check: v }, v ? "Weekly check turned on" : "Weekly check turned off")} />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup id="s-ai" title="AI assistant" desc="Optional. Uses Claude to suggest angles, write metadata and plan retention from your research. Requests are billed to your Anthropic account.">
        <SettingRow title="Anthropic API key" desc={s.anthropic_api_key_hint ? <Status tone="ok">Saved, ends in {s.anthropic_api_key_hint}</Status> : <span>Create a key in the {LINK("https://console.anthropic.com/", "Anthropic Console")}.</span>}>
          {s.anthropic_api_key_hint && <Button size="sm" variant="ghost" className="danger" onClick={() => forget("anthropic_api_key", "Anthropic API key removed")}>Remove</Button>}
        </SettingRow>
        <SettingRow title={s.anthropic_api_key_hint ? "Replace the key" : "Add a key"} desc="Stored encrypted on this computer.">
          <form className="row nowrap" onSubmit={async (e) => { e.preventDefault(); if (keys.ai.trim() && await save({ anthropic_api_key: keys.ai }, "Anthropic API key saved")) setKeys({ ...keys, ai: "" }); }}>
            <input className="input" type="password" value={keys.ai} onChange={(e) => setKeys({ ...keys, ai: e.target.value })}
              placeholder="sk-ant-…" disabled={!isDesktop} aria-label="Anthropic API key" autoComplete="off" />
            <Button type="submit" disabled={!isDesktop || !keys.ai.trim()}>Save</Button>
          </form>
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup id="s-appearance" title="Appearance">
        <SettingRow title="Theme" desc="Follow your Windows setting, or choose light or dark.">
          <Segmented label="Theme" value={theme} onChange={(v: ThemePref) => setTheme(v)} options={[["system", "System"], ["light", "Light"], ["dark", "Dark"]]} />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup id="s-updates" title="Updates" desc="New versions download in the background and install when you restart.">
        <SettingRow title={`NicheRadar ${version}`} desc={<Status tone={updTone}>{updText[upd.state]}</Status>}>
          {upd.state === "ready" ? <Button variant="primary" onClick={() => updates.install()}>Restart and update</Button>
            : <Button busy={upd.state === "checking"} disabled={!updates.supported || upd.state === "checking" || upd.state === "downloading"} onClick={() => updates.check().then(setUpd)}>Check for updates</Button>}
        </SettingRow>
        <SettingRow title="Check for updates at startup" desc="Looks for a new version each time NicheRadar opens.">
          <Switch label="Check for updates at startup" checked={s.auto_update} onChange={(v) => save({ auto_update: v })} />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup id="s-data" title="Data and privacy" desc="NicheRadar has no accounts and no servers of its own. Network requests go only to Google, Reddit (when you use it) and Anthropic (when you use AI features).">
        <SettingRow title="Data folder" desc={<code className="mono">{s.data_dir}</code>}>
          {isDesktop && <Button size="sm" icon="folder" onClick={openDataFolder}>Open folder</Button>}
        </SettingRow>
        <SettingRow title="Keys and sign-in" desc="API keys and your Google sign-in are encrypted with your Windows account." />
        <SettingRow title="Cached results" desc="Saved YouTube responses that let repeat searches skip the quota.">
          <Button size="sm" onClick={async () => { try { const r = await call("clearCache"); toast("Cache cleared", "ok", `${r.cleared} saved ${r.cleared === 1 ? "response" : "responses"} removed.`); } catch (e) { fail(e, "The cache wasn’t cleared"); } }}>Clear cache</Button>
        </SettingRow>
        <SettingRow title="Setup" desc="Show the welcome steps again.">
          <Button size="sm" onClick={async () => { await call("saveSettings", { onboarded: false }); location.reload(); }}>Run setup again</Button>
        </SettingRow>
      </SettingsGroup>
    </>
  );
}
