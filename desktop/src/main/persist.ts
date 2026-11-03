/** Disk-backed storage for the desktop app: one JSON file per document, written atomically. */

import fs from "node:fs";
import path from "node:path";
import type { Cipher, Persist } from "../core/store";

export class FilePersist implements Persist {
  readonly location: string;

  constructor(location: string) {
    this.location = path.resolve(location);
    fs.mkdirSync(this.location, { recursive: true });
  }

  private file(name: string) {
    const p = path.resolve(this.location, ...name.split("/"));
    if (p !== this.location && !p.startsWith(this.location + path.sep)) throw new Error("bad path");
    return p;
  }

  read(name: string) {
    try { return fs.readFileSync(this.file(name), "utf8"); } catch { return undefined; }
  }

  write(name: string, text: string) {
    const p = this.file(name);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    const tmp = `${p}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, text);
    fs.renameSync(tmp, p);
  }

  remove(name: string) {
    fs.rmSync(this.file(name), { force: true });
  }

  list(prefix: string) {
    const dir = this.file(prefix.replace(/\/$/, ""));
    try { return fs.readdirSync(dir).map((f) => `${prefix.replace(/\/$/, "")}/${f}`); } catch { return []; }
  }
}

/** Encrypts secrets with the OS keychain (Windows DPAPI via Electron safeStorage) when available. */
export function osCipher(safeStorage: Electron.SafeStorage): Cipher {
  const ok = () => { try { return safeStorage.isEncryptionAvailable(); } catch { return false; } };
  return {
    encrypt(plain) {
      return ok() ? "enc:" + safeStorage.encryptString(plain).toString("base64") : "raw:" + plain;
    },
    decrypt(stored) {
      if (stored.startsWith("enc:")) return safeStorage.decryptString(Buffer.from(stored.slice(4), "base64"));
      return stored.startsWith("raw:") ? stored.slice(4) : stored;
    },
  };
}
