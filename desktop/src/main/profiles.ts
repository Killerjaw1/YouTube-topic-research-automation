/**
 * Channel profiles: one set of research, plans and Analytics per YouTube channel.
 *
 * The main profile keeps its data where it always was (the data folder itself), so existing installs need no
 * migration. Other profiles live in data/profiles/<id>/ and read shared things (API keys, app IDs, preferences,
 * the daily quota) from the main profile's store.
 */

import fs from "node:fs";
import path from "node:path";

export interface Profile { id: string; name: string; created: number }
interface Registry { active: string; list: Profile[] }

export const MAIN = "main";

export class Profiles {
  private file: string;
  private reg: Registry;

  constructor(private root: string) {
    this.file = path.join(root, "profiles.json");
    let reg: Registry | null = null;
    try { reg = JSON.parse(fs.readFileSync(this.file, "utf8")); } catch { /* first run */ }
    this.reg = reg && Array.isArray(reg.list) && reg.list.some((p) => p.id === MAIN) ? reg : { active: MAIN, list: [{ id: MAIN, name: "Main channel", created: Date.now() / 1000 }] };
    if (!this.reg.list.some((p) => p.id === this.reg.active)) this.reg.active = MAIN;
  }

  private save() {
    fs.mkdirSync(this.root, { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.reg, null, 2));
    fs.renameSync(tmp, this.file);
  }

  list() { return { active: this.reg.active, list: this.reg.list.map((p) => ({ ...p })) }; }
  get active(): string { return this.reg.active; }

  /** The data folder of a profile. */
  dir(id: string): string {
    if (id === MAIN) return this.root;
    if (!/^[a-z0-9]+$/.test(id)) throw new Error("bad profile id");
    return path.join(this.root, "profiles", id);
  }

  create(name: string): Profile {
    const clean = name.trim().slice(0, 60) || `Channel ${this.reg.list.length + 1}`;
    if (this.reg.list.length >= 10) throw new Error("You can have up to 10 channels.");
    const p: Profile = { id: Date.now().toString(36), name: clean, created: Date.now() / 1000 };
    fs.mkdirSync(this.dir(p.id), { recursive: true });
    this.reg.list.push(p);
    this.save();
    return p;
  }

  rename(id: string, name: string) {
    const p = this.reg.list.find((x) => x.id === id);
    if (!p || !name.trim()) return;
    p.name = name.trim().slice(0, 60);
    this.save();
  }

  setActive(id: string) {
    if (!this.reg.list.some((p) => p.id === id)) throw new Error("That channel profile no longer exists.");
    this.reg.active = id;
    this.save();
  }

  /** Deletes a profile and its data. The main profile can't be deleted. */
  remove(id: string) {
    if (id === MAIN) throw new Error("The main channel can’t be removed.");
    this.reg.list = this.reg.list.filter((p) => p.id !== id);
    if (this.reg.active === id) this.reg.active = MAIN;
    this.save();
    fs.rmSync(this.dir(id), { recursive: true, force: true });
  }
}
