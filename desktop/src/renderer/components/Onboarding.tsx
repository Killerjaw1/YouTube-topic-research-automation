/** First-run setup: YouTube API key, then your channel. Can be skipped to explore with sample data. */

import { useState } from "react";
import { call, isDesktop } from "../api";
import { useApp } from "./ui";

const LINK = (href: string, text: string) => <a className="link" href={href} target="_blank" rel="noopener">{text}</a>;

export function Onboarding({ onDone }: { onDone(): void }) {
  const { fail, toast, refresh } = useApp();
  const [step, setStep] = useState(0);
  const [key, setKey] = useState("");
  const [channel, setChannel] = useState("");
  const [busy, setBusy] = useState(false);

  const finish = async () => {
    await call("saveSettings", { onboarded: true }).catch(() => undefined);
    await refresh();
    onDone();
  };
  const saveKey = async () => {
    if (!key.trim()) return setStep(2);
    setBusy(true);
    try {
      await call("saveSettings", { youtube_api_key: key.trim(), demo_mode: false });
      await call("testYouTube");
      toast("API key verified");
      setStep(2);
    } catch (e) { fail(e); } finally { setBusy(false); }
  };
  const saveChannel = async () => {
    if (!channel.trim()) return finish();
    setBusy(true);
    try { const c = await call("connectChannel", channel.trim()); toast(`Connected ${c.title}`); await finish(); }
    catch (e) { fail(e); } finally { setBusy(false); }
  };

  return (
    <div className="onboard">
      <div className="onboard-card">
        <img className="mark" src="./logo.svg" alt="" />
        <div className="onboard-steps">{[0, 1, 2].map((i) => <i key={i} className={i <= step ? "on" : ""} />)}</div>

        {step === 0 && <>
          <h1>Welcome to NicheRadar</h1>
          <p>Check whether a video topic is winnable for your channel before you make it, then publish it with metadata built from what already works.
            Setup takes about three minutes.</p>
          <ol className="steps-list">
            <li><span><b>Connect YouTube data.</b> A free API key from Google lets NicheRadar read public search results.</span></li>
            <li><span><b>Add your channel.</b> Scores are calibrated to channels your size.</span></li>
            <li><span><b>Optional extras.</b> YouTube Analytics and AI suggestions can be added later in Settings.</span></li>
          </ol>
          <div className="foot">
            <button className="btn ghost" onClick={() => finish()}>Explore with sample data</button>
            <button className="btn primary" onClick={() => setStep(isDesktop ? 1 : 2)}>Get started</button>
          </div>
        </>}

        {step === 1 && <>
          <h1>Connect YouTube data</h1>
          <p>NicheRadar uses your own YouTube Data API key. The free quota covers about 95 topic analyses a day.</p>
          <ol className="steps-list" style={{ marginBottom: 16 }}>
            <li><span>Create a project in {LINK("https://console.cloud.google.com/projectcreate", "Google Cloud Console")}.</span></li>
            <li><span>Enable {LINK("https://console.cloud.google.com/apis/library/youtube.googleapis.com", "YouTube Data API v3")}.</span></li>
            <li><span>Under {LINK("https://console.cloud.google.com/apis/credentials", "Credentials")}, choose Create credentials → API key.</span></li>
          </ol>
          <label className="field">API key<input className="input" type="password" autoFocus value={key} onChange={(e) => setKey(e.target.value)} placeholder="AIza…" /></label>
          <p className="small muted" style={{ margin: "8px 0 0" }}>Stored on this computer and encrypted with your Windows account.</p>
          <div className="foot">
            <button className="btn ghost" onClick={() => setStep(2)}>Skip for now</button>
            <button className="btn primary" disabled={busy} onClick={saveKey}>{busy ? "Verifying…" : "Verify and continue"}</button>
          </div>
        </>}

        {step === 2 && <>
          <h1>Add your channel</h1>
          <p>Your subscriber count sets what counts as a small channel, so the score reflects competition you can realistically beat.</p>
          <label className="field">Channel<input className="input" autoFocus value={channel} onChange={(e) => setChannel(e.target.value)} placeholder="@handle or channel URL" /></label>
          <div className="foot">
            <button className="btn ghost" onClick={() => finish()}>Skip</button>
            <button className="btn primary" disabled={busy} onClick={saveChannel}>{busy ? "Connecting…" : "Finish setup"}</button>
          </div>
        </>}
      </div>
    </div>
  );
}
