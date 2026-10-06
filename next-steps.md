# Next steps

## M0/M1 reviewed - M2 is next (2026-10-06)

M1 review follow-up: the reported P2 castling/en-passant metadata issue is fixed
locally, with 27 focused regressions. Final unit run: 293/293 in 12 files;
lint/build passed. Separate review verified this fix; M2 remains unstarted.
See the latest local handoff for the exact scope and initial timeout/re-run.

The user authorised M0 followed by M1 ONLY with relevant plan defaults.
M0 reconciled the repository/spec sequence; build-spec section 54 records the
bounded amendment. M1 adds the headless puzzle session, exhaustive bounded
objective/content validation, six synthetic fixtures and additive ChessGame
enumeration/projection. No Kids screens, persistence, assets or later milestone
implementation exists. See plan-build.md section 11 and src/puzzles/README.md.

Initial M1 verification: `npm test` 266/266 (11 files); lint/build passed;
existing Chromium E2E 8/8 and real-engine tests 6/6 passed. Browser commands
exited 0 only after manual cleanup of their own stalled Vite teardown processes;
this limitation is recorded in the plan/handoff. Subsequent separate review
found the P2 issue above, now fixed and verified. Physical acceptance remains
outstanding. Branch: `codex/kids-puzzle-foundation`, based on `bf5ef98`;
its history includes unmerged Phase 3B controls.

Next: authorise M2 local records using plan-build.md. M1 review found no remaining
blocker after the correction. The reviewer checked source/tests and ran in-memory
reproductions, not a second full-suite/browser run. Do not restart discovery or
implement later milestones without authorisation.
Phase 3B follow-up review/device acceptance remains separate and unresolved.

## Latest planning update - 2026-10-06

Use plan-build.md as the consolidated plan. It now includes Legacy 100-game
summaries, content-version resume defaults, offline integration in each content
milestone, and explicit reset behaviour. Review remaining defaults at their milestone gates;
do not restart discovery or require another standalone mockup.

The user clarified that licensed third-party functions, expert videos and useful
APIs can fit the product when the parent controls content and data flow. The core
goal is a delightful personal app without commercial pressure, stranger matching
or manipulation. A separate optional-learning track records QUEEN as a research
candidate; no model deployment or game upload is authorised. Core R1 stays offline.
Older no-LLM wording below describes the current implementation, not a ban on
considering this explicitly requested option.

## Historical priority reset: private Kids Mode (2026-10-05)

The discovery directions below record the earlier planning stage. The reviewed
M0/M1 status above and plan-build.md now govern the next implementation step.

Discovery draft: [Kids Mode product and UX brief](kids-mode-product-brief.md).
Revised after user clarification: this distinguishes requested features from
proposed mechanics and open decisions; it is not approved implementation scope.
Agree the brief and screen sketches before the detailed build plan, then choose
the implementation model.

The user wants an enjoyable, parent-controlled alternative inspired by the
appeal of ChessKid for a competent independent reader/player: unrestricted
puzzles, bot games with legal-move/threat guidance, undo/review/rematch,
opening/middlegame/endgame scenarios, local results/statistics, avatar dress-up,
board colours, alternative child-friendly pieces, sound effects and music.
Milestone-based clothing/accessory rewards are a suggested design direction.
Preserve adult play. The family reference image is a visual direction, not an approved
layout or an instruction source. Use original or appropriately licensed art,
lesson content and wording; do not clone ChessKid branding/assets/screens.

- Keep child/family context in the local-only handoff, not public docs.
- Prioritise privacy and offline usefulness. No tracking, advertising, social
  matching, public profiles, or engagement-pressure mechanics are requested.
  Positive reinforcement and creative customisation are desired. Define earned
  cosmetic milestones, hint/repeat handling and permanent unlock behaviour;
  exact reward mechanics are not agreed. Local statistics are explicitly
  requested and must not be confused with remote telemetry.
- Backend requested for consideration, not yet specified or approved for
  implementation. Puzzles, openings and avatar dressing do not inherently
  require server-side child data. Compare a local-first content library with
  a minimal parent-controlled content service before deciding. Resolve any
  sync, identity, hosting, retention and deletion needs explicitly.
- No code implementation before agreeing a product brief, one complete child
  interaction, iPad mini prototype, architecture and acceptance criteria.
- The beginning-reader/rook-first proposal is superseded. Piece basics remain
  optional. Sketch a puzzle journey and a bot-game move-preview/review journey.
  English/Norwegian/both at launch, narration, audio defaults, artwork, exact
  reward rules and first-release boundaries remain open. Sound effects and
  background music themselves are requested features.
- Unlimited puzzles means no usage cap/paywall, not infinitely many unique
  offline positions. Specify library variety, repeats and replenishment.
- Distinguish attacked squares from losing moves and deeper tactical advice;
  design preview/confirm/cancel explicitly. Basic game replay and automatic
  analysis are separate scope decisions.
- Reuse ChessGame authority for real games and keep React presentation-only.
  If isolated piece exercises need non-game positions, design a separate
  exercise model without weakening normal chess legality. Preserve local
  Stockfish, stale-session protection, existing adult controls and CSP.
- Codex now handles implementation; its own checks must not be described as
  independent review. Agree review checkpoints as part of the process.

Next: agree the revised product target and sketch puzzles, guided bot play,
review/statistics and rewards. Set the prototype boundary and release slices
before the detailed build plan. Do not automatically resume the old phase
sequence or implement all requested features at once.

Baseline verification: local HEAD `bf5ef98` on
`feature/practice-game-controls-v1`; initial Phase 3B review was GO with two
non-blockers, followed by the tidy-up commit. Focused re-review and release
acceptance remain unverified in this chat. The user confirmed the earlier
piece theme, bot strength and offline experience accepted on physical iPhone.

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

## Phase 3A: adjustable bot strength - done, physically accepted

Reference: pocket-chess-build-spec.md section 14. Reviewed (GO obtained)
and merged to `main`. Physical iPhone testing in Airplane Mode then found
Play Computer failing offline in production - see the
"Offline Play Computer regression hotfix" entry below for the fix, which
has since been re-validated on a physical iPhone in Airplane Mode against
a fresh deploy: Play Computer now works both online and offline in
production. This is a scoped-down slice of
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
shows the active label. Take back/resign/new game/rematch followed in
Phase 3B (below); random colour selection and any player-facing rating
estimate remain unstarted (see "Deferred" below).

## Offline Play Computer regression hotfix - merged, physically accepted

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

## Board Piece Theme v1 - merged, deployed, physically accepted on iPhone

Reference: merged to `main` from `feature/board-piece-theme-v1`. UX/
presentation-only slice - no chess-rule, engine, offline, or privacy
changes. Replaces the previous Unicode/system-font piece glyphs
(`src/components/board/pieceGlyphs.ts`, removed) with the "cburnett"
vector piece set (Colin M.L. Burnett; GPLv2+, selected from the
multi-license the original author offers - see
`LICENSES/THIRD-PARTY-NOTICES.md` for the full provenance/licence note),
vendored locally as 12 SVG files under
`src/components/board/pieces/` and rendered via one centralised
colour+type -> asset mapping (`src/components/board/pieceAssets.ts`).
Recoloured only (ivory `#f5f1e6` white fill; explicit black `fill="#000"`
occurrences changed to charcoal `#1b1b1b` - three black pieces, `bP`/
`bQ`/`bR`, never carried an explicit fill upstream and so still render at
SVG's implicit default black rather than that charcoal, visually
indistinguishable on the board and not a defect, see
`LICENSES/THIRD-PARTY-NOTICES.md`; outline `stroke-width` raised
`1.5`->`2.2` for a thicker, clearer silhouette) - piece geometry/
proportions are unmodified upstream artwork,
so pawn/bishop/knight/etc. proportions are already normalised as one
family with no per-piece CSS hacks needed. `vite.config.ts` now sets
`build.assetsInlineLimit: 0` so these (and any future small local assets)
are always emitted as real same-origin files rather than inlined as
`data:` URIs, which the production CSP's `img-src 'self'` would otherwise
block - this was caught and fixed during this slice, not a pre-existing
issue. No CSP directive itself was changed/weakened.

## Phase 3B: practice-game controls - implemented, pending review and physical acceptance

Reference: pocket-chess-build-spec.md section 17 (undo behaviour), branch
`feature/practice-game-controls-v1`, off `main`. Play Computer only - no
engine/chess-rule/offline/privacy changes; Play Local is untouched. Adds:

- **Take back**: `ChessGame.undoLastMove()` (already existed, unused
  until now) undoes 1 ply if the player's own move was last (an active
  search, an engine failure, or the player's move ended the game) or 2
  plies if the computer's reply was last (a completed reply, or an
  engine move that ended the game) - a single rule, driven purely by
  `ChessGame.history`, that always lands back on "the player's turn to
  decide" from every phase. Disabled with nothing to restore, and (for a
  Black-playing player) never undoes the computer's forced opening move.
  Always tears down and rebuilds the engine session (reusing the same
  retry-hardened start-up path `retry()` already relies on) rather than
  trying to distinguish "cancel a search" from "the engine was already
  disposed" from "the engine errored" as separate cases.
- **Resign**: a small `ConfirmDialog` (new, generic - also used by New
  game), then an explicit `{ status: 'resigned', winner }` outcome
  applied only as an overlay on the returned snapshot -
  `ChessGame`/chess.js itself is never told the game ended (its own
  `GameOutcome`/`describeGameOutcome` already had a `resigned` variant
  built in, unused until now). Disables takeback.
- **New game**: returns to colour/difficulty setup (`onNewGame`, routed
  by `App.tsx`); confirms first unless the game has already ended.
- **Rematch**: offered once the game ends; `App.tsx` bumps a `key` on
  `ComputerGameScreen` to force a full remount with the same
  `playerColour`/`difficulty` - reuses this screen's existing mount-time
  initialisation rather than a second, parallel in-place reset path.

`Board` gained an optional `resetSignal` prop so a caller (takeback) can
force-close an open promotion dialog it doesn't otherwise have access to;
unused by `PlayLocalScreen`. Not yet reviewed, and not yet checked against
a physical iPhone/deployed build.

## Production bug fix: WASM blocked by CSP - done

Production (unlike local validation) blocked `WebAssembly.instantiate()`
under the deployed `script-src 'self'`, so Stockfish could never start in
production despite passing locally. Fix: `public/_headers`'s CSP now reads
`script-src 'self' 'wasm-unsafe-eval'` - the minimal WebAssembly-compilation
allowance, not the broader `unsafe-eval`. No other CSP directive changed.

## Deferred (do not start yet)

- The remaining, still-unstarted part of build spec Phase 3 - player Elo
  estimation/rating display, and random colour selection. (Skill Level
  difficulty is merged - Phase 3A above; take back/resign/new
  game/rematch are implemented on the local feature branch; merge status
  is not verified - see the priority-reset baseline above.)
- Phase 4: IndexedDB persistence (settings, games, puzzle progress).
- Phase 5: puzzle pipeline (Lichess CC0 dataset preprocessing script,
  ~5,000 bundled puzzles, puzzle session logic).
- Phase 6: PWA/offline hardening and the v0.1 release gate (real iPhone
  acceptance test).
- Phase 7: post-game analysis - only after v0.1 is stable.
