/** Upload optimizer tabs: thumbnail preview, description templates per series, and the Test & Compare log. */

import { useEffect, useState } from "react";
import type { Template, TestEntry, TestInsight, ThumbContext } from "../../core/uploads";
import { call } from "../api";
import { Button, Card, Dialog, Segmented, Switch, Tag } from "../components/kit";
import { Empty, useApp } from "../components/ui";
import { fmt, fmtAge, store } from "../format";

// ---------------------------------------------------------- thumbnail preview
interface MockVideo { title: string; channel: string; thumbnail: string; views: number; age_days: number; mine?: boolean }

function MockThumb({ v, w, gray, ratio = "16 / 9" }: { v: MockVideo; w: number; gray?: boolean; ratio?: string }) {
  return (
    <div className={`mock-thumb ${v.mine ? "mine" : ""}`} style={{ width: w, aspectRatio: ratio, filter: gray ? "grayscale(1)" : undefined }}>
      {v.thumbnail ? <img src={v.thumbnail} alt="" /> : <span>{v.channel.slice(0, 2).toUpperCase()}</span>}
    </div>
  );
}

const meta = (v: MockVideo) => `${fmt(v.views)} views · ${v.age_days < 1 ? "just now" : `${fmtAge(v.age_days)} ago`}`;

export function ThumbnailTab({ draftTitle, keyword }: { draftTitle: string; keyword: string }) {
  const { status, toast } = useApp();
  const [img, setImg] = useState<string>("");
  const [title, setTitle] = useState(draftTitle || "Your video title goes here");
  const [scheme, setScheme] = useState<"light" | "dark">("dark");
  const [gray, setGray] = useState(false);
  const [ctx, setCtx] = useState<ThumbContext | null>(null);
  useEffect(() => { if (keyword.trim()) call("thumbnailContext", keyword).then(setCtx).catch(() => undefined); }, [keyword]);
  const load = (file?: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast("Choose an image file", "info", "PNG, JPG or WebP, ideally 1280 × 720."); return; }
    const r = new FileReader();
    r.onload = () => setImg(String(r.result));
    r.readAsDataURL(file);
  };
  const mine: MockVideo = { title, channel: status?.my_channel?.title ?? "Your channel", thumbnail: img, views: 1200, age_days: 0.5, mine: true };
  const others: MockVideo[] = (ctx?.videos ?? []).map((v) => ({ ...v }));
  const search = others.length ? [others[0], mine, ...others.slice(1, 4)] : [mine];
  const side = others.length ? [others[0], others[1], mine, ...others.slice(2, 5)].filter(Boolean) : [mine];

  return (
    <>
      <Card className="mb">
        <div className="row">
          <label className="btn" style={{ cursor: "pointer" }}>
            <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => load(e.target.files?.[0])} />Choose thumbnail…
          </label>
          <input className="input grow" style={{ minWidth: 220 }} value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Title shown in the preview" />
          <Segmented label="Theme" value={scheme} onChange={setScheme} options={[["dark", "Dark"], ["light", "Light"]]} />
          <label className="row secondary" style={{ gap: 8 }}><Switch label="Grayscale" checked={gray} onChange={setGray} />Grayscale</label>
        </div>
        <p className="secondary" style={{ margin: "8px 0 0" }}>
          The image stays on this computer. {ctx ? `Shown next to the videos that rank for “${ctx.keyword}”.` : "Analyze the draft’s keyword to see it next to the videos that rank."} Grayscale checks contrast: if the subject still stands out, the thumbnail reads well at any size.
        </p>
      </Card>
      <div className={`mock mock-${scheme}`} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); load(e.dataTransfer.files?.[0]); }}>
        {!img && <div className="mock-drop">Drop an image here, or choose one above</div>}
        <div className="mock-section">
          <span className="mock-label">Home feed</span>
          <div className="mock-home">
            {[mine, ...others.slice(0, 2)].map((v, i) => (
              <div key={i} className="mock-card">
                <MockThumb v={v} w={320} gray={gray} />
                <div className="mock-row"><span className="mock-avatar" /><div><div className="mock-title">{v.title}</div><div className="mock-meta">{v.channel}</div><div className="mock-meta">{meta(v)}</div></div></div>
              </div>
            ))}
          </div>
        </div>
        <div className="mock-split">
          <div className="mock-section grow">
            <span className="mock-label">Search results</span>
            {search.map((v, i) => (
              <div key={i} className="mock-search">
                <MockThumb v={v} w={300} gray={gray} />
                <div style={{ minWidth: 0 }}><div className="mock-title lg">{v.title}</div><div className="mock-meta">{meta(v)}</div><div className="mock-meta mock-chan"><span className="mock-avatar sm" />{v.channel}</div></div>
              </div>
            ))}
          </div>
          <div className="mock-section" style={{ width: 380 }}>
            <span className="mock-label">Up next</span>
            {side.map((v, i) => (
              <div key={i} className="mock-side">
                <MockThumb v={v} w={168} gray={gray} />
                <div style={{ minWidth: 0 }}><div className="mock-title sm">{v.title}</div><div className="mock-meta">{v.channel}</div><div className="mock-meta">{meta(v)}</div></div>
              </div>
            ))}
            <span className="mock-label" style={{ marginTop: 20 }}>Smallest size</span>
            <div className="row" style={{ alignItems: "flex-end" }}>
              <MockThumb v={mine} w={120} gray={gray} />
              <MockThumb v={mine} w={64} gray={gray} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ templates
const BLANK: Partial<Template> = { name: "", description: "", tags: "", hashtags: "", pinned: "" };

export function TemplatesTab({ onUse }: { onUse(t: Template): void }) {
  const { fail, toast, modal } = useApp();
  const [list, setList] = useState<Template[]>([]);
  const [edit, setEdit] = useState<Partial<Template>>(BLANK);
  useEffect(() => { call("listTemplates").then((l) => { setList(l); if (l[0]) setEdit(l[0]); }).catch(fail); }, []); // eslint-disable-line
  const set = (k: keyof Template) => (e: { target: { value: string } }) => { const v = e.target.value; setEdit((p) => ({ ...p, [k]: v })); };
  const save = async () => {
    try { const l = await call("saveTemplate", edit as Template); setList(l); setEdit(l.find((t) => t.name === edit.name?.trim()) ?? l[l.length - 1]); toast("Template saved"); }
    catch (e) { fail(e, "The template wasn’t saved"); }
  };
  const remove = () => modal((close) => (
    <Dialog title="Delete this template?" desc={`“${edit.name}” will be removed. Drafts that used it keep their text.`}
      footer={<><Button onClick={close}>Cancel</Button><Button variant="danger" onClick={async () => { close(); try { const l = await call("deleteTemplate", edit.id!); setList(l); setEdit(l[0] ?? BLANK); } catch (e) { fail(e); } }}>Delete template</Button></>} />
  ));
  return (
    <div className="grid g-report-rev">
      <Card flush title="Templates" sub="One per series keeps descriptions, tags and pinned comments consistent." actions={<Button size="sm" icon="plus" onClick={() => setEdit(BLANK)}>New</Button>}>
        {list.length ? (
          <div className="list">
            {list.map((t) => (
              <div key={t.id} className="list-row clickable" role="button" tabIndex={0} aria-selected={edit.id === t.id} onClick={() => setEdit(t)} onKeyDown={(e) => { if (e.key === "Enter") setEdit(t); }}>
                <div className="body"><div className="title">{t.name}</div><div className="secondary">{[t.tags.split(",").filter(Boolean).length ? `${t.tags.split(",").filter(Boolean).length} tags` : "", t.hashtags ? t.hashtags : ""].filter(Boolean).join(" · ") || "Description only"}</div></div>
              </div>
            ))}
          </div>
        ) : <p className="secondary" style={{ margin: 0, padding: 14 }}>No templates yet. Create one for each series, such as “Retro game bugs”.</p>}
      </Card>
      <Card title={edit.id ? "Edit template" : "New template"}>
        <form className="stack" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <label className="field">Name<input className="input" value={edit.name ?? ""} onChange={set("name")} placeholder="Retro game bugs" required /></label>
          <label className="field"><span>Description <span className="hint">{"{title}"} and {"{keyword}"} are filled in from the draft</span></span>
            <textarea className="input" rows={8} value={edit.description ?? ""} onChange={set("description")} placeholder={"More strange stories from classic games: {keyword}.\n\nSources: …\nMusic: …"} /></label>
          <div className="form-row">
            <label className="field">Tags<input className="input" value={edit.tags ?? ""} onChange={set("tags")} placeholder="retro games, game history" /></label>
            <label className="field">Hashtags<input className="input" value={edit.hashtags ?? ""} onChange={set("hashtags")} placeholder="#retrogaming #gaminghistory" /></label>
          </div>
          <label className="field">Pinned comment<textarea className="input" rows={3} value={edit.pinned ?? ""} onChange={set("pinned")} placeholder="Which game should I cover next?" /></label>
          <div className="row">
            <Button type="submit" variant="primary">Save template</Button>
            {edit.id && <Button onClick={() => onUse(edit as Template)}>Use in draft</Button>}
            {edit.id && <Button variant="ghost" className="danger" style={{ marginLeft: "auto" }} onClick={remove}>Delete…</Button>}
          </div>
        </form>
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------- test log
const LETTERS = ["A", "B", "C"];

export function TestLogTab({ draftTitle }: { draftTitle: string }) {
  const { fail, toast } = useApp();
  const [data, setData] = useState<{ tests: TestEntry[]; insights: TestInsight[] } | null>(null);
  const blank = () => ({ date: new Date().toISOString().slice(0, 10), video: "", kind: "title" as TestEntry["kind"], options: [draftTitle, "", ""], winner: 0, share: "", notes: "" });
  const [f, setF] = useState(blank);
  useEffect(() => { call("listTests").then(setData).catch(fail); }, []); // eslint-disable-line
  const save = async () => {
    try { setData(await call("saveTest", { ...f, options: f.options.filter((o) => o.trim()) })); setF(blank()); toast("Test logged"); }
    catch (e) { fail(e, "The test wasn’t logged"); }
  };
  const remove = async (id: string) => { try { setData(await call("deleteTest", id)); } catch (e) { fail(e); } };
  const filled = f.options.filter((o) => o.trim()).length;
  return (
    <>
      <div className="grid g-report">
        <Card title="Log a test" sub="After YouTube’s Test & Compare finishes, note what you tested and which version won. Studio shows it under the video’s Details.">
          <form className="stack" onSubmit={(e) => { e.preventDefault(); save(); }}>
            <div className="form-row">
              <label className="field">Video<input className="input" value={f.video} onChange={(e) => setF({ ...f, video: e.target.value })} placeholder="Which video" /></label>
              <label className="field">Finished on<input className="input" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></label>
            </div>
            <div><Segmented label="What was tested" value={f.kind} onChange={(k) => setF({ ...f, kind: k })} options={[["title", "Titles"], ["thumbnail", "Thumbnails"], ["both", "Both"]]} /></div>
            {f.options.map((o, i) => (
              <div key={i} className="row nowrap">
                <label className="row nowrap" style={{ gap: 6 }} title="Winner"><input type="radio" name="winner" checked={f.winner === i} onChange={() => setF({ ...f, winner: i })} aria-label={`Version ${LETTERS[i]} won`} /><b>{LETTERS[i]}</b></label>
                <input className="input grow" value={o} onChange={(e) => { const v = e.target.value; setF((p) => ({ ...p, options: p.options.map((x, j) => (j === i ? v : x)) })); }}
                  placeholder={f.kind === "thumbnail" ? `Thumbnail ${LETTERS[i]}: what it showed` : `Title ${LETTERS[i]}${i === 2 ? " (optional)" : ""}`} aria-label={`Version ${LETTERS[i]}`} />
              </div>
            ))}
            <label className="row secondary" style={{ gap: 6 }}><input type="radio" name="winner" checked={f.winner === -1} onChange={() => setF({ ...f, winner: -1 })} />No clear winner</label>
            <div className="form-row">
              <label className="field">Winner’s watch time share<input className="input" value={f.share} onChange={(e) => setF({ ...f, share: e.target.value })} placeholder="e.g. 54%" /></label>
              <label className="field">Notes<input className="input" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="What you think made the difference" /></label>
            </div>
            <div><Button type="submit" variant="primary" disabled={filled < 2}>Log test</Button></div>
          </form>
        </Card>
        <Card title="What wins for your audience" sub="Title styles on the winning title, in tests where only some versions used them.">
          {data?.insights.length ? (
            <div className="stack tight">
              {data.insights.map((x) => (
                <div key={x.label}>
                  <div className="row between small mb-sm"><span className="t2">{x.label.charAt(0).toUpperCase() + x.label.slice(1)}</span><span className="muted tabular">won {x.wins} of {x.tests}</span></div>
                  <div className="meter"><i className={x.wins / x.tests >= 0.6 ? "ok" : x.wins / x.tests <= 0.4 ? "warn" : undefined} style={{ width: `${(x.wins / x.tests) * 100}%` }} /></div>
                </div>
              ))}
              <p className="secondary" style={{ margin: "4px 0 0" }}>A few tests aren’t proof. Patterns that hold over 5 or more tests are worth following.</p>
            </div>
          ) : <p className="secondary" style={{ margin: 0 }}>Log a few title tests to see which styles win for you: numbers, questions, first person, a warning and more.</p>}
        </Card>
      </div>
      <Card flush className="mt" title="Tests" sub={data ? `${data.tests.length} logged` : undefined}>
        {data?.tests.length ? (
          <div className="list">
            {data.tests.map((t) => (
              <div key={t.id} className="list-row">
                <div className="body">
                  <div className="title">{t.video || "Untitled video"} <span className="muted" style={{ fontWeight: 400 }}>· {new Date(t.date + "T12:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</span></div>
                  {t.options.map((o, i) => <div key={i} className="secondary" style={{ whiteSpace: "normal" }}>{i === t.winner ? <Tag tone="ok">Won{t.share ? ` · ${t.share}` : ""}</Tag> : <b>{LETTERS[i]}</b>} {o}</div>)}
                  {t.notes && <div className="secondary" style={{ whiteSpace: "normal" }}>{t.notes}</div>}
                </div>
                <div className="end"><Tag>{t.kind === "both" ? "Title and thumbnail" : t.kind === "title" ? "Title" : "Thumbnail"}</Tag><Button size="sm" variant="ghost" iconOnly icon="trash" label="Delete test" onClick={() => remove(t.id)} /></div>
              </div>
            ))}
          </div>
        ) : <Empty icon="flask" title="No tests logged yet">YouTube Studio can test up to three titles or thumbnails per video. Logging the results here shows what your audience prefers over time.</Empty>}
      </Card>
    </>
  );
}

