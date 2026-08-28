# CLAUDE.md - Pocket Chess

Repo-specific instructions for Claude Code. This repo also has an AGENTS.md
with the same core content for other tools; keep both in sync when updating
architecture or rules unless asked to diverge.

This is a standalone repository. Do not read, compare against, or import
from sibling projects under D:\Projects unless the user explicitly asks for
a cross-repo/portfolio-level task (see the D:\Projects-level CLAUDE.md for
that mode).

## Build specification

Read pocket-chess-build-spec.md before any non-trivial change. It defines
product scope, architecture boundaries, phased delivery plan, licensing
requirements, and explicit non-goals. Treat its "Claude Code implementation
rules" (section 49) as binding.

## Non-negotiables

- No backend, no accounts/auth, no LLM/AI features, no analytics/telemetry.
- chess.js (via `src/chess/ChessGame.ts`) is the only authoritative source of
  chess state. Stockfish (Phase 2+) validates through it, never replaces it.
- Stockfish must run in a Web Worker, never on the main thread, once added.
- Work one phase at a time per the build spec's phase list; do not
  pre-implement later phases.
- No test-only runtime seam reachable via a browser global/URL/query string
  may exist in the app (one existed for FEN injection and was removed in
  Phase 1.2 - reach test positions via real move sequences instead).
- Cloudflare (`wrangler.jsonc`) is a static-asset host only - no Worker
  backend, database binding, or server-side chess logic. See README.md's
  Cloudflare section for the `cf:dev`/`cf:deploy`/`cf:dry-run` scripts.
  Privacy settings (`send_metrics`, `dependencies_instrumentation`) are
  repository-scoped in `wrangler.jsonc`, not a machine-level setting.
- Any square/move value entering `src/chess/ChessGame.ts` from outside a
  TypeScript-checked call site (future engine/puzzle/PGN input) must be
  validated as a real square shape before being handed to chess.js's
  `moves({ square })` - it silently treats a falsy/malformed square as "no
  filter" rather than erroring.
- `ChessGame.applyUciMove()`'s input contract is lowercase-only (matches
  the real UCI protocol) - do not reintroduce case-insensitive matching
  there.
- The project is licensed GPL-3.0-or-later (`LICENSE` at repo root); the
  in-app About screen (`src/features/about/AboutScreen.tsx`) and
  `LICENSES/THIRD-PARTY-NOTICES.md` must stay in sync with whatever
  runtime dependencies are actually bundled into `dist/`.
- `scripts/wrangler-workspace.mjs` (used by `cf:dev`/`cf:dry-run`) invokes
  Wrangler's own bin entry point directly with `shell: false` and no
  `npx` - do not reintroduce a shell or `npx` there without a concrete
  reason.

## Before finishing any change

1. `npm test`
2. `npm run lint`
3. `npm run build`
4. `npm run test:e2e` (must exit cleanly - if it hangs, see the comment in
   `playwright.config.ts` before chaining shell commands in `webServer`)
5. Update session-handoff.md and next-steps.md if the change is
   session-ending or shifts what should happen next.

## Licensing

Every third-party asset (code, engine binary, piece art, puzzle data) needs
its licence recorded in LICENSES/THIRD-PARTY-NOTICES.md. Stockfish (GPLv3)
and the Lichess puzzle database (CC0) have specific requirements documented
in build spec section 44 - follow them exactly when those phases start.
