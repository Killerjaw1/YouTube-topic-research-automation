import { useEffect, useState } from "react";
import type { PublicSettings } from "../../core/types";
import { call, isDesktop, openDataFolder } from "../api";
import { Icon } from "../components/Icon";
import { Loading, Toggle, useApp } from "../components/ui";
import { fmt } from "../format";
import { useConnectAnalytics } from "./Analytics";
import { REGIONS } from "./Trending";

const LINK = (href: string, text: string) => <a href={href} target="_blank" rel="noopener">{text}</a>;

export function SettingsPage() {
  const { toast, fail, refresh } = useApp();
  const connect = useConnectAnalytics();
  const [s, setS] = useState<PublicSettings | null>(null);
  const [keys, setKeys] = useState({ yt: "", ai: "", gSecret: "", channel: "" });
  const [form, setForm] = useState<Record<string, string>>({});
  const load = () => call("getSettings").then((x) => {
    setS(x);
    setForm({ region: x.region, language: x.language, small_channel_max: String(x.small_channel_max), big_channel_min: String(x.big_channel_min),
      fresh_days: String(x.fresh_days), cache_hours: String(x.cache_hours), daily_quota: String(x.daily_quota), google_client_id: x.google_client_id });
  }).catch(fail);
  useEffect(() => { load(); }, []); // eslint-disable-line
  if (!s) return <Loading title="Loading settings" />;

  const save = async (patch: Record<string, unknown>, msg = "Settings saved") => {
    try { setS(await call("saveSettings", patch)); toast(msg); await refresh(); return true; } catch (e) { fail(e); return false; }
  };
  const saveYouTube = async () => {
    if (!keys.yt.trim()) return toast("Paste a key first", "err");
    if (!(await save({ youtube_api_key: keys.yt, demo_mode: false }, "YouTube key saved"))) return;
    setKeys({ ...keys, yt: "" });
    try { await call("testYouTube"); toast("Key works! You're researching real YouTube data now."); } catch (e) { fail(e); }
    refresh();
  };
  const connectChannel = async (text: string) => {
    if (!text.trim()) return toast("Enter your @handle or channel URL", "err");
    try { const c = await call("connectChannel", text.trim()); toast(`Connected ${c.title}`); setKeys({ ...keys, channel: "" }); load(); refresh(); } catch (e) { fail(e); }
  };
  const ch = s.my_channel;
  const field = (k: string) => ({ value: form[k] ?? "", onChange: (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value }) });

  return (
    <div className="card">
      {!isDesktop && (
        <div className="banner warn"><Icon name="info" /><div className="grow"><b>Browser preview. </b>
          <span className="t2">This is the demo build (<code>npm run web</code>). Install the desktop app to use API keys, YouTube Analytics and AI.</span></div></div>
      )}
      <div className="settings-grid">
        <div><h3><Icon name="key" /> YouTube API key</h3><p>Free from Google. Gives you 10,000 units a day, about 95 quick topic scans.</p></div>
        <div className="stack" style={{ gap: 10 }}>
          <div className="row">
            <input className="input" type="password" style={{ flex: 1, minWidth: 260 }} value={keys.yt} onChange={(e) => setKeys({ ...keys, yt: e.target.value })}
              placeholder={s.youtube_api_key_hint ? `Saved: ${s.youtube_api_key_hint} (type to replace)` : "Paste your API key (starts with AIza…)"} disabled={!isDesktop} />
            <button className="btn primary" onClick={saveYouTube} disabled={!isDesktop}>Save</button>
            <button className="btn" disabled={!s.youtube_api_key_hint} onClick={async () => { try { await call("testYouTube"); toast("Key works!"); refresh(); } catch (e) { fail(e); } }}>Test key</button>
            {s.youtube_api_key_hint && <button className="btn ghost danger" onClick={async () => { setS(await call("forgetSecret", "youtube_api_key")); refresh(); }}>Remove</button>}
          </div>
          <details><summary className="small" style={{ cursor: "pointer", color: "var(--text-2)" }}>How to get a free key (3 minutes)</summary>
            <ol className="howto">
              <li>Open {LINK("https://console.cloud.google.com/projectcreate", "Google Cloud Console")} and create a project (any name).</li>
              <li>Go to {LINK("https://console.cloud.google.com/apis/library/youtube.googleapis.com", "YouTube Data API v3")} and click <b>Enable</b>.</li>
              <li>Open {LINK("https://console.cloud.google.com/apis/credentials", "Credentials")} → <b>Create credentials</b> → <b>API key</b>.</li>
              <li>Optional but smart: <b>Restrict key</b> → API restrictions → YouTube Data API v3.</li>
              <li>Paste it above and click Save. No billing account is needed for the free quota.</li>
            </ol>
          </details>
          <Toggle checked={s.demo_mode} onChange={(v) => save({ demo_mode: v }, v ? "Demo mode on" : "Demo mode off")}>
            Demo mode <span className="muted small">(made-up data, no quota; on automatically when no key is set)</span>
          </Toggle>
        </div>
      </div>

      <div className="settings-grid">
        <div><h3><Icon name="user" /> Your channel</h3><p>Connect your channel so “small channel” means channels within reach of <i>your</i> size.</p></div>
        <div className="stack" style={{ gap: 10 }}>
          {ch && (
            <div className="channel-card">
              <div className="avatar">{ch.thumb ? <img src={ch.thumb} alt="" /> : (ch.title || "?")[0]}</div>
              <div style={{ flex: 1, minWidth: 0 }}><b>{ch.title}</b> <span className="muted small">{ch.handle}</span>{ch.demo && <span className="badge demo"> demo</span>}
                <div className="small t2">{fmt(ch.subs)} subscribers · {fmt(ch.videos)} videos · median {fmt(ch.median_recent_views)} views on recent uploads · {Math.round(ch.shorts_share * 100)}% Shorts</div></div>
              <button className="btn sm" title="Refresh" onClick={() => connectChannel(ch.id)}><Icon name="refresh" /></button>
              <button className="btn sm ghost danger" onClick={async () => { await call("forgetChannel"); load(); refresh(); }}>Disconnect</button>
            </div>
          )}
          <div className="row">
            <input className="input" style={{ flex: 1, minWidth: 260 }} placeholder="@yourhandle or channel URL" value={keys.channel} onChange={(e) => setKeys({ ...keys, channel: e.target.value })} />
            <button className="btn" onClick={() => connectChannel(keys.channel)}>{ch ? "Change" : "Connect"}</button>
          </div>
          <Toggle checked={s.auto_small_threshold} onChange={(v) => save({ auto_small_threshold: v })}>
            Auto-size “small channel” from my channel <span className="muted small">(25× your subs, between 10K and 250K)</span>
          </Toggle>
        </div>
      </div>

      <div className="settings-grid">
        <div><h3><Icon name="chart" /> YouTube Analytics</h3><p>Connect your channel's private stats (retention, watch time, traffic sources) for personalised tips. Read-only.</p></div>
        <div className="stack" style={{ gap: 10 }}>
          {s.analytics_connected && (
            <div className="channel-card">
              <div className="avatar">{s.analytics_channel?.thumb ? <img src={s.analytics_channel.thumb} alt="" /> : "✓"}</div>
              <div style={{ flex: 1 }}><b>Connected{s.analytics_channel ? `: ${s.analytics_channel.title}` : ""}</b><div className="small t2">Read-only access to YouTube Analytics</div></div>
              <a className="btn sm" href="#/analytics">Open</a>
              <button className="btn sm ghost danger" onClick={async () => { await call("analyticsDisconnect"); toast("Disconnected"); load(); refresh(); }}>Disconnect</button>
            </div>
          )}
          <div className="form-row">
            <label className="field">OAuth client ID<input className="input" placeholder="…apps.googleusercontent.com" {...field("google_client_id")} disabled={!isDesktop} /></label>
            <label className="field">Client secret<input className="input" type="password" value={keys.gSecret} onChange={(e) => setKeys({ ...keys, gSecret: e.target.value })}
              placeholder={s.google_client_secret_hint ? `Saved: ${s.google_client_secret_hint}` : "GOCSPX-…"} disabled={!isDesktop} /></label>
          </div>
          <div className="row">
            <button className="btn" disabled={!isDesktop} onClick={async () => {
              const patch: Record<string, unknown> = { google_client_id: form.google_client_id };
              if (keys.gSecret.trim()) patch.google_client_secret = keys.gSecret;
              if (await save(patch, "Google OAuth client saved")) setKeys({ ...keys, gSecret: "" });
            }}>Save</button>
            <button className="btn primary" disabled={!isDesktop || !s.google_client_id || !s.google_client_secret_hint} onClick={() => connect(load)}>
              <Icon name="link" />{s.analytics_connected ? "Reconnect" : "Connect YouTube Analytics"}</button>
          </div>
          <details><summary className="small" style={{ cursor: "pointer", color: "var(--text-2)" }}>How to set this up (one time, about 5 minutes)</summary>
            <ol className="howto">
              <li>In the same {LINK("https://console.cloud.google.com/", "Google Cloud project")}, enable {LINK("https://console.cloud.google.com/apis/library/youtubeanalytics.googleapis.com", "YouTube Analytics API")} (and YouTube Data API v3).</li>
              <li>Open {LINK("https://console.cloud.google.com/auth/branding", "OAuth consent screen")}: choose <b>External</b>, fill in the app name and your email.</li>
              <li>Under <b>Audience</b>, add your own Google account as a test user, or click <b>Publish app</b>. Published apps stay signed in; in Testing mode Google signs you out every 7 days.
                Google will warn that the app is unverified. That's expected for your personal app: click Advanced → Continue.</li>
              <li>Go to {LINK("https://console.cloud.google.com/auth/clients", "Clients")} → <b>Create client</b> → type <b>Desktop app</b>. Copy the client ID and secret here and click Save.</li>
              <li>Click <b>Connect</b>. Your browser opens Google sign-in. Pick the account that owns your channel and allow read-only access.</li>
            </ol>
          </details>
        </div>
      </div>

      <div className="settings-grid">
        <div><h3><Icon name="sliders" /> Research settings</h3><p>Where and how topics are searched and scored.</p></div>
        <div className="stack" style={{ gap: 12 }}>
          <div className="form-row">
            <label className="field">Region<select className="select" {...field("region")}>{REGIONS.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</select></label>
            <label className="field"><span>Language <span className="hint">(ISO code)</span></span><input className="input" maxLength={5} {...field("language")} /></label>
            <label className="field"><span>Small channel = under <span className="hint">(subs)</span></span><input className="input" type="number" {...field("small_channel_max")} /></label>
            <label className="field"><span>Big channel = over <span className="hint">(subs)</span></span><input className="input" type="number" {...field("big_channel_min")} /></label>
            <label className="field"><span>“Fresh” means newer than <span className="hint">(days)</span></span><input className="input" type="number" {...field("fresh_days")} /></label>
            <label className="field"><span>Cache results for <span className="hint">(hours)</span></span><input className="input" type="number" {...field("cache_hours")} /></label>
            <label className="field"><span>Daily quota <span className="hint">(units)</span></span><input className="input" type="number" {...field("daily_quota")} /></label>
          </div>
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button className="btn primary" onClick={() => { const { google_client_id, ...rest } = form; void google_client_id; save(rest); }}>Save research settings</button>
          </div>
        </div>
      </div>

      <div className="settings-grid">
        <div><h3><Icon name="sparkle" /> AI assistant <span className="badge neutral">optional</span></h3><p>Uses Claude to turn a report into differentiated angles, ready-to-paste metadata and a retention plan.</p></div>
        <div className="stack" style={{ gap: 10 }}>
          <div className="row">
            <input className="input" type="password" style={{ flex: 1, minWidth: 260 }} value={keys.ai} onChange={(e) => setKeys({ ...keys, ai: e.target.value })}
              placeholder={s.anthropic_api_key_hint ? `Saved: ${s.anthropic_api_key_hint} (type to replace)` : "Anthropic API key (sk-ant-…)"} disabled={!isDesktop} />
            <button className="btn" disabled={!isDesktop} onClick={async () => { if (!keys.ai.trim()) return toast("Paste a key first", "err"); if (await save({ anthropic_api_key: keys.ai }, "Anthropic key saved")) setKeys({ ...keys, ai: "" }); }}>Save</button>
            {s.anthropic_api_key_hint && <button className="btn ghost danger" onClick={async () => { setS(await call("forgetSecret", "anthropic_api_key")); refresh(); }}>Remove</button>}
          </div>
          <span className="small muted">Get a key at {LINK("https://console.anthropic.com/", "console.anthropic.com")}. Billed per use to your Anthropic account.</span>
        </div>
      </div>

      <div className="settings-grid">
        <div><h3><Icon name="folder" /> Data</h3><p>Everything stays on this computer. No accounts, no NicheRadar servers.</p></div>
        <div className="stack" style={{ gap: 10 }}>
          <div className="row">
            <button className="btn" onClick={async () => { const r = await call("clearCache"); toast(`Cleared ${r.cleared} cached responses`); }}><Icon name="refresh" />Clear cached YouTube results</button>
            {isDesktop && <button className="btn" onClick={openDataFolder}><Icon name="folder" />Open data folder</button>}
          </div>
          <span className="small muted">Stored in <code>{s.data_dir}</code>. API keys and Google sign-in are encrypted with your Windows account.</span>
        </div>
      </div>
    </div>
  );
}
