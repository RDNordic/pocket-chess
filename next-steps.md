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
ran into a problem.") despite working online and despite the vendored
engine's `.js`/`.wasm` both being correctly precached (verified - see the
hotfix's own commit message/root-cause note). Root cause: not reproducible
against a real Worker/WASM/service-worker/Cache-Storage stack on desktop
Chromium, which narrows it to a WebKit/iOS-Safari-specific gap in how a
service worker interacts with resources a *nested* dedicated Worker
fetches for itself (a documented category of past WebKit bugs - some
fixed as recently as Safari 17.2 - either around Cache Storage read
performance/correctness or a newly-installed service worker's control of
a page's own Workers) - not something this project's own automated tests
can exercise, since none of them run against real iOS WebKit. Fix (both
in the engine/application layers, no vendored-file or CSP changes):
`StockfishAdapter`'s handshake timeout raised from 10s to 15s (real-device
WASM compile from Cache Storage is measurably slower than a fast network
stream in CI/desktop testing); `useComputerGame`'s engine start-up now
gets one automatic, transparent retry (a fresh Worker, same
`sessionConfig`) before ever surfacing `engine-error` to the player - the
existing manual Retry button is unchanged and remains the fallback if
both attempts fail. A real, fully-offline Playwright e2e test
(`tests/e2e/play-computer.spec.ts`) now exercises the actual service
worker + Cache Storage + real Worker/WASM with the network hard-disabled.
Outstanding: this branch has not had independent review, and - like Phase
3A itself - the ultimate proof is a physical iPhone/Airplane-Mode retest
against a fresh deploy, which cannot be performed from this environment.

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
