import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

/** Strict Content-Security-Policy for the packaged app (dev needs inline scripts for hot reload). */
function csp(): Plugin {
  return {
    name: "nicheradar-csp",
    apply: "build",
    transformIndexHtml(html) {
      const policy = [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https://i.ytimg.com https://yt3.ggpht.com https://*.googleusercontent.com",
        "connect-src 'self'",
        "font-src 'self'",
        "object-src 'none'",
        "base-uri 'none'",
      ].join("; ");
      return html.replace("<head>", `<head>\n    <meta http-equiv="Content-Security-Policy" content="${policy}">`);
    },
  };
}

export default defineConfig(({ mode }) => ({
  root: "src/renderer",
  base: "./",
  plugins: [react(), csp()],
  define: { __WEB_DEMO__: JSON.stringify(mode === "web") },
  server: { port: mode === "web" ? 5180 : 5173, strictPort: false },
  build: { outDir: "../../dist/renderer", emptyOutDir: true, target: "chrome130" },
}));
