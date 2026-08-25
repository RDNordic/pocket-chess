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

## Current architecture (Phase 0 + Phase 1 + Phase 1.1 stabilisation)

```text
src/
  chess/            authoritative domain wrapper around chess.js
                     (ChessGame, chessTypes, gameResult - outcome model)
  components/board/ presentation-only board (no rules logic)
  features/home/    home screen
  features/play/    local two-player screen + use-case hook
  app/               App shell / routing (in-memory, no router yet)
  styles/            global CSS
  testing/           test-only seams (e.g. FEN injection for E2E) - never
                     read from user-reachable input
tests/e2e/           Playwright specs (local game, checkmate, promotion)
```

No Stockfish, no puzzles, no IndexedDB persistence yet - see next-steps.md.
Phase 1.1 stabilisation (post-Codex-review hardening) is done: chess.js is
the sole source of move history (no parallel `appliedMoves` list), promotion
requirement is determined by `ChessGame.requiresPromotion()` not by the
board checking ranks, terminal state is an explicit `GameOutcome` model with
winner/draw-reason, and `applyMove()` differentiates ordinary illegal-move
rejection from unexpected failures (`ChessGameError`, never silently
swallowed).

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

## Handoff docs

- session-handoff.md - state of the most recent working session.
- next-steps.md - concrete next actions, updated as work progresses.
