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

## Current architecture (Phase 0 + Phase 1)

```text
src/
  chess/            authoritative domain wrapper around chess.js
  components/board/ presentation-only board (no rules logic)
  features/home/    home screen
  features/play/    local two-player screen + use-case hook
  app/               App shell / routing (in-memory, no router yet)
  styles/            global CSS
tests/e2e/           Playwright smoke tests
```

No Stockfish, no puzzles, no IndexedDB persistence yet - see next-steps.md.

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

## Handoff docs

- session-handoff.md - state of the most recent working session.
- next-steps.md - concrete next actions, updated as work progresses.
