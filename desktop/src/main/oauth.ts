/**
 * Google sign-in for YouTube Analytics: a one-shot loopback server on 127.0.0.1.
 * Google blocks sign-in inside embedded browser windows, so the consent page opens in
 * the user's real browser and redirects back here.
 */

import http from "node:http";
import type { AddressInfo } from "node:net";
import type { Analytics } from "../core/analytics";

const page = (title: string, body: string) => `<!doctype html><html><head><meta charset="utf-8"><title>${title} · NicheRadar</title>
<style>:root{--bg-app:#111214;--bg-raised:#17181b;--border:#222327;--text:#ececee;--text-2:#a3a3ab;--font:'Segoe UI Variable Text','Segoe UI',system-ui,sans-serif;--font-display:'Segoe UI Variable Display','Segoe UI',system-ui,sans-serif}
@media (prefers-color-scheme:light){:root{--bg-app:#f4f4f5;--bg-raised:#fff;--border:#e4e4e7;--text:#18181b;--text-2:#52525b}}
body{font:13px/1.5 var(--font);background:var(--bg-app);color:var(--text);display:grid;place-items:center;min-height:100vh;margin:0}
main{max-width:420px;padding:24px;border:1px solid var(--border);border-radius:8px;background:var(--bg-raised)}h1{margin:0 0 6px;font:600 22px/1.25 var(--font-display);letter-spacing:-.01em}p{margin:0;color:var(--text-2)}</style>
</head><body><main><h1>${title}</h1><p>${body}</p></main></body></html>`;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

let active: http.Server | null = null;

export async function signIn(analytics: Analytics, openExternal: (url: string) => Promise<void>, timeoutMs = 5 * 60 * 1000) {
  active?.close();
  const server = http.createServer();
  active = server;
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  const redirect = `http://127.0.0.1:${port}/callback`;
  const url = await analytics.authUrl(redirect);

  const result = new Promise<{ title: string }>((resolve, reject) => {
    const timer = setTimeout(() => { server.close(); reject(new Error("Sign-in took too long, so it was stopped. Choose Connect with Google to try again.")); }, timeoutMs);
    server.on("request", async (req, res) => {
      const u = new URL(req.url ?? "/", redirect);
      if (u.pathname !== "/callback") { res.writeHead(404).end(); return; }
      const error = u.searchParams.get("error");
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      try {
        if (error) throw new Error(`Google didn’t complete the sign-in (${error}). Close this tab and try again from NicheRadar.`);
        const info = await analytics.finish(u.searchParams.get("state") ?? "", u.searchParams.get("code") ?? "");
        res.end(page("YouTube Analytics connected", `YouTube Analytics for <b>${esc(info.title)}</b> is connected. You can close this tab and go back to NicheRadar.`));
        resolve(info);
      } catch (e: any) {
        res.end(page("YouTube Analytics isn’t connected", esc(e?.message ?? String(e))));
        reject(e);
      } finally {
        clearTimeout(timer);
        setTimeout(() => server.close(), 500);
      }
    });
  });
  await openExternal(url);
  return result;
}
