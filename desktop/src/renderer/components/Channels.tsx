/** Channel profiles in the UI: the switcher dialog and the Settings group. Desktop only. */

import { useEffect, useState } from "react";
import { type ProfileList, profiles } from "../api";
import { Button, Dialog, SettingRow, SettingsGroup, Status } from "./kit";
import { useApp } from "./ui";

type ModalFn = ReturnType<typeof useApp>["modal"];

export function switchChannelDialog(modal: ModalFn) { modal((close) => <SwitchChannel close={close} />); }

function SwitchChannel({ close }: { close(): void }) {
  const { fail } = useApp();
  const [data, setData] = useState<ProfileList | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  useEffect(() => { profiles.run("list").then(setData).catch(fail); }, [fail]);
  const go = async (id: string) => { if (id === data?.active) return close(); try { await profiles.run("switch", id); } catch (e) { fail(e, "The channel wasn’t switched"); } };
  const create = async () => { try { await profiles.run("create", name); } catch (e) { fail(e, "The channel wasn’t added"); } };
  return (
    <Dialog title="Switch channel" desc="Each channel keeps its own Analytics sign-in, reports, watchlist, ideas and plans. API keys are shared."
      footer={adding
        ? <><Button onClick={() => setAdding(false)}>Back</Button><Button variant="primary" onClick={create}>Add and switch</Button></>
        : <><Button href="#/settings?s=profiles" onClick={close}>Manage in Settings</Button><Button variant="primary" icon="plus" onClick={() => setAdding(true)}>Add another channel…</Button></>}>
      {adding ? (
        <label className="field">Name<input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Such as VibePhiles"
          onKeyDown={(e) => { if (e.key === "Enter") create(); }} /></label>
      ) : !data ? null : (
        <div className="list" style={{ margin: "0 calc(-1 * var(--s4))" }}>
          {data.list.map((p) => (
            <div key={p.id} className="list-row clickable" role="button" tabIndex={0} aria-selected={p.id === data.active}
              onClick={() => go(p.id)} onKeyDown={(e) => { if (e.key === "Enter") go(p.id); }}>
              <span className="avatar">{p.name.charAt(0).toUpperCase()}</span>
              <div className="body"><div className="title">{p.name}</div></div>
              {p.id === data.active && <Status tone="ok">Current</Status>}
            </div>
          ))}
        </div>
      )}
    </Dialog>
  );
}

/** Settings group: rename, switch, add and remove channel profiles. */
export function ChannelsGroup() {
  const { fail, modal, toast } = useApp();
  const [data, setData] = useState<ProfileList | null>(null);
  useEffect(() => { profiles.run("list").then(setData).catch(() => undefined); }, []);
  if (!profiles.supported || !data) return null;
  const rename = async (id: string, name: string) => { try { setData(await profiles.run("rename", id, name)); toast("Channel renamed"); } catch (e) { fail(e); } };
  const remove = (id: string, name: string) => modal((close) => (
    <Dialog title={`Remove ${name}?`} desc="Its reports, watchlist, ideas, plans and Analytics sign-in are deleted from this computer. Your YouTube channel isn’t affected. This can’t be undone."
      footer={<><Button onClick={close}>Cancel</Button><Button variant="danger" onClick={async () => { close(); try { setData(await profiles.run("remove", id)); toast("Channel removed", "ok", name); } catch (e) { fail(e); } }}>Remove channel</Button></>} />
  ));
  return (
    <SettingsGroup id="s-profiles" title="Channels" desc="Run more than one channel? Each gets its own Analytics sign-in, “your channel” setting, reports, watchlist, ideas and plans. API keys, app IDs and the daily quota are shared.">
      {data.list.map((p) => (
        <SettingRow key={p.id} title={p.id === data.active ? <>{p.name} <span style={{ marginLeft: 6 }}><Status tone="ok">Current</Status></span></> : p.name} >
          <input className="input" defaultValue={p.name} aria-label={`Name of ${p.name}`} onBlur={(e) => { if (e.target.value.trim() && e.target.value !== p.name) rename(p.id, e.target.value); }} />
          {p.id !== data.active && <Button size="sm" onClick={() => profiles.run("switch", p.id).catch((e) => fail(e))}>Switch</Button>}
          {p.id !== "main" && <Button size="sm" variant="ghost" className="danger" onClick={() => remove(p.id, p.name)}>Remove…</Button>}
        </SettingRow>
      ))}
      <div className="setting-row actions-row"><Button icon="plus" onClick={() => switchChannelDialog(modal)}>Add another channel…</Button></div>
    </SettingsGroup>
  );
}
