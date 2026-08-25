# Next steps

Phase 0 (scaffold) and Phase 1 (deterministic local two-player chess) are
done - see session-handoff.md for details. This file tracks concrete,
actionable next work; update it as items are completed or superseded.

## Phase 2: Stockfish integration (next)

Reference: pocket-chess-build-spec.md sections 5, 11, 12, 13.

- [ ] Locate and verify a Stockfish 18 lite single-threaded WASM build
      (nmrugg/stockfish.js or an equivalent verified build). Record the
      exact upstream version/commit.
- [ ] Add the engine JS + WASM files under `public/engine/`. Do not load
      from a third-party CDN at runtime (build spec section 27).
- [ ] Update `LICENSES/THIRD-PARTY-NOTICES.md` with GPLv3 licence text,
      attribution, source pointer, and confirmation that Stockfish was not
      modified (build spec section 44) - mandatory before shipping this
      phase.
- [ ] Implement `src/engine/engineTypes.ts` (EngineOptions, SearchLimits,
      EngineMove, PositionAnalysis) and `src/engine/UciParser.ts`.
- [ ] Implement `src/engine/StockfishAdapter.ts` behind the `ChessEngine`
      interface from build spec section 12, running Stockfish inside a Web
      Worker. Track the explicit engine state machine from section 13
      (uninitialised -> starting -> ready -> searching -> ready, plus
      error/disposed) and reject stale search responses via request tokens.
- [ ] Add a "Play computer" flow: choose colour (White/Black/random), start
      a `ChessGame`, request the engine's first move if it plays White,
      validate every engine move through `ChessGame` before applying it
      (never treat engine output as authoritative on its own).
- [ ] Keep the existing local two-player screen working unchanged.
- [ ] Unit tests: UCI response parsing, stale-response rejection.
- [ ] Engine integration tests per build spec section 40 (Worker launches,
      uci/isready handshake, bestmove returned and legal, cancellation/stop
      works).
- [ ] `npm test` and `npm run build` must pass before calling Phase 2 done.

## Deferred (do not start yet)

- Phase 3: engine difficulty levels, undo/resign/restart polish for the
  computer-game flow, random colour selection.
- Phase 4: IndexedDB persistence (settings, games, puzzle progress).
- Phase 5: puzzle pipeline (Lichess CC0 dataset preprocessing script,
  ~5,000 bundled puzzles, puzzle session logic).
- Phase 6: PWA/offline hardening and the v0.1 release gate (real iPhone
  acceptance test).
- Phase 7: post-game analysis - only after v0.1 is stable.
