import { type ReactNode, useEffect, useState } from "react";
import type { PublicSettings } from "../../core/types";
import { appVersion, call, isDesktop, openDataFolder, type UpdateState, updates } from "../api";
import { Icon } from "../components/Icon";
import { Loading, PageHead, Seg, type ThemePref, Toggle, useApp } from "../components/ui";
import { fmt } from "../format";
import { useConnectAnalytics } from "./Analytics";
import { REGIONS } from "./Trending";

const LINK = (href: string, text: string) => <a href={href} target="_blank" rel="noopener">{text}</a>;
const SECTIONS: [string, string][] = [["youtube", "YouTube data"], ["channel", "Your channel"], ["analytics", "YouTube Analytics"], ["research", "Research"],
  ["ai", "AI assistant"], ["appearance", "Appearance"], ["updates", "Updates"], ["data", "Data and privacy"]];

function Section({ id, title, desc, children }: { id: string; title: string; desc: ReactNode; children: ReactNode }) {
  return <section className="settings-section" id={`s-${id}`}><h2>{title}</h2><p>{desc}</p>{children}</section>;
}

function StatusLine({ ok, children }: { ok: boolean; children: ReactNode }) {
  return <span className="status-line"><span className={`dot ${ok ? "live" : ""}`} />{children}</span>;
}

export function SettingsPage() {
  const { toast, fail, refresh, theme, setTheme } = useApp();
  const connect = useConnectAnalytics();
  const [s, setS] = useState<PublicSettings | null>(null);
  const [keys, setKeys] = useState({ yt: "", ai: "", gSecret: "", channel: "" });
  const [form, setForm] = useState<Record<string, string>>({});
  const [version, setVersion] = useState("");
  const [upd, setUpd] = useState<UpdateState>({ state: "idle" });
  const load = () => call("getSettings").then((x) => {
    setS(x);
    setForm({ region: x.region, language: x.language, small_channel_max: String(x.small_channel_max), big_channel_min: String(x.big_channel_min),
      fresh_days: String(x.fresh_days), cache_hours: String(x.cache_hours), daily_quota: String(x.daily_quota), google_client_id: x.google_client_id });
  }).catch(fail);
  useEffect(() => {
    load();
    appVersion().then(setVersion);
    updates.state().then(setUpd);
    return updates.onChange(setUpd);
  }, []); // eslint-disable-line
  if (!s) return <Loading title="Loading settings" />;

  const save = async (patch: Record<string, unknown>, msg = "Settings saved") => {
    try { setS(await call("saveSettings", patch)); toast(msg); await refresh(); return true; } catch (e) { fail(e); return false; }
  };
  const saveYouTube = async () => {
    if (!keys.yt.trim()) return toast("Enter an API key first", "err");
    if (!(await save({ youtube_api_key: keys.yt, demo_mode: false }, "API key saved"))) return;
    setKeys({ ...keys, yt: "" });
    try { await call("testYouTube"); toast("API key verified"); } catch (e) { fail(e); }
    refresh();
  };
  const connectChannel = async (text: string) => {
    if (!text.trim()) return toast("Enter your @handle or channel URL", "err");
    try { const c = await call("connectChannel", text.trim()); toast(`Connected ${c.title}`); setKeys({ ...keys, channel: "" }); load(); refresh(); } catch (e) { fail(e); }
  };
  const ch = s.my_channel;
  const field = (k: string) => ({ value: form[k] ?? "", onChange: (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value }) });
  const updText = {
    idle: "Not checked yet", checking: "Checking for updates…", none: "You're on the latest version", unsupported: "Updates are available in the installed app",
    available: "Update found, downloading…", downloading: `Downloading update ${"percent" in upd ? upd.percent ?? 0 : 0}%`,
    ready: `Version ${"version" in upd ? upd.version : ""} is ready to install`, error: `Update check failed: ${"message" in upd ? upd.message : ""}`,
  }[upd.state];

  return (
    <>
      <PageHead title="Settings" />
      {!isDesktop && <div className="banner"><Icon name="info" /><div className="grow"><b>Browser preview. </b>API keys, YouTube Analytics and AI features require the desktop app.</div></div>}
      <div className="settings-layout">
        <nav className="settings-nav">{SECTIONS.map(([id, l]) => <a key={id} href={`#/settings`} onClick={(e) => { e.preventDefault(); document.getElementById(`s-${id}`)?.scrollIntoView({ behavior: "smooth" }); }}>{l}</a>)}</nav>
        <div>
          <Section id="youtube" title="YouTube data" desc="NicheRadar reads public search results with your own YouTube Data API key. The free quota is 10,000 units a day, about 95 standard analyses.">
            <div className="stack" style={{ gap: 12 }}>
              <StatusLine ok={Boolean(s.youtube_api_key_hint)}>{s.youtube_api_key_hint ? `API key saved (${s.youtube_api_key_hint})` : "No API key. Using sample data."}</StatusLine>
              <div className="row">
                <input className="input grow" type="password" value={keys.yt} onChange={(e) => setKeys({ ...keys, yt: e.target.value })} style={{ maxWidth: 420 }}
                  placeholder={s.youtube_api_key_hint ? "Enter a new key to replace it" : "AIza…"} disabled={!isDesktop} aria-label="YouTube API key" />
                <button className="btn primary" onClick={saveYouTube} disabled={!isDesktop || !keys.yt.trim()}>Save and verify</button>
                {s.youtube_api_key_hint && <button className="btn" onClick={async () => { try { await call("testYouTube"); toast("API key verified"); refresh(); } catch (e) { fail(e); } }}>Verify</button>}
                {s.youtube_api_key_hint && <button className="btn ghost danger" onClick={async () => { setS(await call("forgetSecret", "youtube_api_key")); refresh(); }}>Remove</button>}
              </div>
              <details className="howto"><summary>How to create an API key</summary>
                <ol>
                  <li>Create a project in {LINK("https://console.cloud.google.com/projectcreate", "Google Cloud Console")}.</li>
                  <li>Enable {LINK("https://console.cloud.google.com/apis/library/youtube.googleapis.com", "YouTube Data API v3")} for the project.</li>
                  <li>Open {LINK("https://console.cloud.google.com/apis/credentials", "Credentials")} and choose Create credentials → API key.</li>
                  <li>Recommended: restrict the key to YouTube Data API v3 under API restrictions.</li>
                </ol>
              </details>
              <Toggle checked={s.demo_mode} onChange={(v) => save({ demo_mode: v }, v ? "Sample data enabled" : "Sample data disabled")}>
                Use sample data <span className="muted">(no quota is used)</span>
              </Toggle>
            </div>
          </Section>

          <Section id="channel" title="Your channel" desc="Scores treat channels within reach of yours as small, so the competition reflects what you can realistically outrank.">
            <div className="stack" style={{ gap: 12 }}>
              {ch && (
                <div className="channel-card">
                  <div className="avatar">{ch.thumb ? <img src={ch.thumb} alt="" /> : (ch.title || "?")[0]}</div>
                  <div className="grow"><b>{ch.title}</b> <span className="muted small">{ch.handle}</span>
                    <div className="small t2">{fmt(ch.subs)} subscribers · {fmt(ch.videos)} videos · median {fmt(ch.median_recent_views)} views on recent uploads · {Math.round(ch.shorts_share * 100)}% Shorts</div></div>
                  <button className="btn sm" onClick={() => connectChannel(ch.id)}><Icon name="refresh" />Refresh</button>
                  <button className="btn sm ghost danger" onClick={async () => { await call("forgetChannel"); load(); refresh(); }}>Remove</button>
                </div>
              )}
              <div className="row">
                <input className="input grow" style={{ maxWidth: 420 }} placeholder="@handle or channel URL" value={keys.channel} onChange={(e) => setKeys({ ...keys, channel: e.target.value })} aria-label="Channel" />
                <button className="btn" onClick={() => connectChannel(keys.channel)}>{ch ? "Change channel" : "Add channel"}</button>
              </div>
              <Toggle checked={s.auto_small_threshold} onChange={(v) => save({ auto_small_threshold: v })}>
                Set the small-channel limit from my channel <span className="muted">(25× your subscribers, between 10K and 250K)</span>
              </Toggle>
            </div>
          </Section>

          <Section id="analytics" title="YouTube Analytics" desc="Read-only access to your channel's private statistics: retention, watch time, traffic sources and click-through rate.">
            <div className="stack" style={{ gap: 12 }}>
              <StatusLine ok={s.analytics_connected}>{s.analytics_connected ? `Connected${s.analytics_channel ? ` to ${s.analytics_channel.title}` : ""}` : "Not connected"}</StatusLine>
              <div className="form-row" style={{ maxWidth: 640 }}>
                <label className="field">OAuth client ID<input className="input" placeholder="….apps.googleusercontent.com" {...field("google_client_id")} disabled={!isDesktop} /></label>
                <label className="field">Client secret<input className="input" type="password" value={keys.gSecret} onChange={(e) => setKeys({ ...keys, gSecret: e.target.value })}
                  placeholder={s.google_client_secret_hint ? `Saved (${s.google_client_secret_hint})` : "GOCSPX-…"} disabled={!isDesktop} /></label>
              </div>
              <div className="row">
                <button className="btn" disabled={!isDesktop} onClick={async () => {
                  const patch: Record<string, unknown> = { google_client_id: form.google_client_id };
                  if (keys.gSecret.trim()) patch.google_client_secret = keys.gSecret;
                  if (await save(patch, "OAuth client saved")) setKeys({ ...keys, gSecret: "" });
                }}>Save client</button>
                <button className="btn primary" disabled={!isDesktop || !s.google_client_id || !s.google_client_secret_hint} onClick={() => connect(load)}>
                  {s.analytics_connected ? "Reconnect" : "Connect with Google"}</button>
                {s.analytics_connected && <button className="btn ghost danger" onClick={async () => { await call("analyticsDisconnect"); toast("YouTube Analytics disconnected"); load(); refresh(); }}>Disconnect</button>}
              </div>
              <details className="howto"><summary>How to create an OAuth client</summary>
                <ol>
                  <li>In your Google Cloud project, enable {LINK("https://console.cloud.google.com/apis/library/youtubeanalytics.googleapis.com", "YouTube Analytics API")}.</li>
                  <li>Configure the {LINK("https://console.cloud.google.com/auth/branding", "OAuth consent screen")} with the External user type.</li>
                  <li>Under Audience, publish the app or add your Google account as a test user. In testing mode Google requires signing in again every 7 days.</li>
                  <li>Under {LINK("https://console.cloud.google.com/auth/clients", "Clients")}, create a client of type Desktop app and copy its ID and secret here.</li>
                  <li>Choose Connect with Google and sign in with the account that owns your channel. Google may show an unverified-app notice for personal clients; choose Advanced → Continue.</li>
                </ol>
              </details>
            </div>
          </Section>

          <Section id="research" title="Research" desc="Where topics are searched and how channels are classified.">
            <div className="form-row" style={{ maxWidth: 760 }}>
              <label className="field">Region<select className="select" {...field("region")}>{REGIONS.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</select></label>
              <label className="field"><span>Language <span className="hint">ISO code</span></span><input className="input" maxLength={5} {...field("language")} /></label>
              <label className="field"><span>Small channel below <span className="hint">subscribers</span></span><input className="input" type="number" {...field("small_channel_max")} /></label>
              <label className="field"><span>Large channel from <span className="hint">subscribers</span></span><input className="input" type="number" {...field("big_channel_min")} /></label>
              <label className="field"><span>Recent upload within <span className="hint">days</span></span><input className="input" type="number" {...field("fresh_days")} /></label>
              <label className="field"><span>Cache results for <span className="hint">hours</span></span><input className="input" type="number" {...field("cache_hours")} /></label>
              <label className="field"><span>Daily quota <span className="hint">units</span></span><input className="input" type="number" {...field("daily_quota")} /></label>
            </div>
            <div className="row" style={{ marginTop: 14 }}>
              <button className="btn primary" onClick={() => { const { google_client_id, ...rest } = form; void google_client_id; save(rest); }}>Save changes</button>
            </div>
          </Section>

          <Section id="ai" title="AI assistant" desc="Optional. Uses Claude to suggest angles, write metadata and plan retention from your research. Requests are billed to your Anthropic account.">
            <div className="stack" style={{ gap: 12 }}>
              <StatusLine ok={Boolean(s.anthropic_api_key_hint)}>{s.anthropic_api_key_hint ? `API key saved (${s.anthropic_api_key_hint})` : "Not configured"}</StatusLine>
              <div className="row">
                <input className="input grow" type="password" style={{ maxWidth: 420 }} value={keys.ai} onChange={(e) => setKeys({ ...keys, ai: e.target.value })}
                  placeholder={s.anthropic_api_key_hint ? "Enter a new key to replace it" : "sk-ant-…"} disabled={!isDesktop} aria-label="Anthropic API key" />
                <button className="btn" disabled={!isDesktop || !keys.ai.trim()} onClick={async () => { if (await save({ anthropic_api_key: keys.ai }, "Anthropic API key saved")) setKeys({ ...keys, ai: "" }); }}>Save</button>
                {s.anthropic_api_key_hint && <button className="btn ghost danger" onClick={async () => { setS(await call("forgetSecret", "anthropic_api_key")); refresh(); }}>Remove</button>}
              </div>
              <span className="small muted">Create a key in the {LINK("https://console.anthropic.com/", "Anthropic Console")}.</span>
            </div>
          </Section>

          <Section id="appearance" title="Appearance" desc="Choose a theme, or follow your Windows setting.">
            <Seg value={theme} onChange={(v: ThemePref) => setTheme(v)} options={[["system", "System"], ["light", "Light"], ["dark", "Dark"]]} />
          </Section>

          <Section id="updates" title="Updates" desc="New versions are downloaded in the background and installed when you restart.">
            <div className="stack" style={{ gap: 12 }}>
              <div className="row">
                <StatusLine ok={upd.state === "none" || upd.state === "ready"}>{updText}</StatusLine>
                <span className="grow" />
                {upd.state === "ready" ? <button className="btn primary" onClick={() => updates.install()}>Restart and update</button>
                  : <button className="btn" disabled={!updates.supported || upd.state === "checking" || upd.state === "downloading"} onClick={() => updates.check().then(setUpd)}>Check for updates</button>}
              </div>
              <Toggle checked={s.auto_update} onChange={(v) => save({ auto_update: v })}>Check for updates when NicheRadar starts</Toggle>
            </div>
          </Section>

          <Section id="data" title="Data and privacy" desc="Everything is stored on this computer. NicheRadar has no accounts and no servers of its own.">
            <div className="stack" style={{ gap: 12 }}>
              <div className="small t2">Location: <code>{s.data_dir}</code></div>
              <div className="small t2">API keys and your Google sign-in are encrypted with your Windows account. Network requests go only to Google, Reddit (when you use it) and Anthropic (when you use AI features).</div>
              <div className="row">
                {isDesktop && <button className="btn" onClick={openDataFolder}><Icon name="folder" />Open data folder</button>}
                <button className="btn" onClick={async () => { const r = await call("clearCache"); toast(`Cleared ${r.cleared} cached responses`); }}>Clear cache</button>
                <button className="btn ghost" onClick={async () => { await call("saveSettings", { onboarded: false }); location.reload(); }}>Run setup again</button>
              </div>
            </div>
          </Section>

          <div className="small muted" style={{ paddingTop: 8 }}>NicheRadar {version}</div>
        </div>
      </div>
    </>
  );
}
