/**
 * Google sign-in for YouTube Analytics: a one-shot loopback server on 127.0.0.1.
 * Google blocks sign-in inside embedded browser windows, so the consent page opens in
 * the user's real browser and redirects back here.
 */

import http from "node:http";
import type { AddressInfo } from "node:net";
import type { Analytics } from "../core/analytics";

const page = (title: string, body: string) => `<!doctype html><html><head><meta charset="utf-8"><title>${title} - NicheRadar</title>
<style>body{font:16px/1.5 'Segoe UI',system-ui,sans-serif;background:#0b0d12;color:#eceef3;display:grid;place-items:center;min-height:100vh;margin:0}
main{max-width:460px;padding:32px;border:1px solid #242a38;border-radius:16px;background:#12151c;text-align:center}h1{margin:0 0 10px;font-size:22px}p{color:#a7adbb}</style>
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
    const timer = setTimeout(() => { server.close(); reject(new Error("Sign-in timed out. Click Connect to try again.")); }, timeoutMs);
    server.on("request", async (req, res) => {
      const u = new URL(req.url ?? "/", redirect);
      if (u.pathname !== "/callback") { res.writeHead(404).end(); return; }
      const error = u.searchParams.get("error");
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      try {
        if (error) throw new Error(`Google returned: ${error}. You can close this tab and try again from NicheRadar.`);
        const info = await analytics.finish(u.searchParams.get("state") ?? "", u.searchParams.get("code") ?? "");
        res.end(page("Connected!", `YouTube Analytics for <b>${esc(info.title)}</b> is connected. You can close this tab and go back to NicheRadar.`));
        resolve(info);
      } catch (e: any) {
        res.end(page("Couldn't connect", esc(e?.message ?? String(e))));
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
