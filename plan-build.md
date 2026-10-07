# Kids Mode - implementation and release plan

Updated: 2026-10-07.
Status: M0/M1/M2 implemented and separately reviewed. M2's two P2 corrections
were independently verified by source/test inspection and targeted in-memory
reproductions; the review did not rerun full suites. Physical acceptance remains
separate. The user authorised saving the reviewed M2 checkpoint, followed by M3
only. Acquire content/art only after approval of a bounded proposal; leave M3
local for separate review/device testing. No M4, merge or deployment. Phase 3B
ancestry remains unmerged and its acceptance is not established by this review.
Later release scope remains a proposal.
No Kids application UI or runtime storage integration has started. M2's headless
local records and exact verification are recorded in section 12 below.
Execution update (2026-10-06): the user authorised M0 and M1 ONLY, using the
defaults necessary for those milestones. Later product decisions remain open.
The M0 repository check is complete: ChessGame already provides FEN/PGN,
snapshots, legal move application and undo. M1 needs only legal-move enumeration
and disposable domain projection as additive seams; existing adult callers stay
unchanged. Build-spec section 54 records the scoped sequence/product amendment.
M1 modules are `src/puzzles/` with tests and six synthetic fixtures under
`src/puzzles/__tests__/`; no React/content repository/persistence is added.
Use the currently configured Codex for this authorisation, without a model
override. M1's separate review and correction verification are recorded below;
Phase 3B follow-up/device review is still a dependency for M4, not M1.
Sources: [product brief](kids-mode-product-brief.md),
[puzzle storyboard and feedback](kids-mode-puzzle-storyboard.md), and the current
[build specification](pocket-chess-build-spec.md).

This consolidates discovery into a build sequence. It supersedes this file's
previous requirement for another standalone storyboard. Guided-play behaviour
is specified below for approval; it has not been demonstrated or accepted on a
device. Approving this plan approves its chosen defaults and sequence, not every
milestone at once, downloads, dependencies, commits, deployment or external data
transmission. Each milestone has a bounded entry and exit gate.

## 1. Confirmed decisions and requested product

Confirmed direction:

- Keep GPL-3.0-or-later. Reuse the existing board, ChessGame, engine boundary and
  practice controls after appropriate review. Preserve the adult experience.
- Design for a competent independent reader/player, with iPad mini as the
  primary layout target. Puzzles and bot games lead; compulsory basics do not.
- Keep all requested experiences accounted for: unrestricted puzzles, guided bot
  play, undo/review/rematch, openings, middlegame/endgame practice, local
  statistics, avatar dress-up, cosmetic rewards, board/piece themes, effects
  and music. Milestone rewards are desired; their rules are not confirmed.
- Three explicit hints are confirmed. Encourage an independent attempt first,
  then support completion and a sense of mastery. Never reveal hints automatically.
- Use bright colours, soft shapes, rounded contours and clear familiar pieces.
  The working storyboard is a useful start, not approval of every interaction.
  The familiar piece screenshot is a requested direction; its exact artwork's
  source/licence is unresolved. Current licensed cburnett SVGs are a fallback,
  not a claim of an exact match.
- Kenney Animal Pack Remastered is the preferred character asset direction.
  Ordinary, affectionately silly names should be approximately half female and
  half male: Gary, Steven, Frank, Tony, Karen, Silly Susan and Negative Nelly.
  Freja replaces Brenda and is the Norse goddess herself, distinct from the
  animals. Species, jobs and the suggested personality jokes are not final.
- Prefer appropriately licensed existing chess content. Accept valid alternative
  solutions and account for opponent defences; canonical-line mismatch alone
  does not prove failure.
- Music sources and individual track permissions must be verified before
  bundling. No music, graphics pack or production puzzle snapshot has been
  acquired in this work. Read-only asset research was authorised in the later
  conversation; it does not authorise bulk acquisition or external uploads.
- Product agreement precedes implementation. Implementation/review model choice
  remains undecided. No new standalone mockup is required for this plan.

### Product principle clarified 2026-10-06

Build a joyful personal chess app whose content, incentives and data flows remain
under parent control. Success is enjoyment, understanding, creative expression
and increasing independence. Avoid sales funnels, upgrade prompts, manufactured
scarcity, random rewards, streak loss, retention pressure and unsolicited marketing.
No stranger matchmaking, social feed or child-facing purchasing. Characters,
celebrations, music, dress-up and earned milestones should be generous and fun;
technical austerity is not the product goal. Stopping should never cost progress
or disappoint a character. Design small, understandable privacy explanations
that a parent and child can discuss together.

The user explicitly welcomes consideration of licensed third-party functions,
curated expert videos and useful APIs, including chess explanations, where the
parent controls content and data flow. This reopens those options for planning;
it does not select a provider, authorise uploading games, or enable a service.

The recommended R1 core still uses bundled content, on-device storage and local
Stockfish, without accounts, analytics, advertising or runtime LLM calls. Core
play remains complete when offline or when all optional connections are disabled.
Optional connected features are evaluated separately below. Before shipping any
changed data flow, update build-spec section 26, README and in-app About/Privacy
together; keep the existing chess authority and security boundaries intact.

## 2. Proposed first release (recommended defaults, not confirmed scope)

R1 means a complete useful Kids Mode, delivered through M1-M7 and accepted in M8.
M1/M3 are internal validation slices, not a public release of the full promise.
The numbers below are concrete planning defaults to approve or change in decision
D2; they are not licensed content already available or an effort estimate.

| Area | R1 recommendation | Subsequent delivery, explicitly retained |
|---|---|---|
| Puzzles | 200 validated positions: 100 mate-in-one, 60 mate-in-two, 40 explicit capture tasks; theme and three provisional challenge bands; unlimited attempts/replays; repeat labels | More themes and positions through versioned app updates; deeper win-material tactics after objective validation is specified |
| Bot play | All four existing strength settings, colour choice, optional direct-attack preview, legal targets, takeback, resign, new game, rematch | Bounded automatic coaching/analysis if separately approved; no claimed Elo |
| Review/statistics | Local game list, move-by-move replay, wins/losses/draws and difficulty breakdown; resumable current game; Legacy screen with successive 100-game summaries and lifetime totals | Automatic mistake analysis; a separately designed local rating estimate if desired |
| Practice | 4 London scenarios, 4 middlegame scenarios (loose pieces, fork, pin, exchange), 4 endgame scenarios (basic mates, king activity, promotion); short reviewed explanations | Broader repertoire and deeper scenarios; 6 optional piece-basics activities in a subsequent slice, never required for entry |
| Personalisation | Named cast; one dressable animal with a starter wardrobe of 6 items and 3 milestone items; other cast members accompany activities/bots; Freja as herself | Dress-up support for more characters and more cosmetics; original Freja illustration may need a distinct asset source |
| Themes | 3 accessible board palettes, familiar classic pieces plus 1 licensed alternative piece set | Further child-friendly sets and palettes |
| Audio | 4 gentle effects and 1 verified looping music track; separate controls and saved settings | More individually verified tracks/effects; optional narration |
| Parent/local data | One local learner, launch-mode/language settings, local reset controls, honest storage status and resume | Multiple learner slots, deliberate backup export/import and any separately approved sync |

All counts are quality gates, not permission to ship invalid or unlicensed assets
just to meet a quota. If a target cannot be met, revise and approve the scope
explicitly; do not silently omit a requested feature or describe M3 as full R1.
No network is needed during play after offline readiness has been verified.
Unrestricted puzzles means no access limit, not infinitely unique positions.

## 3. Screen map and interaction contracts

Proposed navigation uses the existing app shell; no router dependency assumed.
Each destination below appears only when its slice is available. Internal early
slices do not show dead buttons, locks or pretend features.

| Screen | Entry and actions | States/return behaviour | Milestone |
|---|---|---|---|
| Mode entry / Kids home | Parent-chosen launch mode; Puzzles and Play primary, Practice and My corner secondary; labelled Parent settings | Continue current activity when present; adult mode remains reachable; no required character setup | M3, expanded M4-M7 |
| Puzzle selection | Theme and challenge choice; Start; unseen preferred, repeated clearly labelled | Loading, empty band, invalid content; offer another available band rather than lock access | M3 |
| Puzzle play | Goal and side to move, board, Hint, Try again; optional See Black's escape after a verified failure | Own turn, opponent turn, unsuccessful attempt, retry, complete; Back saves current checkpoint or reports failure | M3 |
| Puzzle result / replay | Why it works, Replay, Another puzzle, Home; replay start/previous/next | Read-only replay; return preserves completion; no automatic next puzzle or duplicate reward | M3 |
| Bot setup | Named opponent, explicit strength, colour, preview help setting | Character name is not a rating; settings fixed per game; Back to home | M4 |
| Bot game | Select source/destination; optionally preview, Play move or Cancel; takeback, resign, new game, rematch and flip | Player turn, preview, thinking, terminal, engine error/retry; promotion and confirmations remain accessible | M4 |
| Bot result / games / review | Result, Review, Rematch, New game, Home; local history and replay | Resignation is a result; abandonment separate; corrupt records isolated; live session is never overwritten by replay | M4 |
| Legacy (from statistics) | Games 1-100, 101-200, and subsequent blocks; current partial block and lifetime results | Completed bot games only; summaries survive pruning detailed replay records; show difficulty/help breakdown alongside scores | M4 |
| Practice hub / scenario / result | Openings, Middlegames, Endgames; choose scenario, short goal, hints, retry, explanation/replay | Branch-aware expected responses; no claim that one opening move is uniquely best; optional basics added later | M5 |
| My corner | Statistics, wardrobe, milestones, theme settings, audio settings | Empty stats, earned criteria, preview/equip/cancel; chess always accessible | M6-M7 |
| Parent settings / About | Launch mode, language, device-only storage explanation, confirmed reset; licences/privacy | Explicit appearance/learning/game-data/fresh-start reset actions; no mandatory PIN in proposed R1 | M2-M3, completed M8 |

### Puzzle behaviour recommended for approval

- Tap piece then destination; optional dragging must not be required. Legal
  target markers describe legality, not a guaranteed solution.
- Start with goal-only copy. Hints reveal concept, piece, then destination for
  one accepted branch. A third hint may give the move; other winning moves stay
  accepted. Hint state resets on advancing to a new decision.
- Illegal input leaves the position and progress unchanged. A legal unsuccessful
  attempt remains visible until Try again. See Black's escape is optional and
  shows an authored, verified defence; retry is immediately available.
- Retry restores the missed decision, preserving previous correct moves. Restart
  from beginning is available as a secondary action. Assistance never removes
  access or an earned item.
- Correct moves trigger an automatic opponent response with a brief highlight;
  no Continue button. Disable move input during the reply and ignore stale work
  after exit/retry. Reduced motion removes movement, not turn information.
- Completion has a specific factual explanation and deliberate next choices.
  Replay is read-only. No loss sound, life counter, timer pressure or reward gate.
- Unseen entries are preferred within a chosen band; after exhaustion, offer
  labelled repeats without changing access. Do not silently promote difficulty.
- Saving is independent of chess progress. If unavailable, current-session play
  continues with 'Progress isn't saved on this device' and Retry saving.

The illustrative Qe7/Kg8/Qg7# storyboard demonstrates a scripted line only. Its
Qh4+/Kg8 failure was checked locally, but the visual is not a reusable chess
runtime or production library. Do not transplant its hardcoded scene logic.

### Guided bot play recommended for approval

Legal targets on; preview help off initially and clearly available in setup.
With preview on, a legal destination creates a disposable domain-owned projected
position; live history/FEN do not change. Show direct attack facts for the moved
piece and newly exposed friendly pieces. 'Attacked' is not 'bad move'. Define and
test pawn/king/pinned-piece attack semantics; never advertise this as complete
fork/pin/sacrifice evaluation. Commit only after Play move; Cancel returns to the
same position without a record/statistic. Choose promotion before constructing
its preview. No automatic engine advice is part of R1.

Existing player-decision takeback semantics remain: undo own move plus completed
reply, safely stop an in-flight reply, preserve Black's mandatory opening ply,
and disallow takeback after resignation. Resuming a game on a computer turn
recomputes a move with a fresh engine session; never persist Worker state.
Leaving a game suspends it; a deliberate new game can abandon it after confirmation.
A rematch creates a fresh game ID with the same colour/strength, not reused history.

## 4. Reuse boundaries and new responsibilities

Inspected baseline: `feature/practice-game-controls-v1`, HEAD `bf5ef98`.
The initial Phase 3B implementation received GO with follow-ups; independent
review of this follow-up commit, merge/deployment and physical acceptance are
not established. Treat this as a review dependency, not accepted release evidence.

| Existing seam | Reuse | Bounded change permitted in its milestone |
|---|---|---|
| `src/chess/ChessGame.ts` | FEN constructor, `fromPgn`, legal destinations, promotion, validated moves, history, undo, snapshots | M1: domain-owned move enumeration/projection only where current API is insufficient; no direct chess.js calls from UI/engine |
| `src/components/board/` | Board snapshot/selection callbacks, promotion dialog, reset signal, orientation, asset mapping | M3/M6: optional presentation props for themes/read-only replay; retain current adult defaults and keyboard/focus behaviour |
| `src/engine/` | ChessEngine start/search/stop/dispose, existing strength mapping, watchdog and recovery | M4: reuse unchanged for bot play; no analyse API, new engine or UCI code in React |
| `useComputerGame` / game screens | Session lifetime, validated engine moves, takeback/resignation, remount-based rematch, confirmations | M4: minimal session reconstruction/preview hooks and record events after focused review; no duplicate Kids engine coordinator |
| `src/app/App.tsx` / home | In-memory route convention and mode entry | M3: explicit Kids routes and ownership of active sessions; preserve adult routes |
| PWA, `public/_headers`, vendored engine | Local assets, base-path convention, prompt-based updates, minimal CSP | M3 onwards: cache and verify each milestone's new content/assets before its offline gate; M7 adds audio and M8 verifies the complete release; no unverified CSP widening or backend bindings |

New proposed modules follow existing `features/` and domain/adapter conventions,
with concrete locations finalised in M0: puzzle session/content repository,
scenario session, device-local repositories, read-only replay, award rules and
asset catalogue. Add interfaces only for actual use; no general framework rewrite.
Selection, hint visibility and storage health are independent of puzzle phase.
React renders snapshots and sends intents. Engine, content and saved records
must pass domain validation before becoming authoritative live positions.

Recommended persistence contract: versioned IndexedDB, no new wrapper dependency
unless separately justified/approved. Keep settings, game records, puzzle/scenario
progress, awards and wardrobe separate. Validate deserialisation/migrations;
never silently overwrite incompatible data. One unfinished bot game and one
puzzle checkpoint can coexist. Store reconstructable start position + legal move
sequence/PGN, session ID, revision, colour, strength, result and help metadata;
store no tap stream, personal name or engine memory.

Completed-game statistics derive from valid local result records. Reopening a board-
derived terminal position through takeback removes that result from totals;
ending it again updates the same ID/revision. Resignation stays terminal.
Puzzle rewards count distinct stable puzzle IDs, once regardless of hints/repeats.
Awards are idempotent and remain earned after ordinary retry/takeback/history
pruning. Persist completion and any award coherently; failures show unsaved status.
Recommended cap: 100 detailed completed-game records for move-by-move replay,
pruning oldest detail only with an upfront explanation. Preserve a compact
result ledger (stable game ID/order, revision, outcome, difficulty and help
metadata) so lifetime and Legacy statistics survive without retaining all PGNs.
This supersedes the previous proposal for totals limited to retained replays.
Proposed reset behaviour is defined below, with explicit confirmation for data loss.

### Resume across content updates (M2/M3 default)

A saved puzzle/scenario checkpoint identifies its stable content ID, exact content
version, accepted move path and decision checkpoint. On resume, validate against
the available content before loading the board. Resume unchanged matching content.
For an incompatible updated position/branch, restart that activity with a plain
explanation; if removed, return to selection. Do not discard unrelated completed
progress, Legacy results or earned items. Never replay old branch indexes against
new content. Test valid resume, changed/removed content, corrupt checkpoints and
update while an activity is open. Activate updates only at a safe user-chosen point.

### Reset and parent settings (recommended R1 defaults)

Use a clearly separated parent area with deliberate entry and explicit destructive
confirmations. A mandatory PIN with erase-everything recovery is unnecessary for
this initial personal app; this area is not claimed as strong access security.
An optional PIN can be specified later if accidental changes become a real problem.

| Action | Changes | Preserves |
|---|---|---|
| Reset appearance | Equip the default outfit, board and piece theme | Owned/unlocked items, awards, learning progress, games, Legacy, audio/language settings |
| Reset learning progress | Clear puzzle/scenario completions and their resume checkpoints | Earned items/awards, games and Legacy; re-completion cannot duplicate an award |
| Clear game history and statistics | Clear detailed games, current bot game, result ledger and Legacy, with an explicit loss summary | Puzzle/scenario progress, wardrobe/awards and preferences |
| Start completely fresh | Clear all learner data, awards, inventory additions, checkpoints and preferences; restore starter defaults | Bundled app/content and licences; this is not a service-worker/cache uninstall |

There is no separate destructive "remove earned clothes but retain awards" action.
All reset actions must invalidate pending saves/session work before completion so
late writes cannot resurrect erased data. Failed reset must not claim success.

### Legacy: successive blocks of 100 games

Requested 2026-10-06: a historical screen comparing the first 100 games, next
100, and so on. Proposed R1 measure is chess score percentage:
`100 * (wins + 0.5 * draws) / completed games`, alongside wins/draws/losses.
Show a partially filled current block, labelled e.g. "Next 100: 27/100 games".
Abandoned games and puzzle attempts do not fill a block; resignations do.
Show bot difficulty/help breakdown so changing opponents or assistance is not
misrepresented as a like-for-like strength improvement.

Derive blocks and lifetime totals from the compact ledger. Detailed records and
ledger updates must be coherent and revision-safe; retries must not add a game
twice. A takeback that reopens a terminal game temporarily removes its result
and recalculates affected blocks; completing it again updates the same ID and
stable first-completion order. Pruning replay detail does not alter the ledger.
Test the 99/100/101 and 199/200 boundaries, partial blocks, result corrections,
repeat writes and pruning. Explicit statistics/reset-all actions must explain
that they erase Legacy too; resetting appearance must not erase it.

The user suggested an average Elo as a possible block measure. This remains
an open rating-design decision: current bot presets are not calibrated ratings.
Do not label score percentage, engine Skill Level or a made-up conversion Elo.
If a local rating is introduced later, specify its method, calibration limits,
algorithm version and which per-game rating is averaged; historical unrated
blocks remain unrated unless a justified backfill method is agreed.

## 5. Ordered milestones and acceptance gates

M0 is a short readiness gate. Approve the plan/defaults and authorise one coding
milestone at a time. M1 can start without downloads or application screens after
M0. Focused Phase 3B review/device acceptance must resolve before relying on its
controls in M4; unrelated puzzle domain work need not wait for a deployment.

| Milestone | Bounded output | Acceptance / dependency |
|---|---|---|
| M0 - readiness and contracts | Record approved D1-D5 choices; reconcile build-spec Kids exceptions and old phase order; define module locations and test fixtures; record Phase 3B review path and model/reviewer selection | No application change. Spec amendment explicitly allows Kids practice/cosmetic milestones while preserving section 26/53 boundaries. No implied merge or deployment |
| M1 - puzzle domain | Headless PuzzleSession, validated record contract, narrow ChessGame extensions, six synthetic local test fixtures | All M1 checks below pass. No UI, storage, engine refactor or acquired content |
| M2 - local records | Versioned local repositories, validation/migration, checkpoint/result/award transaction contracts, failure handling | Reload restores valid records; corrupt/unsupported data isolated; failed writes never claim success; resume and result reconciliation tested |
| M3 - complete puzzle slice | Kids entry, board reuse, all puzzle states/hints/retry/replay, 30 validated source positions, puzzle persistence | Real UI to reopen-offline journey; legal alternatives/defences and hint progression verified; physical iPad mini portrait/landscape; explicitly internal slice |
| M4 - guided bot play, review, stats | Reuse reviewed controls; preview/cancel/commit, resume, history/replay, compact result ledger and Legacy summaries | Exact player-decision undo; stale replies blocked; promotion/engine failure/Black start; cancel leaves history unchanged; result counted once; Legacy survives replay pruning and reconciles corrections; adult regressions pass |
| M5 - practice and library growth | 200 release puzzles plus 12 reviewed opening/middlegame/endgame scenarios | Every published record passes its goal/branch checks; London has responses/plans, not a single compulsory script; repeats and exhausted bands work |
| M6 - cast, wardrobe, milestones, themes | Approved animal assignments and Freja artwork, starter/earned items, three boards and second piece set | Provenance clear; equip preview/cancel; rewards deterministic/permanent; hints/repeats do not duplicate awards; all themes keep pieces/markers legible |
| M7 - audio and offline assets | Verified effects/music, independent controls, saved preferences, cache manifest/budgets | Deliberate audio start; background pause; mute works without narration; offline audio/graphics/content available after readiness; update cannot seize active play |
| M8 - release acceptance | Complete integration, parent/settings/licences/privacy documentation, device checks and review report | Release criteria below plus independent review. User release approval separate from commits/merge/deployment permissions |

### M1: the first bounded coding milestone

Entry: plan approval, relevant D1-D5 defaults accepted for this slice, M0 spec
reconciliation and explicit authorisation to implement M1. Models are chosen
before coding; this plan does not choose one on the user's behalf.

Deliver:

- A puzzle-session API to load validated content, submit a move, request the
  next hint, retry/restart, advance an opponent reply and obtain replay snapshots.
- Six synthetic fixtures testing: immediate mate, mate-in-two with multiple
  first solutions, branching defences, legal unsuccessful attempt with a verified
  refutation, explicit capture objective, and promotion. Fixtures are test data,
  not an authored replacement for the licensed release content library.
- Transitions: ready/player-turn, opponent-turn, attempt-unsuccessful, complete,
  invalid-content. Transient attempted/preview positions never corrupt the retry
  checkpoint. Hint index and replay cursor do not become chess state.

Acceptance:

1. Illegal input leaves authoritative FEN/history/checkpoint unchanged.
2. Every legal winning alternative in the mate fixtures is accepted; every legal
   defence after an accepted first move has a verified mating continuation.
3. Qh4+/Kg8-style counterexamples fail the objective for a verified reason, not
   because they differ from the stored line. Invalid/incomplete records fail
   closed and offer no invented explanation.
4. Retry restores the missed decision; restart restores the start; no stale
   opponent reply applies after either. Promotion choices remain distinguishable.
5. Three on-request hints refer to the current decision and an accepted branch;
   requests do not change the board, reduce access or complete the objective.
6. Completion and replay are distinct; replay snapshots are read-only and do
   not generate completion/award events again.
7. Domain unit tests, existing `npm test`, `npm run lint`, `npm run build` pass;
   any shared-domain change has adult regression coverage. Provide a concise
   diff and exact results, then stop at the milestone gate.

Excluded from M1: React screens/routes/styles, IndexedDB, character/audio assets,
network/content downloads, dependencies, bot changes, commits and deployment.

## 6. Content and asset pipeline

### Chess content

1. Select an appropriately licensed official export/source with authorised
   acquisition. Lichess is the existing build-spec candidate, not an already
   downloaded Kids library. Record source URL, author/licence, version/date,
   original IDs and source-byte hashes. Avoid scraping game/puzzle pages.
2. Normalise source-position semantics. For sources with an opponent setup move,
   apply that move through ChessGame before defining the player's starting FEN.
   Test this explicitly; retain original source and transformations.
3. Versioned record contract: stable internal/source IDs, start FEN, side/objective,
   accepted decision/defence branches, three hints per decision, factual
   explanations/refutations, theme/challenge band, content version and provenance.
   Keep display line distinct from complete accepted-branch information.
4. Validate standard positions and every move/terminal goal offline during
   preparation. Mate-in-two requires searching all legal player moves and every
   legal opponent defence, with a mating continuation for each defence of an
   accepted move. One engine best move or a canonical PV is insufficient.
5. Capture tasks specify piece/target and success at the validated capture; do
   not claim a capture wins material. More complex tactics/scenarios require
   explicit reviewed objectives, branch/end conditions and verified feedback.
   Pin/fork practice may ask to create the named feature rather than assert an
   unproven material win. Opening alternatives use an authored lesson contract,
   with neutral retry copy rather than declaring all other legal chess bad.
6. Use bounded preparation jobs and validation reports. If proof/coverage is
   incomplete, reject the entry; do not label a valid unrecognised move wrong.
   Runtime uses prepared branch data and domain legality, not remote analysis.
7. Human review checks hints, explanations, challenge bands and source rights;
   deterministic output manifests preserve IDs and hashes across updates.
   Test malformed records, promotions, noncanonical wins and defensive branches.

### Graphics and audio

- Preferred graphics: [Kenney Animal Pack Remastered](https://kenney.nl/assets/animal-pack-remastered).
  Candidate UI assets: [Kenney UI Pack](https://kenney.nl/assets/ui-pack).
  Official pages checked 2026-10-06 list CC0. Preserve package licence/source
  evidence at acquisition; choosing the animal pack does not prove it supports
  layered dress-up. M6 must define anchors/layers and any permitted adaptations.
- Keep cburnett provenance and GPL notices. Identify the exact screenshot piece
  set and verify rights, or approve the existing licensed fallback. Do not trace
  or extract branded screenshot artwork as the production set.
- Freja needs her own original or appropriately licensed depiction. Her mythic
  identity is the request, not permission to copy a modern artist's illustration.
- Asset catalogue stores stable ID, author, source, exact licence, attribution,
  permitted adaptations/redistribution, modifications, checksum, file sizes and
  offline-cache inclusion. Track original and derived files separately.
- Music is a separate per-track check: exact provider/track/author, licence text,
  looping/edit permissions and offline redistribution. 'Free' and a platform
  name are not licence evidence. No streaming or runtime speech service assumed.
- Sanitise static SVGs before bundling; exclude scripts/external references.
  Serve local files through existing asset mapping; no CDN or CSP allowances
  added just to load art. Review real build output against production headers.
- Proposed extra compressed asset budget: 10 MiB for content/graphics/effects,
  10 MiB for music, excluding the already vendored engine. Measure actual
  transfer, cache storage and cold launch on target devices before acceptance.
  Exceeding a budget requires explicit revision, not silent partial offline support.

## 7. Release acceptance criteria

Each milestone verifies offline readiness for its own assets, rather than deferring
new puzzle data caching until the audio milestone. Check real build manifests and
file-size limits, and test a fresh installed cache with networking disabled.

- Every requested R1 feature in section 2 has a working screen and acceptance
  evidence; deferred features are explicitly labelled in the plan, not teased as
  available UI. Core puzzles/games require no wardrobe reward or beginner lesson.
- Puzzle legality, alternatives, all required defences, hints, refutations,
  retry/checkpoints, promotion and repeat access pass domain/UI tests.
- Bot preview never commits before confirmation; factual attacks are clearly
  limited guidance. Undo/resume/error recovery and stale-worker protections pass
  real-engine tests. Replay cannot mutate a live game or duplicate a result.
- Reopen restores accepted local progress/preferences. Failures/corruption show
  truthful status and allow current-session play. Stats reconcile reopened
  results, resignation and rematches; grants/resets follow approved award rules.
- Wardrobe works before achievement; themes preserve contrast and both colours;
  character humour supports the player. Names/character gender do not imply strength.
- All bundled content/art/audio have provenance and redistribution evidence.
  Included notices, About/Licences/Privacy, README and applicable build-spec
  amendments accurately describe the shipped behaviour.
- Fresh install and fully cached Airplane Mode both tested on physical iPad mini
  in portrait/landscape, plus phone regression checks. All new assets load offline;
  no external gameplay requests; audio starts deliberately and stops in background.
- Touch targets, keyboard navigation, promotion/confirmation focus, reduced
  motion, loading/error/empty/unsaved states and long translated copy are checked.
- Production base-path paths and CSP work with real built assets; pending updates
  are offered without replacing an active game. Cache/launch budgets measured.
- Run `npm test`, `npm run lint`, `npm run build`, `npm run test:e2e` and
  `npm run test:engine` at integrated release acceptance. Earlier milestones run
  affected checks; repeated broad testing needs a changed risk/failure to justify it.
- Independent review and physical acceptance recorded separately from Codex's
  implementation checks. Tests passing is not merge, deployment or release approval.

## 8. Five product decisions to approve

The defaults make the sequence executable, but are recommendations until approved.
Within each row, accept the package or state the specific change. Asset licence
verification, proof correctness and model/reviewer selection are engineering
readiness gates, not additional unresolved product questions.

| ID | Material decision | Recommended default | Needed before |
|---|---|---|---|
| D1 | Launch language and narration | English R1, translation-ready content/copy; Norwegian later; no narration R1 | M1 content contract / M3 copy |
| D2 | First-release breadth and content size | Full R1 table through M8: 200 puzzles, 12 practice scenarios, quantities/budgets above; app-update replenishment | M0 scope approval; M3 acquisition |
| D3 | Help and recovery behaviour | Three optional hints confirmed; approve immediate retry plus optional escape demo, missed-decision checkpoint, manual replay, preview-help off initially and factual attacks only | M1 puzzle rules; M4 guided play |
| D4 | Learner, storage and server responsibilities | One unnamed local learner; one active game + puzzle; 100 detailed replays plus compact lifetime results and requested 100-game Legacy blocks; score percentage proposed, Elo unresolved; offline R1 core, connected additions evaluated separately; no R1 sync/backup; separated parent area, no mandatory PIN, explicit reset matrix above | M2 schema and M3 settings; content-version resume and reset-race checks required |
| D5 | Character, reward and asset defaults | Named cast incl. Freja; one dressable animal with 6 starter/3 earned items; grants for first completed game regardless of result, 5 distinct solved puzzles, first completed scenario; hints count, repeats do not; licensed cburnett fallback until exact set verified; 3 board palettes/1 additional set; effects on, music off initially | M2 award contract; M6/M7 production assets |

Do not silently drop music if licensing fails or omit Freja because the animal
pack lacks her: resolve the asset gate or approve an explicit release change.
Exact species assignments and garment shapes can be reviewed within M6 without
reopening the whole plan. Backend/sync, multiple learners or a different language
choice alter contracts and must be resolved at the indicated entry gates.

## 9. Optional connected learning - evaluate without delaying core work

These are candidate extensions, not new R1 dependencies or approved integrations.

- Curated videos: parent-selected lessons with a finite library and deliberate
  playback. Prefer licensed local files or a controlled player where feasible.
  An external embed is a separate data flow, not equivalent to bundling a file;
  inspect requests, cookies/storage, links, ads, recommendations and playback
  behaviour. Do not load a third-party player before explicit playback. Do not
  claim control over recommendations/advertising unless actually enforceable;
  reject that delivery method if it cannot meet the product principle.
- Chess explanation candidate: [QUEEN paper](https://arxiv.org/abs/2610.03695)
  and [author repository](https://github.com/queen-project/queen), inspected
  2026-10-06. The paper describes a 4B chess-language model; its playing-strength
  estimate is from engine matches, not evidence of child-teaching suitability.
  The repository describes an early Python/GPU inference setup with further
  documentation pending. iPad/browser execution, deployment cost and a usable
  hosted API have not been established. Do not promise direct PWA integration.
- First evaluate explanation tools on synthetic/public licensed positions, not
  family games. Check exact code/weight licences, output accuracy, suitable tone,
  response time, hardware/cost and operational data handling. A useful initial
  role could be preparing explanations for adult review and offline bundling.
  A later optional "Explain this position" action could use parent-controlled
  inference, subject to an agreed data flow; neither path is implemented now.
- For any live service, specify exact request fields, recipient/hosting,
  authentication, retention/logging, provider training policy, cost limit and
  failure/off switch. Propose chess-position data plus a fixed prompt; do not
  attach child identity, behavioural history or unrestricted conversation by
  default. Minimal payload does not remove transport metadata/logging concerns.
  No client-side secret keys. A secret-bearing service needs a separately agreed
  trusted boundary rather than an unnoticed change to static hosting.
- ChessGame remains authoritative; a tutor cannot directly change the board or
  award puzzle success. Validate proposed moves and variations. Engine checks
  do not prove every sentence of an explanation true. Start with bounded chess
  questions and explicitly test incorrect/misleading explanations and failures.
- Parent enables each feature; explain plainly when it needs a connection and
  what is sent. Avoid repeated enablement prompts. Turning it off leaves a full,
  useful chess app. No engagement optimisation or unsolicited contact is added.

## 10. Approval and immediate start boundary

Approve or amend D1-D5 and this sequence. Then authorise M0 readiness and M1 only.
M0 reconciles old spec non-goals (notably lessons/achievements) and phase order
with the approved Kids scope; the old 5,000-puzzle adult target does not override
D2. Record implementation/review model choice and Phase 3B review requirements.
At the end of M1, review its diff, test evidence and domain contract before
starting local persistence or screens. No additional standalone mockup is needed.

The earlier planning work read public research pages for the QUEEN candidate;
no models/assets were downloaded, no gameplay data sent and no service deployed.

## 11. M0/M1 delivery and verification - 2026-10-06

M0 completed the actual repository check and the section 54 build-spec amendment.
M1 implements `src/puzzles/PuzzleSession.ts`, `puzzleTypes.ts` and
`validatePuzzle.ts`, with API details in `src/puzzles/README.md`. ChessGame has
only additive `legalMoves()` and history-preserving `projectMove()` methods.
Adult UI/engine/route/CSP/PWA configuration and dependency files are unchanged.
Existing brief/storyboard files and prior working-tree changes are preserved.

The record boundary accepts schema-v1 data, validates optional opponent setup,
and prepares mate-within-one/two or explicit capture goals. All winning
alternatives and all required defences are covered; reachable decisions require
three coherent authored hints. Work is limited to 50,000 evaluated moves/edges
and 512 authored decision entries. Failures have verified counterexamples where
one exists. Preparation is synchronous and intended for build/preload use when
real content is added, not React rendering or repeated player taps.

Six named synthetic fixtures cover immediate mate, alternative first solutions,
branching defences, Qh4+/Kg8 failure with source setup, a target capture and
capture-promotion. The test-only direct-chess.js oracle independently enumerates
winning branches. Additional corner checks cover Black to move, en passant,
corrupt/incomplete content, missing off-display hints, malformed input, budget
exhaustion, stale reply tokens, detached snapshots, replay and one-shot completion.
This is implementation verification, not an independently reviewed content pack.

Final checks:

| Check | Result |
|---|---|
| `npm test` | 11 files, 266 tests passed; exit 0 |
| `npm run lint` | Passed; exit 0 |
| `npm run build` | Passed; exit 0; 55 modules, 20 precache entries |
| `npm run test:e2e` | 8/8 existing Chromium cases passed, including offline computer play and practice controls; exit 0 after manual Vite teardown |
| `npm run test:engine` | 6/6 real Worker/WASM cases passed; exit 0 after manual Vite teardown |

The initial focused run exposed three five-second test timeouts, not incorrect
behaviour. Avoiding unnecessary reconstruction at final mate leaves fixed them
without changing global test timeouts; the final full unit run passed. Typing
errors in test helpers were corrected before final lint/build.

Both browser commands reported all cases passing but stalled in automatic server
teardown. Read-only process inspection confirmed the two Vite processes belonged
to these runs; stopping only those processes allowed both commands to exit 0.
Their reported 31.1/30.5 minute durations include the stall, not engine/test case
execution. This is not evidence of unattended clean runner teardown; investigate
that environment behaviour separately if it recurs. No runner configuration was
changed. The final projection input guard was covered by the final unit/lint/build
run; earlier browser cases exercise unchanged adult callers.

M2-M8 remain unstarted. No dependencies, downloads, integration, external upload,
commit, merge or deployment occurred during the M0/M1 implementation run.
That run did not include separate review or physical iPad/iPhone acceptance.
The subsequent review is recorded below. Broader D1-D5 choices,
including Legacy/storage/resume/reset, remain for their later milestone gates.

### Separate review and correction verification - 2026-10-06

Read-only review covered the proof/record boundary, session transitions,
completion/retry/replay and additive ChessGame APIs. One P2 issue was found:
inconsistent FEN castling/en-passant metadata could reach chess.js evaluation.
The correction checks the original metadata before domain evaluation for both
start and source positions. It adds 27 regressions; implementation verification
reports 293/293 unit tests, lint and build passing. An initial oracle-test timeout
was resolved before the successful rerun; no global timeout was increased.

Separate fix review inspected the guard/tests and independently reproduced
rejection of both reported malformed FENs at both boundaries, plus preservation
of all four valid castles and White/Black en passant. No remaining M1 review
blocker was found. The reviewer did not rerun the full suite/browser commands.
Physical acceptance and the earlier browser teardown limitation remain separate.

Workflow hygiene uses `codex/kids-puzzle-foundation`, based on `bf5ef98`; the
branch includes the unmerged Phase 3B controls ancestry. M2 needs its own
authorisation. Local chat context and generated screenshots are excluded from Git.

## 12. M2 delivery and verification - 2026-10-06

After the separate M1/P2 review, the user authorised M2 only with its recommended
defaults. Section 55 records that bounded spec amendment. Native IndexedDB
repositories in `src/storage/` implement separate versioned records for settings,
detail/compact ledger, progress, checkpoints, awards/evidence and wardrobe.
See its README for schema, migration, revision and transaction contracts.

Record validation uses ChessGame for FEN/move/outcome reconstruction, sharing the
reviewed raw metadata guard. Checkpoints retain content ID/exact version, session
ID, start FEN, accepted UCI path and decision ply; matching puzzles resume through
M1, changed content restarts and removed content returns selection. Scenario
recovery requires a trusted branch adapter; actual scenarios remain M5 work.
Content activation is caller-controlled, not automatic.

Atomic writes reconcile revised game results under stable first-completion order,
retain a compact ledger after pruning replay detail to 100, and grant the default
three milestones using permanent distinct-ID evidence. Reset learning preserves
awards/inventory; all four reset actions follow the matrix above. Reset invalidates
local tokens immediately and persisted peer tokens on commit, preventing late
resurrection. Explicit fresh-start can recover incompatible record metadata;
failed resets/writes never report saved success. Unsupported records are retained
and diagnosed; supported v1 migrations are explicit and transactional.

| Check | Result |
|---|---|
| `npm test` | 13 files, 325/325 passed; exit 0; 35.31 seconds |
| Focused storage tests after final migration assertion | 32/32 passed; exit 0; 11.76 seconds |
| `npm run test:storage` | Six real IndexedDB cases in managed Chromium passed; exit 0; 2.1 seconds; clean server teardown |
| `npm run lint` / `npm run build` | Both passed; exit 0; build 55 modules, 20 precache entries |
| Diff/runtime scope | `git diff --check` passed; existing adult runtime source unchanged; built application hashes unchanged; no storage/harness in bundle |

Tests cover reload/coexisting checkpoints, corruption/future versions, failed
transactions/migrations/resets, stale and conflicting revisions, repeat/versioned
completions, terminal reopening/re-completion, permanent rewards, reset races
across instances, and Legacy boundaries 99/100/101/199/200 with corrections/pruning.
Native tests inject write failures to check real transaction rollback; they do
not simulate actual device storage eviction or establish iPad quota behaviour.
The new test-only runner owns Vite in-process and closes cleanly; existing E2E
and engine runners are unchanged and were not rerun for this headless slice.

No new dependency or lockfile change. No app/engine/chess refactor, M3 UI, acquired
content/assets, external integration/upload, commit or deployment. M2 is not yet
independently reviewed or physically accepted. Stop for a separate M2 review;
further milestones need new authorisation. No release scope is implicitly accepted.

### M2 review correction follow-up - 2026-10-06

The separate review reported two P2 issues: checkpoint resurrection/duplicate
completion deleting a newer replay, and generated prefixed evidence exceeding
the source-ID validator limit. This follow-up fixes only those issues.

New completion intents require the session ID. Matching ID/version/session and
a newer checkpoint revision are required for cleanup. Exact duplicate completion
returns without mutation. Slot high-water marks and closed-session receipts are
validated records in the existing metadata store; they survive checkpoint deletion,
reload and peer connections. Intentional repeats use a new session ID and newer
revision. Legacy stored progress remains readable and provides its revision floor;
no missing session identity is invented. Learning/fresh resets clear lifecycle
records under a new durable reset epoch. No IndexedDB layout/store change.

Source IDs stay capped at 200 characters; award evidence validates its namespace
and source separately, permitting up to 209 characters for `scenario:` evidence.
Generated evidence/grant/lifecycle records are validated before insertion.
Overlong/invalid IDs and failed completion writes leave all records unchanged.

Verification: `npm test` 340/340 in 14 files (38.63 seconds), native storage
13/13 (3.6 seconds, clean teardown), lint/build and diff check passed, all exit 0.
Added 15 focused unit cases and seven native cases; updated existing completion
tests to supply session IDs. Adult runtime/bundle remains unchanged. This is
implementation verification; separate fix review and physical acceptance are
pending. No dependencies, commits, deployment or M3 work.
