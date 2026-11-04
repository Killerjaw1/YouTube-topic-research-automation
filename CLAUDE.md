# NicheRadar: notes for Claude Code

NicheRadar is a Windows desktop app (Electron + React + TypeScript) for YouTube topic research. It scores whether a
small channel can win a topic, finds ideas, plans uploads, and reads the owner's YouTube Analytics. The owner runs
Shorts explainer channels (Topic 96, VibePhiles). README.md describes every feature for users; this file is for
working on the code.

## Commands (run in `desktop/`)

| Command | What it does |
|---|---|
| `npm ci` | Install dependencies (Node 22) |
| `npm run dev` | Desktop app with hot reload |
| `npm run web` | Browser preview on sample data at http://127.0.0.1:5173 (no keys needed) |
| `npm run typecheck` | TypeScript check. Must pass before every commit |
| `npm run selftest` | Engine tests (`scripts/selftest.ts`). Must pass before every commit |
| `npm run build` | Build renderer (Vite) and main process (esbuild) into `dist/` |
| `npm run dist` | Windows installer into `dist-installer/` (needs Windows) |
| `npm run icon` | Redraw `build/icon.png` and `.ico` from the logo (needs Python + Pillow) |

## Layout

- `desktop/src/core/`: the engine. Pure TypeScript, no Electron. Runs in the main process (desktop) and in the
  browser (web preview, sample data).
  - `engine.ts`: the `Engine` class, the only API the UI uses. **`ENGINE_METHODS` at the bottom is an allowlist:
    a new public method must be added there or the UI can't call it.**
  - `scoring.ts` opportunity score; `optimize.ts` playbook and draft checks; `analytics.ts` YouTube Analytics
    (OAuth, reports, insights, sample data); `series.ts` series and openings; `growth.ts` Partner Program, best
    length, subscriber drivers, edit notes; `ideas.ts` viewer questions, Wikipedia On this day / rising, already-made;
    `competitors.ts`; `planner.ts` rhythm, weekday, goals, weekly summary, early hits; `uploads.ts` templates and
    Test & Compare log; `prompts.ts` Claude prompts (API and Copy for Claude.ai); `sources.ts` search suggestions
    and Reddit; `youtube.ts` Data API client with quota accounting and cache; `demo.ts` sample data;
    `store.ts` storage (JSON files; `getDoc`/`setDoc` for small documents; shared store for channel profiles).
- `desktop/src/main/`: Electron main process. `main.ts` window, IPC, file dialogs, PDF export, tray and
  Ctrl+Shift+N, background checks (weekly watchlist, Monday summary, early hits), channel profile switching;
  `profiles.ts` channel profiles; `oauth.ts` Google sign-in (PKCE, loopback); `ai.ts` Anthropic API;
  `updates.ts` auto-update from GitHub Releases; `persist.ts` file storage and safeStorage encryption; `preload.ts`.
- `desktop/src/renderer/`: React UI. `App.tsx` shell, sidebar, routes (`PAGES`); `api.ts` bridge to the engine
  (IPC in the app, a local engine in the browser); `components/kit.tsx` design-system components;
  `components/ui.tsx` app context (toast, modal, panel) and shared pieces; `pages/*` one file per screen;
  `styles.css` all styling.
- `.github/workflows/build.yml`: tests on Linux, installer on Windows; a `v*` tag attaches the installer and
  `latest.yml` to the GitHub release (that's what auto-update reads).

## How things work (read before changing)

- **Data**: `%APPDATA%\NicheRadar\data`. The main channel profile uses that folder; other profiles use
  `data/profiles/<id>/`. A profile's Store reads shared things from the main Store: `SHARED_SECRETS` (API keys,
  Google client secret) and `SHARED_SETTINGS` (app IDs, region, language, quota, ...) in `store.ts`, plus the daily
  quota ledger. Google sign-in tokens and everything else are per profile.
- **Secrets** are encrypted with Windows DPAPI (`safeStorage`) and never sent to the UI (only masked hints).
- **Sample data**: without a YouTube key (or with sample data on), the engine uses `DemoYouTube` and sample
  Analytics. Every new feature needs a sample-data path so `npm run web` shows it.
- **Quota**: YouTube Data API costs are in `COSTS` in `youtube.ts`; say the cost in the UI when it's more than a
  few units.
- **Routing**: hash routes (`#/page?params`). Pages are remounted only on navigation (the `visit` key in
  `App.tsx`), so pages may use `history.replaceState` to save state in the address.
- **Forms**: update state with functional updates (`setF((p) => ({ ...p, [k]: v }))`), never `{ ...form, ... }` from a
  closure, or one field can wipe another. Number inputs use `step="any"`.
- **Shorts** are detected as 60 s or less, or up to 3 min with #shorts (`classifyFormat` in `scoring.ts`).
- **Untested against live services** (blocked in the cloud sandbox where they were built): Reddit, Wikipedia,
  Windows notifications, comments for viewer questions. If one misbehaves, check the real response and adjust
  the parser in `sources.ts` / `ideas.ts`.

## Design and writing rules

- Every colour, font, size and radius is a CSS token on `:root` in `styles.css` (light theme under
  `:root[data-theme="light"]`). No hard-coded colours in components.
- Build UI from `components/kit.tsx`: `Button`, `Card`, `Status` (dot + word), `Tag`, `StateCard`, `Banner`,
  `EmptyState`, `Dialog`, `DetailPanel`, `Switch`, `Segmented`, `Chip`, `Menu`, `SettingsGroup`/`SettingRow`,
  `ListRow`, `Facts`. Icons: `Icon` with Phosphor names mapped in `components/Icon.tsx`.
- Layout: page head (h1, one sentence, actions right, one primary). Settings pages are narrow. Selecting a row
  opens the detail panel on the right. Check dark, light and phone width (390 px).
- Writing: plain, calm, sentence case, curly apostrophes and quotes (’ “ ”). Buttons are verbs, with "…" when
  another step follows. Errors say what happened and what to do; never blame. No exclamation marks, never
  "successfully". Relative times via `ago()` in `format.ts`.

## Workflow

1. Make the change in `core/` first (with a test in `scripts/selftest.ts`), then the UI.
2. `npm run typecheck` and `npm run selftest` must pass.
3. Look at it: `npm run web` for the browser preview, `npm run dev` for the desktop app.
4. Commit with a clear message describing what changed for the user.

## Releasing an update (so installed copies update themselves)

1. Bump the version in three places: `desktop/package.json`, the two top `"version"` lines of
   `desktop/package-lock.json`, and `VERSION` in `desktop/src/core/engine.ts`.
2. Commit and push. Wait for the Build workflow to pass on GitHub.
3. Publish a release on GitHub: Releases → Draft a new release → tag `vX.Y.Z` (new tag) targeting the branch you
   pushed → Publish. Or from a terminal: `git tag vX.Y.Z` then `git push origin vX.Y.Z`.
4. A few minutes later the release has `NicheRadar-Setup-X.Y.Z.exe` and `latest.yml`, and the app offers the
   update under Settings → Updates.
