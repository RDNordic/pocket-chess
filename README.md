# Pocket Chess

Offline-first personal chess trainer. No accounts, no analytics, no
advertising and no application telemetry. Gameplay and engine processing
run locally in your browser.

**Licence:** [GPL-3.0-or-later](LICENSE). See
[LICENSES/THIRD-PARTY-NOTICES.md](LICENSES/THIRD-PARTY-NOTICES.md) for
third-party dependency licences, and the in-app About/Licences/Privacy
screen (see below) for a user-facing summary of both.

See pocket-chess-build-spec.md for the full specification and AGENTS.md /
CLAUDE.md for the current implementation status and working rules.

## Privacy

Pocket Chess is designed to collect as little information about you as
possible: no account or sign-in, no analytics, no advertising, no
profiling, and no application telemetry. Game data and settings are
intended to remain on your device unless you deliberately export them.
See build spec section 26 for the standing privacy invariant this project
holds itself to, and the list of future features (cloud sync, accounts,
multiplayer, crash reporting, telemetry, analytics, remote AI, PGN
uploads, social features) that each require a privacy review before
shipping.

Separately: when this application is served from a website, the hosting
provider necessarily receives ordinary technical request information -
such as IP address and HTTP request metadata - in order to deliver and
secure it, the same as any website. That is a normal part of how the web
works, is unrelated to this application's own code, and Pocket Chess
itself does not use that hosting request data for analytics, advertising,
behavioural profiling, or gameplay tracking, nor does it transmit
positions, games, moves, or playing behaviour to any analytics service.

## Local development

Requires **Node.js 22 or newer** (the minimum Wrangler itself requires -
see `engines.node` in `package.json`).

```bash
npm install
npm run dev
```

## Validation

Run all of these before considering a change done:

```bash
npm test
npm run lint
npm run build
npm run test:e2e
npm run test:engine
```

`test:engine` starts a real Stockfish Worker/WASM instance against
`src/engine/StockfishAdapter.ts` in an actual browser (see
`tests/engine-integration/`) - it needs the vendored engine files under
`public/engine/`, which are the app's only local (non-CDN) copy of
Stockfish.

## Cloudflare local development/preview

`npm run cf:dev` builds the app and serves the built `dist/` output through
Wrangler's local Cloudflare Workers runtime (the same static-asset serving
and SPA-fallback behaviour used in production), at
`http://localhost:8787` by default. It needs no Cloudflare login (it's a
local simulation, not a real deployment), so - like `cf:dry-run` below -
it runs fully workspace-scoped:

```bash
npm run cf:dev
```

## Cloudflare deployment

`npm run cf:deploy` builds the app and deploys `dist/` to Cloudflare Workers
Static Assets:

```bash
npm run cf:deploy
```

This requires a one-time, interactive Cloudflare login first (not something
this tooling can do on your behalf):

```bash
npx wrangler login
```

Response security headers (`Content-Security-Policy`, `Referrer-Policy`,
`X-Content-Type-Options`, `Permissions-Policy`) are set via
[`public/_headers`](public/_headers), Cloudflare Workers Static Assets'
supported `_headers`-file mechanism (the same convention Cloudflare Pages
uses) - copied into `dist/_headers` by the normal build like everything
else under `public/`. The CSP is derived from what this app's production
bundle, service worker, PWA manifest, and Stockfish Worker/WASM actually
need (verified against real build output and browser behaviour, not
assumed) - see CLAUDE.md/AGENTS.md before loosening it.

Cloudflare here is only a static file host for the already-built
`dist/` output (see `wrangler.jsonc`) - there is no Worker backend, no
database, and no server-side chess logic; all chess rules and game state
still run entirely in the browser via `chess.js`, exactly as in local
development. The initial deployment target is a `*.workers.dev` subdomain;
a custom domain is a separate, later, manual step.

**Privacy/telemetry:** `wrangler.jsonc` sets `send_metrics: false` and
`dependencies_instrumentation.enabled: false` at the repository level
(verified against the installed Wrangler's own config schema), so anyone
cloning this repo gets the same no-telemetry posture without needing any
machine-level Wrangler setting. `cf:dev` and `cf:dry-run` additionally set
`WRANGLER_SEND_METRICS=false` as an environment variable (Wrangler's own
highest-priority override) via the wrapper described below - verified
directly against a generated Wrangler debug log that this actually
suppresses telemetry rather than just being accepted as config: with
metrics disabled, Wrangler logs `Metrics dispatcher: Dispatching disabled
- would have sent ...` and returns before ever calling `fetch()`, so the
log contains no `Posting data` line (the one immediately preceding the
real network call) and no request is made.

**Workspace-scoped commands, without touching your user profile:**
`npm run cf:dev` and `npm run cf:dry-run` both run through
[scripts/wrangler-workspace.mjs](scripts/wrangler-workspace.mjs), which
redirects Wrangler's global config/metrics/log/dev-registry state into a
project-local, gitignored `.wrangler-workspace/` directory instead of your
OS profile (Wrangler otherwise writes there by default). Neither of these
commands needs a real Cloudflare login (`cf:dev` is a local simulation,
`cf:dry-run` performs no network deployment), so redirecting them is safe.
`cf:deploy` deliberately does *not* use this redirection: an actual
deployment needs Wrangler to find the OAuth token that a normal `wrangler
login` writes to that same standard global location, so keeping it on
Wrangler's normal behaviour is what lets `wrangler login` work normally
across all of your projects, not just this one.

## Deploying under a sub-path (e.g. GitHub Pages)

The app defaults to being hosted at the domain root (`/`). To deploy under a
repository sub-path such as `https://<account>.github.io/pocket-chess/`, set
`VITE_BASE_PATH` at build time - this is the single source of truth for
both Vite's asset base and the PWA manifest's `start_url`/`scope`:

```bash
# bash / macOS / Linux
VITE_BASE_PATH=/pocket-chess/ npm run build
```

```powershell
# Windows PowerShell
$env:VITE_BASE_PATH = "/pocket-chess/"
npm run build
```

## About / Licences / Privacy

The app itself has a small **About / Licences / Privacy** screen (linked
from the home screen) covering the same ground as the Licence and
Privacy sections of this README, for anyone using the app who never sees
the source repository.

## Status

Phase 0 (scaffold), Phase 1 (deterministic local two-player chess), and
Phase 2A (Stockfish engine foundation: a vendored local WASM build behind
a tested `src/engine/` boundary) are implemented, and the app can be
deployed to Cloudflare Workers Static Assets (see above - this is
optional and not a prerequisite for later phases). Stockfish is not yet
wired into any user-facing "Play computer" feature, and puzzles and
persistence are not yet built - see next-steps.md.
