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

## Phase 3A: adjustable bot strength - merged, offline regression hotfixed

Reference: pocket-chess-build-spec.md section 14. Reviewed (GO obtained)
and merged to `main`. Physical iPhone testing in Airplane Mode then found
Play Computer failing offline in production - see the
"Offline Play Computer regression hotfix" entry below for the fix. Still
outstanding before this slice can be called fully done: re-running the
physical-iPhone + offline acceptance check against a fresh deploy that
includes the hotfix. This is a scoped-down slice of
Phase 3 - only the Stockfish `Skill Level` UCI option (`UCI_LimitStrength`
explicitly `false`), not `UCI_Elo`/rating estimation. Four **provisional**
presets (`gentle`=0, `casual`=5, `challenging`=10, `strongest`=20 - see
`src/engine/engineDifficulty.ts`, the one file holding this mapping),
chosen after verifying locally which UCI options the vendored Stockfish 18
Lite build actually advertises (spin `Skill Level` 0-20, check
`UCI_LimitStrength`) rather than inventing any. `ChessEngine.start()` now
takes an optional `EngineSessionConfig`; `StockfishAdapter` validates the
engine's advertised capabilities and sends `setoption` for both options
after `uciok` and before `isready`/`readyok`, on both the initial handshake
and every Worker-restart recovery path, so the selected strength survives
recovery without any separate code path. The pre-game colour-select screen
(`ColourSelectScreen`) now also picks a difficulty (default Gentle for new
games), fixed for the session; a compact badge in `ComputerGameScreen`
shows the active label. Still deferred to a later Phase 3B: random colour
selection, undo/resign/restart, and any player-facing rating estimate.

## Offline Play Computer regression hotfix - implemented, pending review

Reference: branch `hotfix/play-computer-offline-regression`, off `main`
(includes the merged Phase 3A). Physical iPhone testing in Airplane Mode
found Play Computer failing offline in production ("The computer opponent
ran into a problem.") - a real, confirmed failure on real hardware. This
happened despite working online and despite the vendored engine's
`.js`/`.wasm` both being correctly precached (verified directly against
the generated service worker's precache manifest - see the hotfix's own
commit message). Also confirmed: a real, fully-offline reproduction
(actual Worker, actual vendored WASM, actual service worker and Cache
Storage, network hard-disabled) passes cleanly on desktop Chromium - the
failure was not reproduced in this environment. Working hypothesis, not a
confirmed root cause (no physical iPhone or real WebKit browser was
available to test against in this environment): a platform-specific
(WebKit/iOS Safari) startup or cache-timing issue in how a service worker
interacts with resources a *nested* dedicated Worker fetches for itself -
a plausible category given documented past WebKit bugs in this area, but
not verified against the actual device. Fix (both in the engine/
application layers, no vendored-file or CSP changes) targets this
hypothesis without depending on it being exactly right:
`StockfishAdapter`'s handshake timeout raised from 10s to 15s, on the
reasoning that WASM read-from-cache-and-compile on real mobile hardware
could plausibly take longer than in CI/desktop testing (no on-device
timing measurement was taken to confirm this); `useComputerGame`'s engine
start-up now gets one automatic, transparent retry (a fresh Worker, same
`sessionConfig`) before ever surfacing `engine-error` to the player - the
existing manual Retry button is unchanged and remains the fallback if
both attempts fail. A real, fully-offline Playwright e2e test
(`tests/e2e/play-computer.spec.ts`) now exercises the actual service
worker + Cache Storage + real Worker/WASM with the network hard-disabled.
Physical iPhone Airplane Mode validation against a deployed build has
since passed - Play Computer works both online and offline in production.

## Board Piece Theme v1 - implemented, pending review

Reference: branch `feature/board-piece-theme-v1`, off `main`. UX/
presentation-only slice - no chess-rule, engine, offline, or privacy
changes. Replaces the previous Unicode/system-font piece glyphs
(`src/components/board/pieceGlyphs.ts`, removed) with the "cburnett"
vector piece set (Colin M.L. Burnett; GPLv2+, selected from the
multi-license the original author offers - see
`LICENSES/THIRD-PARTY-NOTICES.md` for the full provenance/licence note),
vendored locally as 12 SVG files under
`src/components/board/pieces/` and rendered via one centralised
colour+type -> asset mapping (`src/components/board/pieceAssets.ts`).
Recoloured only (ivory `#f5f1e6` white fill, charcoal `#1b1b1b` black
fill, outline `stroke-width` raised `1.5`->`2.2` for a thicker, clearer
silhouette) - piece geometry/proportions are unmodified upstream artwork,
so pawn/bishop/knight/etc. proportions are already normalised as one
family with no per-piece CSS hacks needed. `vite.config.ts` now sets
`build.assetsInlineLimit: 0` so these (and any future small local assets)
are always emitted as real same-origin files rather than inlined as
`data:` URIs, which the production CSP's `img-src 'self'` would otherwise
block - this was caught and fixed during this slice, not a pre-existing
issue. No CSP directive itself was changed/weakened.

## Production bug fix: WASM blocked by CSP - done

Production (unlike local validation) blocked `WebAssembly.instantiate()`
under the deployed `script-src 'self'`, so Stockfish could never start in
production despite passing locally. Fix: `public/_headers`'s CSP now reads
`script-src 'self' 'wasm-unsafe-eval'` - the minimal WebAssembly-compilation
allowance, not the broader `unsafe-eval`. No other CSP directive changed.

## Deferred (do not start yet)

- Phase 3B: the rest of build spec Phase 3 - player Elo
  estimation/rating display, undo/resign/restart polish for the
  computer-game flow, random colour selection. (Skill Level difficulty is
  merged - see Phase 3A above. Phase 3B
  should not start until Phase 3A is reviewed and merged.)
- Phase 4: IndexedDB persistence (settings, games, puzzle progress).
- Phase 5: puzzle pipeline (Lichess CC0 dataset preprocessing script,
  ~5,000 bundled puzzles, puzzle session logic).
- Phase 6: PWA/offline hardening and the v0.1 release gate (real iPhone
  acceptance test).
- Phase 7: post-game analysis - only after v0.1 is stable.
