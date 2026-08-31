# AGENTS.md - Pocket Chess

This file orients any coding agent (Claude Code or otherwise) working in this
repository. It is a standalone repo under D:\Projects and must not depend on
sibling projects.

## What this is

Offline-first personal chess trainer PWA. Full specification:
pocket-chess-build-spec.md (read it before making architectural decisions).

## Source of truth for behaviour rules

pocket-chess-build-spec.md, section 49 ("Claude Code implementation rules")
and section 53 ("Core architectural decision"). Key points repeated here for
quick reference:

- The chess.js-backed domain layer (`src/chess/`) is the single authoritative
  source of game state. React components and the future Stockfish adapter
  must never hold or derive their own copy of board state.
- No backend, no auth, no LLM integration, no analytics/telemetry.
- Work phase by phase (see build spec section 47). Do not jump ahead to
  Stockfish, puzzles, or persistence before the current phase is accepted.
- Run `npm test` and `npm run build` before declaring a phase complete.
- Permanent privacy invariant (build spec section 26): game data stays
  on-device unless the user deliberately initiates an export or a future
  sync feature. Introducing cloud sync, accounts, multiplayer, crash
  reporting, telemetry, analytics, remote AI, uploaded PGNs, or social
  features requires a privacy review (update the About/Privacy screen,
  build spec section 26, and README.md together) before it ships.
- `public/_headers` (Cloudflare Workers Static Assets' supported header
  mechanism) carries the response security headers, including a CSP
  derived from what the production bundle/service worker/PWA
  manifest/Stockfish Worker actually need. Do not add CSP allowances
  (`unsafe-eval`, `unsafe-inline`, `blob:`, `data:`, external origins,
  etc.) without verifying they're genuinely required against real build
  output/browser behaviour first.

## Current architecture (Phase 0 + Phase 1 + Phase 1.1 + Phase 1.2 + Phase 1.3 + release hygiene)

```text
src/
  chess/            authoritative domain wrapper around chess.js
                     (ChessGame, chessTypes, gameResult - outcome model)
  components/board/ presentation-only board (no rules logic)
  features/home/    home screen
  features/play/    local two-player screen + use-case hook
  features/about/   About/Licences/Privacy screen (static content only)
  app/               App shell / routing (in-memory, no router yet)
  styles/            global CSS
tests/e2e/           Playwright specs (local game, checkmate, promotion) -
                     all drive the real UI; there is no test-only runtime
                     seam of any kind (one existed for FEN injection and was
                     deliberately removed in Phase 1.2 - see
                     session-handoff.md).
wrangler.jsonc       Cloudflare Workers Static Assets config (assets-only,
                     no Worker script) - see README.md's Cloudflare section.
scripts/wrangler-workspace.mjs  workspace-scoped Wrangler wrapper used by
                     `cf:dev`/`cf:dry-run` - see the Cloudflare bullet below.
LICENSE              GPL-3.0-or-later (full text; project notice at the top).
LICENSES/            third-party notices for distributed runtime code.
```

No Stockfish, no puzzles, no IndexedDB persistence yet - see next-steps.md.
Phase 1.1 stabilisation (post-Codex-review hardening) is done: chess.js is
the sole source of move history (no parallel `appliedMoves` list), promotion
requirement is determined by `ChessGame.requiresPromotion()` not by the
board checking ranks, terminal state is an explicit `GameOutcome` model with
winner/draw-reason.
Phase 1.2 (second Codex review fixes + first Cloudflare deployment) is also
done: `applyMove()` checks legality against chess.js's own verbose move list
*before* calling `move()` (never by matching its error-message text), so any
exception `move()` still throws is unambiguously wrapped in
`ChessGameError` rather than distinguished by wording; the service worker
uses `registerType: 'prompt'` so a new deployment cannot seize an
in-progress game (`skipWaiting`/`clientsClaim` are not force-enabled); and
the app is deployable to Cloudflare Workers Static Assets via
`npm run cf:deploy` (see session-handoff.md for full detail, including why
the actual `*.workers.dev` deployment is not yet live - it needs one
interactive `wrangler login`).
Phase 1.3 (final cleanup) is also done: `applyMove`/`legalDestinations`/
`requiresPromotion` all validate square-shaped input before ever calling
chess.js's `moves({ square })` (which treats a falsy/malformed square as
"no filter" and returns every legal move, not an error - a landmine for
future non-TypeScript-checked runtime data from an engine/puzzle/PGN
source); `wrangler.jsonc` sets `send_metrics: false` and
`dependencies_instrumentation.enabled: false` at the repo level instead of
relying on a machine-level `wrangler telemetry disable`; `npm run
cf:dry-run` runs fully workspace-scoped (see
`scripts/wrangler-workspace.mjs`) so it never writes to the user's OS
profile; and the real (not merely suspected) cause of the intermittent
E2E failure was found and fixed - see the E2E note below.
A public-release hygiene pass is also done: top-level `LICENSE`
(GPL-3.0-or-later); `.gitignore` hardened for `.env`/`.env.*`;
`ChessGame.applyUciMove()`'s contract made explicitly lowercase-only
(matches the real UCI protocol, and was previously inconsistent with
`applyMove()`'s own lowercase-only `isSquareId()` check); the Wrangler
wrapper script (renamed to `scripts/wrangler-workspace.mjs`) hardened to
run Wrangler's own bin entry point directly with no shell and no `npx`;
a small in-app About/Licences/Privacy screen
(`src/features/about/AboutScreen.tsx`); `engines.node: ">=22.0.0"` in
`package.json` (Wrangler's own stated minimum); and Scheduler (a
transitive React DOM dependency, confirmed present in the built bundle)
added to `LICENSES/THIRD-PARTY-NOTICES.md`.

## Working rules for this repo

- Keep chess rules logic out of React components; extend `src/chess/ChessGame.ts`
  instead.
- Before adding a dependency, check licence and maintenance status (build
  spec section 45).
- Verify current package versions before installing anything (build spec
  section 46) - do not assume the versions named in the spec are still
  current.
- This repo has no CI configured yet; run tests/build locally before calling
  work done.
- Deployment base path is a single env var, `VITE_BASE_PATH` (see
  `vite.config.ts` and README.md) - it drives both Vite's `base` and the PWA
  manifest's `start_url`/`scope`. Do not hardcode `/` elsewhere for paths.
- `npm run test:e2e` runs `npm run build` then `playwright test` as two
  separate steps deliberately (not chained with `&&` inside Playwright's
  `webServer.command`) - see the comment in `playwright.config.ts` for why
  that chaining caused an orphaned process hang on Windows.
  `webServer.reuseExistingServer` is hardcoded `false` (not
  `!process.env.CI`) - a locally-reused server could still be mid-teardown
  from the previous run and would then silently serve a stale build with
  mismatched asset hashes rather than the one `test:e2e` just built; this
  was caught in the Phase 1.3 session as a real, reproducible failure (all
  3 specs timing out waiting for a button that never rendered), not a
  hang - 1 failure out of 29 total `test:e2e` runs across the Phase
  1.2/1.3 sessions, and the one failure was with the old config, before
  this fix. 13 further runs after the fix (including tight back-to-back
  loops with zero delay, specifically to re-trigger the race) were all
  clean - see session-handoff.md.
- Cloudflare (`wrangler.jsonc`, `npm run cf:dev` / `cf:deploy`) is a pure
  static-asset delivery layer for the existing `dist/` build - it must never
  gain a Worker-side backend, database binding, or server-side chess logic.
  Do not add D1/KV/R2/Durable Objects/Analytics Engine/Cloudflare AI unless
  a later, explicit product decision changes the privacy architecture.

## Handoff docs

- session-handoff.md - state of the most recent working session. This file
  is intentionally **not tracked in the public repository** (local-only,
  gitignored) as of the Phase 1 close-out - it's a detailed, chronological
  session-by-session log useful for continuing work locally, but noisy for
  a public audience. Keep maintaining it locally per CLAUDE.md's workflow;
  it just isn't committed going forward.
- next-steps.md - concrete next actions, updated as work progresses.
