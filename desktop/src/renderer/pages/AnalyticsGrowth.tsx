/** Analytics tabs: Audience (searches that found you, who watches) and Growth (Partner Program progress). */

import { useEffect, useState } from "react";
import type { AudienceReport, GrowthReport, Requirement, SearchTermsReport, TierProgress } from "../../core/growth";
import type { Focus } from "../../core/types";
import { call } from "../api";
import { Button, Card, Status, Tag } from "../components/kit";
import { analyzeLink, Empty, Loading } from "../components/ui";
import { fmt, store } from "../format";

const regionName = (() => {
  try { const d = new Intl.DisplayNames(["en"], { type: "region" }); return (c: string) => d.of(c) ?? c; } catch { return (c: string) => c; }
})();
const DEVICE: Record<string, string> = { MOBILE: "Phone", DESKTOP: "Computer", TV: "TV", TABLET: "Tablet", GAME_CONSOLE: "Game console", UNKNOWN_PLATFORM: "Other" };
const GENDER: Record<string, string> = { male: "Male", female: "Female", user_specified: "Self-described" };

function Bars({ rows }: { rows: { label: string; share: number; note?: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.share));
  return (
    <div className="stack tight">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="row between small mb-sm"><span className="t2">{r.label}</span><span className="muted tabular">{r.note ? `${r.note} · ` : ""}{r.share}%</span></div>
          <div className="meter"><i style={{ width: `${(r.share / max) * 100}%` }} /></div>
        </div>
      ))}
    </div>
  );
}

function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { setData(null); setError(""); load().then(setData).catch((e) => setError(e.message)); }, deps); // eslint-disable-line
  return { data, error };
}

export function AudienceTab({ days, demo }: { days: number; demo: boolean }) {
  const terms = useLoad<SearchTermsReport>(() => call("analyticsSearchTerms", days, demo), [days, demo]);
  const aud = useLoad<AudienceReport>(() => call("analyticsAudience", days, demo), [days, demo]);
  const focus = store<Focus>("focus") ?? "all";
  return (
    <>
      <div className="grid g-report">
        <Card flush title="Searches that found you" sub="What viewers typed into YouTube search before watching your videos. Each one is a proven topic for you.">
          {terms.error ? <p className="t2" style={{ margin: 0, padding: "0 14px 14px" }}>{terms.error}</p>
            : !terms.data ? <div style={{ padding: 14 }}><Loading title="Loading search terms" rows={4} /></div>
            : terms.data.terms.length ? (
              <div className="list">
                {terms.data.terms.map((t) => (
                  <div key={t.term} className="list-row">
                    <div className="body"><div className="title">{t.term}</div>
                      <div className="secondary">{fmt(t.views)} views · {Math.round((t.views / Math.max(1, terms.data!.total)) * 100)}% of search views</div></div>
                    <div className="end">
                      <Button size="sm" variant="ghost" href={`#/discover?seed=${encodeURIComponent(t.term)}&mode=questions`}>Related</Button>
                      <Button size="sm" href={analyzeLink(t.term, undefined, focus)}>Analyze</Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : <Empty icon="search" title="No search views in this period">Search views take time for new videos. Try a longer period, or titles that match what people type.</Empty>}
        </Card>
        <Card title="Where viewers are" sub="Share of views by country.">
          {aud.error ? <p className="t2" style={{ margin: 0 }}>{aud.error}</p> : !aud.data ? <Loading title="Loading audience" rows={4} />
            : aud.data.countries.length ? <>
              <Bars rows={aud.data.countries.map((c) => ({ label: regionName(c.code), share: c.share, note: `${fmt(c.views)} views` }))} />
              <LanguageTip countries={aud.data.countries} />
            </> : <p className="secondary" style={{ margin: 0 }}>Not enough views yet. YouTube shows audience details once a channel has a few thousand views.</p>}
        </Card>
      </div>
      {aud.data && (aud.data.ages.length > 0 || aud.data.devices.length > 0) && (
        <div className="grid g3 mt">
          <Card title="Age">{aud.data.ages.length ? <Bars rows={aud.data.ages.map((a) => ({ label: a.age, share: a.share }))} /> : <p className="secondary" style={{ margin: 0 }}>Not available yet.</p>}</Card>
          <Card title="Gender">{aud.data.gender.length ? <Bars rows={aud.data.gender.map((g) => ({ label: GENDER[g.gender] ?? g.gender, share: g.share }))} /> : <p className="secondary" style={{ margin: 0 }}>Not available yet.</p>}</Card>
          <Card title="Device">{aud.data.devices.length ? <Bars rows={aud.data.devices.map((d) => ({ label: DEVICE[d.device] ?? d.device, share: d.share }))} /> : <p className="secondary" style={{ margin: 0 }}>Not available yet.</p>}</Card>
        </div>
      )}
    </>
  );
}

const ENGLISH = new Set(["US", "GB", "CA", "AU", "NZ", "IE"]);

/** When a good share of viewers is outside English-speaking countries, suggest translated titles. */
function LanguageTip({ countries }: { countries: AudienceReport["countries"] }) {
  const other = countries.filter((c) => !ENGLISH.has(c.code));
  const share = other.reduce((a, c) => a + c.share, 0);
  if (share < 20) return null;
  return (
    <p className="secondary" style={{ margin: "var(--s3) 0 0" }}>
      {Math.round(share)}% of your views come from {other.slice(0, 3).map((c) => regionName(c.code)).join(", ")} and other countries.
      Translated titles and descriptions can help those viewers find you. Use <b>Translate</b> in the Upload optimizer.
    </p>
  );
}

// ------------------------------------------------------------------ growth
const when = (days: number) => {
  const d = new Date(Date.now() + days * 86400000);
  return d.toLocaleDateString(undefined, { month: "long", day: "numeric", ...(d.getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}) });
};
const inDays = (days: number) => (days <= 1 ? "about a day" : days < 14 ? `about ${days} days` : days < 70 ? `about ${Math.round(days / 7)} weeks` : `about ${Math.round(days / 30)} months`);

function RequirementRow({ r, chosen }: { r: Requirement; chosen: boolean }) {
  const pct = Math.min(100, (r.current / r.target) * 100);
  const status = r.done ? <Status tone="ok">Done</Status>
    : r.eta_days != null ? <Status tone="accent">{inDays(r.eta_days)}</Status>
    : <Status tone="idle">Not at this pace</Status>;
  return (
    <div style={{ opacity: chosen ? 1 : 0.62 }}>
      <div className="row between small mb-sm"><span className="t2">{r.label}</span>
        <span className="row nowrap" style={{ gap: 10 }}><span className="tabular muted">{fmt(r.current)} of {fmt(r.target)}</span>{status}</span></div>
      <div className="meter"><i className={r.done ? "ok" : undefined} style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

function TierCard({ t }: { t: TierProgress }) {
  const either = t.requirements.filter((r) => r.id === "shorts" || r.id === "watch");
  const rest = t.requirements.filter((r) => r.id !== "shorts" && r.id !== "watch");
  return (
    <Card title={t.name} sub={t.perks} actions={t.done ? <Tag tone="ok">Eligible</Tag> : undefined}>
      <div className="stack">
        {rest.map((r) => <RequirementRow key={r.id} r={r} chosen />)}
        <div>
          <span className="section-label" style={{ marginTop: 0 }}>And one of these</span>
          <div className="stack tight">{either.map((r) => <RequirementRow key={r.id} r={r} chosen={t.path === null || t.path === r.id} />)}</div>
        </div>
        <p className="secondary" style={{ margin: 0 }}>{t.done ? "You meet these requirements. Apply in YouTube Studio, under Earn."
          : t.eta_days != null ? `At your pace over the last 28 days, you’d meet these in ${inDays(t.eta_days)}, around ${when(t.eta_days)}${t.path ? `, through ${t.path === "shorts" ? "Shorts views" : "watch hours"}` : ""}.`
          : "At your current pace you won’t reach these yet. More uploads and more views per video will change the estimate."}</p>
      </div>
    </Card>
  );
}

export function GrowthTab({ demo }: { demo: boolean }) {
  const g = useLoad<GrowthReport>(() => call("analyticsGrowth", demo), [demo]);
  if (g.error) return <Empty icon="warn" title="Progress couldn’t be loaded">{g.error}</Empty>;
  if (!g.data) return <Loading title="Checking your progress" rows={5} />;
  const i = g.data.input;
  return (
    <>
      <div className="kpis mb">
        <div className="kpi"><span className="label">Subscribers</span><div className="value">{fmt(i.subs)}</div><div className="secondary">{i.subsPerDay >= 0 ? "+" : "−"}{Math.abs(i.subsPerDay).toFixed(1)} a day lately</div></div>
        <div className="kpi"><span className="label">Shorts views, 90 days</span><div className="value">{fmt(i.shortsViews90)}</div><div className="secondary">{fmt(i.shortsViewsPerDay)} a day lately</div></div>
        <div className="kpi"><span className="label">Watch hours, 12 months</span><div className="value">{fmt(i.watchHours365)}</div><div className="secondary">Long videos only · {i.watchHoursPerDay.toFixed(1)} a day lately</div></div>
        <div className="kpi"><span className="label">Uploads, 90 days</span><div className="value">{i.uploads90}</div><div className="secondary">Public videos with views</div></div>
      </div>
      <div className="grid g2">{g.data.tiers.map((t) => <TierCard key={t.id} t={t} />)}</div>
      <p className="secondary mt">Requirements as YouTube published them. YouTube changes them from time to time and they vary by country, so check
        YouTube Studio, under Earn, for your official status. Estimates assume your last 28 days continue.</p>
    </>
  );
}
