# Next steps

Phase 0 (scaffold), Phase 1 (deterministic local two-player chess, plus
the 1.1/1.2/1.3 stabilisation passes), Phase 2A (Stockfish engine
foundation), and Phase 2B (Play computer) are done - see session-handoff.md
for session-by-session detail. This file tracks concrete, actionable next
work; update it as items are completed or superseded.

## Phase 2A: Stockfish engine foundation - done

Reference: pocket-chess-build-spec.md sections 5, 11, 12, 13. Stockfish 18
lite single-threaded (nmrugg/stockfish.js v18.0.0, unmodified, vendored
under `public/engine/`) runs in a Web Worker behind `src/engine/`'s
`ChessEngine` interface (`StockfishAdapter.ts`, `UciParser.ts`,
`engineTypes.ts`), with the full lifecycle state machine, bounded
timeouts on every wait (handshake, stopped-search recovery, an ordinary
search's own watchdog), Worker-generation-safe recovery, and
`LICENSES/THIRD-PARTY-NOTICES.md` updated. Not wired into any UI feature
at this point - see Phase 2B below.

A pre-deployment privacy/security hardening pass followed (the standing
privacy invariant in build spec section 26, reworded About/README privacy
wording, and `public/_headers`'s response security headers/CSP), then the
first live deployment to
`https://pocket-chess.rdnordic.workers.dev` (Cloudflare Workers Static
Assets, static-assets-only, no bindings).

## Phase 2B: Play computer - done

Reference: pocket-chess-build-spec.md sections 6, 11, 13. Adds a "Play
computer" flow (`src/features/play-computer/`): choose White or Black
(no random option yet), `useComputerGame` coordinates `ChessGame` +
`ChessEngine` (one engine instance per computer-game session, disposed on
exit), every engine move is validated through `ChessGame` before it can
affect the game, and an explicit phase model
(`player-turn`/`computer-thinking`/`game-over`/`engine-error`) drives the
UI rather than inferring it from disabled buttons. One fixed search time
(1000ms) - no difficulty UI yet, that is Phase 3. Local two-player is
unchanged.

## Deferred (do not start yet)

- Phase 3: engine difficulty levels (Skill Level/UCI_LimitStrength UI),
  player Elo estimation, undo/resign/restart polish for the computer-game
  flow, random colour selection.
- Phase 4: IndexedDB persistence (settings, games, puzzle progress).
- Phase 5: puzzle pipeline (Lichess CC0 dataset preprocessing script,
  ~5,000 bundled puzzles, puzzle session logic).
- Phase 6: PWA/offline hardening and the v0.1 release gate (real iPhone
  acceptance test).
- Phase 7: post-game analysis - only after v0.1 is stable.
