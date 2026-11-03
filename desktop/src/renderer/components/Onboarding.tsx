/** First-run setup: YouTube API key, then your channel. Can be skipped to explore with sample data. */

import { useState } from "react";
import { call, isDesktop } from "../api";
import { Button } from "./kit";
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
      toast("API key verified", "ok", "YouTube accepted the key.");
      setStep(2);
    } catch (e) { fail(e, "The API key couldn’t be verified"); } finally { setBusy(false); }
  };
  const saveChannel = async () => {
    if (!channel.trim()) return finish();
    setBusy(true);
    try { const c = await call("connectChannel", channel.trim()); toast("Channel added", "ok", c.title); await finish(); }
    catch (e) { fail(e, "The channel couldn’t be found"); } finally { setBusy(false); }
  };

  return (
    <div className="onboard">
      <div className="onboard-card">
        <img className="mark" src="./logo.svg" alt="" />
        <div className="onboard-steps" role="progressbar" aria-label="Setup progress" aria-valuemin={1} aria-valuemax={3} aria-valuenow={step + 1}>{[0, 1, 2].map((i) => <i key={i} className={i <= step ? "on" : ""} />)}</div>
        <span className="section-label" style={{ marginTop: 0 }}>Step {step + 1} of 3</span>

        {step === 0 && <>
          <h1>Welcome to NicheRadar</h1>
          <p>Check whether a video topic is winnable for your channel before you make it, then publish it with metadata built from what already works.
            Setup takes about three minutes.</p>
          <ol className="steps-list">
            <li><span><b>Connect YouTube data.</b> A free API key from Google lets NicheRadar read public search results.</span></li>
            <li><span><b>Add your channel.</b> Scores adapt to channels your size.</span></li>
            <li><span><b>Optional extras.</b> YouTube Analytics and AI suggestions can be added later in Settings.</span></li>
          </ol>
          <div className="onboard-foot">
            <Button variant="ghost" onClick={() => finish()}>Explore with sample data</Button>
            <Button variant="primary" autoFocus onClick={() => setStep(isDesktop ? 1 : 2)}>Get started</Button>
          </div>
        </>}

        {step === 1 && <>
          <h1>Connect YouTube data</h1>
          <p>NicheRadar uses your own YouTube Data API key. The free quota covers about 95 topic analyses a day.</p>
          <ol className="steps-list" style={{ marginBottom: 16 }}>
            <li><span>Create a project in {LINK("https://console.cloud.google.com/projectcreate", "Google Cloud Console")}.</span></li>
            <li><span>Turn on {LINK("https://console.cloud.google.com/apis/library/youtube.googleapis.com", "YouTube Data API v3")}.</span></li>
            <li><span>Under {LINK("https://console.cloud.google.com/apis/credentials", "Credentials")}, choose Create credentials, then API key.</span></li>
          </ol>
          <form onSubmit={(e) => { e.preventDefault(); saveKey(); }}>
            <label className="field">API key<input className="input" type="password" autoFocus autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder="AIza…" /></label>
            <p className="secondary" style={{ margin: "var(--s2) 0 0" }}>Stored on this computer and encrypted with your Windows account.</p>
            <div className="onboard-foot">
              <Button variant="ghost" onClick={() => setStep(2)}>Skip for now</Button>
              <Button type="submit" variant="primary" busy={busy}>{key.trim() ? "Verify and continue" : "Continue"}</Button>
            </div>
          </form>
        </>}

        {step === 2 && <>
          <h1>Add your channel</h1>
          <p>Your subscriber count sets what counts as a small channel, so the score reflects competition you can realistically beat.</p>
          <form onSubmit={(e) => { e.preventDefault(); saveChannel(); }}>
            <label className="field">Channel<input className="input" autoFocus value={channel} onChange={(e) => setChannel(e.target.value)} placeholder="@handle or channel URL" /></label>
            <div className="onboard-foot">
              <Button variant="ghost" onClick={() => finish()}>Skip</Button>
              <Button type="submit" variant="primary" busy={busy}>Finish setup</Button>
            </div>
          </form>
        </>}
      </div>
    </div>
  );
}
