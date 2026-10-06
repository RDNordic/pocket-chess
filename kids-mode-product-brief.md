# Kids Mode - product and UX brief

Date: 2026-10-05
Status: revised discovery brief. Requested features are distinguished from
proposed UX and delivery choices; the complete build scope is not yet agreed.
This document does not authorise implementation or replace the build spec.

## Product intent

Clarification 2026-10-06: the aim is a joyful personal app under parent control,
not isolation from every useful external resource. Licensed third-party tools,
selected expert videos and chess explanation APIs may be considered with explicit
content/data-flow decisions. Preserve a complete offline core; exclude sales
pressure, artificial scarcity, unsolicited marketing, stranger matchmaking and
engagement manipulation. Celebrate learning and creativity without making the
child feel obliged to return. This permits evaluation, not unspecified uploads
or automatic integration; see plan-build.md's connected-learning section.

A private, colourful chess companion for an independent, motivated young
player: solve puzzles without access limits, play and review bot games,
practise different stages of chess, and personalise the experience.
Parents control setup and data. The existing adult experience stays available.

The requested product direction includes unrestricted puzzles, openings,
middlegame and endgame scenarios, supportive move guidance, bot play, undo,
review, rematch, local statistics, avatar dress-up, board colours, alternative
piece sets, sound effects and background music. Milestone-based cosmetic
rewards are a user-suggested option to develop, not a final reward system.
The first release boundaries remain undecided.
ChessKid is an appeal/UX reference only; use original or appropriately licensed
artwork, wording and learning content. Keep family details out of this document.

Success means a child can find an activity, understand what to do, recover
from a mistake and stop comfortably. It is not measured by time spent,
daily returns or competitive ranking. Evaluate through voluntary observation
and discussion, not application telemetry.

## Proposed audience and interaction

Design primarily for a confident reader who already plays independently
and has some opening knowledge. Use real chess vocabulary, meaningful
explanations and optional deeper reading. A playful presentation should
respect the player's competence and avoid babyish language or compulsory
introductory lessons. Reading ability does not establish chess strength;
let the player choose suitable challenges and adjust after real use.

English and Norwegian are both viable language choices; launch language(s)
and translation scope remain undecided. Narration is optional enrichment,
not a prerequisite for the primary player. Basic piece exploration remains
available for beginners or younger users without defining the main journey.

Design on iPad mini first, in portrait and landscape. Maintain phone support.
Use familiar piece silhouettes, generous touch targets and tap-piece then
tap-square interaction. Dragging must not be required. Combine symbols,
short text and demonstrations; do not rely on colour or audio alone.
Support keyboard use and reduced motion. The board remains visually clear
even if the surrounding world is richly illustrated.

## Proposed child home

Proposed home: prominent Puzzles and Play actions, with Practice and My corner
as secondary destinations. Preserve illustrated character and warmth while
making direct access to chess the priority.

| Destination | Child's intention | Proposed contents |
|---|---|---|
| Puzzles | "Give me a challenge" | Mate in two, captures and other tactical themes; difficulty choice |
| Play | "I want a game" | Local bots, help settings, undo, rematch and access to saved games |
| Practice | "Help me understand" | Openings, middlegames, endgames and optional piece basics |
| My corner | "See my progress; make it mine" | Statistics, milestones, wardrobe, board and piece themes |

Show one optional "Continue learning" action when useful, while keeping free
choice. Use visible labelled controls rather than hidden scene hotspots.
Avoid an extensive map of locked levels and unfinished destinations.
Bot games are a core requested activity. Evaluate the existing engine levels
with the intended player; do not infer suitable difficulty from age or labels.

Parent settings have a consistent, separate entry. The parent chooses whether
the app starts in adult mode or Kids Mode. Leaving an active activity must
have predictable behaviour; progress should survive a return to the home.

## Requested chess experiences and proposed behaviour

### Unrestricted puzzles

No daily quota, subscription gate, energy system or reward requirement.
"Unlimited" means unrestricted attempts and replay, not a promise of infinitely
many unique offline positions. Specify library size, variety, difficulty bands,
repeat handling and content updates in the build plan. Continue offering
puzzles after the unseen pool is exhausted, with honest repeat labelling.

Include mate in two, capture/win-a-piece tasks and a progression of tactical
themes. Separate a simple capture exercise from a tactic that actually wins
material; a legal capture alone does not establish the latter. Use reviewed
positions and verified solutions, including valid alternatives where applicable.
Offer progressive hints, retry, explanation and replay. Do not treat every
legal move outside a stored line as illegal or necessarily bad chess.

### Openings, middlegames and endgames

Make these visible product areas, not indefinite extras. Proposed initial
opening: the London System, with plans, typical development and responses to
different opponent moves rather than one rigid sequence. Middlegames can
cover loose pieces, forks, pins, exchanges and king safety. Endgames can cover
basic mates, king activity and pawn promotion. Exact lessons and counts need
agreement; examples here do not commit the first release to every topic.

### Bot games and guidance

Provide legal-move indicators, undo/takeback, restart/new game, rematch and
saved-game review. Reuse the established computer-game controls after their
outstanding review/acceptance is resolved. Specify interrupted-game resume
as part of the game-saving plan rather than assuming it already exists.

Requested guidance includes seeing threats when considering a move. Proposed
UX: an optional Preview help setting lets the player select a legal destination,
inspect the resulting position and then choose Play move or Cancel. Show
direct attacks on the moved piece and newly exposed friendly pieces, with
clear attacker/target cues and a short explanation. Keep the real position
unchanged until confirmation; a cancelled preview does not count as a move.

Distinguish legal destinations, attacked squares and tactical evaluations.
An attacked piece may be defended or deliberately sacrificed; being attacked
is not proof that a move is wrong. A legal king move cannot leave its king
in check. Direct-attack guidance must not claim to find every fork, pin or
forced sequence. Deeper advice, if included, needs a separately specified
bounded local-analysis feature. Define pinned-piece/king/pawn semantics and
test them in the chess domain before shipping threat indicators.

Help levels are proposed, not final: legal moves only; legal moves plus preview
warnings; optional hints. Full-game guidance and puzzle hints need separate
settings so a puzzle does not reveal its solution automatically. Let a player
make a legal move despite an advisory warning. Keep positive feedback specific
and truthful: explain an observed idea or completed task, without declaring
every move excellent. Help, undo and losses must not trigger shaming messages.

### Game review and statistics

Save games locally and provide move-by-move replay with forward/back and
return-to-start controls. Basic review means reliable replay; automatic
mistake analysis and suggested better moves are a distinct scope decision.

Show games played, won, lost and drawn against bots, with optional breakdown
by bot difficulty. Proposed counting: completed games contribute once;
resignation counts as a result, abandonment is separate, and rematch is a new
game. Define takeback/reopened-result handling before implementation. Retain
help/difficulty metadata so later comparisons are meaningful, without treating
assisted play as lesser achievement. Statistics are private, on-device records,
not telemetry, public ranking or an asserted chess rating.

Legacy screen requested 2026-10-06: preserve comparative summaries for games
1-100, 101-200, and subsequent blocks, plus the current partial block. Keep
compact outcome records after older move-by-move replays are pruned so lifetime
progress does not disappear. Proposed first measure: score percentage (a win
counts 1, a draw 0.5), with wins/draws/losses and difficulty/help breakdown.
The suggested average Elo needs a separate rating design; current bot presets
are not calibrated Elo. Do not present score percentage as a chess rating.
See plan-build.md for proposed ledger, correction and reset behaviour.

## Proposed first complete journey

1. From home, choose Puzzles and a theme such as mate in two; no basic lesson
   or avatar setup is required first.
2. Inspect the position and play. A hint is available on request. Correct
   continuation triggers the verified opponent reply and the next decision.
3. A mistaken attempt offers a useful explanation and retry without losing
   access, lives or already completed work. An illegal move leaves state intact.
4. Complete the puzzle, see why the sequence works, and optionally replay it.
   Offer another puzzle and return home without automatically starting either.
5. If an agreed milestone has been reached, show the earned accessory with
   Equip now and Later. Completion remains satisfying without an unlock.
6. Reopen offline: completed progress, wardrobe and preferences are retained.

A second essential UX journey is Play bot -> preview an intended move -> play
or cancel -> undo -> finish -> view result/statistics -> review or rematch.
Both journeys should be sketched before implementation. The first prototype
should test the puzzle loop and move-guidance interaction, replacing the earlier
rook-first proposal; its exact implementation boundary remains to be agreed.

## Avatar and motivation proposal

The user is interested in winning clothes/accessories at achievement milestones.
Propose a useful starter wardrobe plus predictable, permanent cosmetic unlocks.
Possible milestones: finish a first game, solve a set of distinct puzzles,
complete an opening practice, or demonstrate an endgame skill. These examples
and thresholds are not final. Include progress achievable without winning games.

Explain unlock criteria up front. Decide how hints, repeats, resets and imported
progress affect awards; never silently remove an earned item. No clothing should
gate chess content. Propose no currency, purchases, random rewards, countdowns,
streak pressure or penalties for absence. Celebrate learning as well as results.

Visual direction updated 2026-10-06: bright colours, soft shapes and contours,
with Kenney Animal Pack Remastered as the user-preferred character asset pack.
No assets have been downloaded; specific animals, adaptation for dress-up and
the surrounding setting remain to be agreed. Keep costumes off the chess pieces
so learning their identities stays clear. The overall look should feel
imaginative and substantial rather than aimed only at toddlers.

Character naming direction confirmed 2026-10-06: ordinary, affectionately silly
names, approximately half female and half male. Requested examples include
Gary, Steven, Frank, Tony, Karen, Silly Susan and Negative Nelly. These are
fictional character names, not learner names or a request for personal profiles.
The proposed eighth character is Freja, the Norse goddess represented as
herself, replacing Brenda. She is distinct from the animal cast, not an animal
given her name. Her visual treatment remains to be designed.
Use small comic personalities to make the cast familiar. Proposed treatment:
the humour concerns the characters' own quirks, not the player's mistakes or
chess ability. Negative Nelly can worry comically about picnic weather while
remaining supportive during chess. Exact roster, species, roles and copy are
still proposals; do not tie names or genders to bot strength or achievement.

## Board, pieces and audio

Board colour choice and multiple piece sets are requested features, including
child-friendly designs. Keep a familiar classic set, distinguish both sides
clearly and preserve recognisable piece identities at small sizes. Theme
colours must retain readable squares, selection, legal-move and threat markers;
propose curated palettes first rather than unrestricted colour combinations.

Sound effects and background music are requested. Propose independent on/off
and volume controls, an obvious mute and saved preferences. Keep effects gentle,
avoid harsh failure sounds, and offer quiet optional music that does not mask
feedback. Decide initial audio defaults together. Start audio through a deliberate
user interaction and pause it when the app is backgrounded. Bundle licensed or
original assets for offline use; streaming is not an assumed dependency.
Narration remains optional and distinct from these confirmed audio requests.

## Proposed scope ladder

| Stage | Purpose and proposed boundary |
|---|---|
| UX agreement | Agree this brief, screen sketches, interaction states and visual direction; no application implementation |
| Small prototype | Validate a complete puzzle journey and a move-preview interaction on actual iPad mini; agree exact boundary first |
| Useful release, built in reviewed slices | Uncapped puzzle access; bot games/controls/replay/stats; initial opening, middlegame and endgame content; avatar/themes/audio; local storage and parent settings |
| Later expansion | Broader content, more cosmetics/music and any separately agreed deeper game analysis or sync |

The useful-release row records the requested product target, not permission
to implement everything in one pass. Agree the smallest satisfying release
and its delivery order without quietly relegating requested core activities.

Content counts, narration coverage and asset quantities must be fixed in the
build plan. The existing adult proposal for approximately 5,000 puzzles is
not the Kids Mode content target. Begin with original reviewed exercises and
appropriate curated puzzles, with deterministic validation and provenance.

## Parent controls and local data proposal

Parent setup controls language, launch mode, and local reset. Propose child
access to themes, wardrobe and mute/volume; discuss which settings need a gate.
Separate appearance reset, learning-progress reset, game/Legacy deletion and a
complete fresh start, as defined in plan-build.md. Confirm destructive actions.
Recommended R1 default: a separated parent area without a mandatory PIN or
destructive PIN-recovery path. It is not strong access security. An optional
PIN can be considered if accidental changes prove to be a practical problem.

Start with one local learner unless shared-device use requires multiple
slots. Multiple slots, if chosen, can use preset character icons rather than
names; their exact switching and reset behaviour needs agreement.

Proposed saved data: reconstructable game records and results, bot difficulty
and help settings, puzzle/scenario progress, achievement awards, avatar choices,
board/piece themes, audio/language preferences and an agreed resume state.
Derive result statistics consistently from game records rather than maintaining
unreconciled counters. Retain only progress fields needed for learning/rewards;
avoid recording every tap or listening session. Define retention, record deletion
and their effects on statistics and earned items in the plan.
Local saving is a proposed new capability, not something the app already has.
Explain to parents that device/browser storage can be cleared and is not a
backup. If saving fails, preserve current-session play and clearly show that
progress is not being saved rather than silently claiming success.

## Backend decision to resolve

Proposed default: bundled content and on-device progress for the first release.
No specific server responsibility is established yet.

| Need | Approach to evaluate |
|---|---|
| Puzzles, scenarios, themes, wardrobe and audio | Bundle versioned content and assets with the app; size the offline library explicitly |
| Games, review, statistics and milestones | Store and process on-device; these do not by themselves establish a backend need |
| More content | Initially deliver through app updates; consider parent-initiated static content packs if release cadence becomes a problem |
| Backup | Consider a deliberate parent export/import before introducing hosted storage |
| Cross-device continuity | A separate sync decision requiring identity/access, conflict handling, retention, deletion and offline behaviour |

A content delivery service and a service storing child progress are distinct
decisions. Core learning should remain usable offline after complete asset
caching. Audio, if included, must have an agreed offline asset approach;
runtime cloud speech is not an assumed dependency.

Any changed privacy architecture needs the build spec, README and in-app
About/Privacy updated together before shipping. No deployment, uploads,
accounts, telemetry, social play or network enablement are authorised here.

## Constraints for the later build plan

- Preserve ChessGame as the authority for real chess games and legal puzzles.
  Design an explicit domain model for simplified piece exercises; do not
  weaken game legality to make kingless exercise boards work.
- Keep rule logic out of React, retain local Stockfish and stale-session
  protection, and preserve existing CSP and adult game behaviour.
- Review existing Phase 3B follow-ups and establish the accepted baseline
  before implementation relies on those controls. Current local HEAD is
  bf5ef98 on feature/practice-game-controls-v1; release acceptance is unverified.
- Resolve conflicts with older build-spec non-goals and phase ordering in
  an explicit approved amendment before implementing Kids Mode.
- Define loading, wrong-answer, help, completion, resume, storage-failure,
  offline and update states as part of UX, not after the happy path is built.
- Plan a small implementation slice at a time, with acceptance checks and
  review checkpoints. Choose the implementation model after the plan lands;
  no model selection or cost assumption is final here.

## Proposed acceptance observations

- An independent player can reach puzzles, bot games and practice directly,
  without completing beginner lessons or customisation first.
- Puzzle access continues without quotas, including after the unseen pool is
  exhausted; repeats and assistance are handled as specified.
- Mate-in-two solutions include the opponent reply, valid alternatives are
  handled deliberately, and explanations reflect the actual position.
- Preview can be cancelled without applying a move; threat cues explain their
  limited meaning and never substitute for authoritative move legality.
- Undo, rematch and saved-game replay work; game results affect statistics
  exactly once according to the agreed counting rules.
- A mistaken tap does not lose work or make the child feel punished.
- The child can dress the avatar before completing a challenge.
- Agreed milestones grant permanent items predictably, without locking chess
  content or requiring a streak. Themes keep every piece and marker readable.
- Sound effects and music have independent controls and work offline.
- Learning feedback names an understandable skill, and stopping is easy.
- The board and controls work in both iPad mini orientations without overlap.
- After verified offline readiness, the complete journey and any included
  narration work in airplane mode; saved choices survive closing/reopening.
- Parent settings/reset are separated from child play; adult mode still works.
- Correct exercise rules and correct chess rules are tested in their respective
  domains; implementation checks are not labelled independent review.

## Decisions awaiting discussion

1. English, Norwegian or both at launch; optional narration coverage.
2. Exact move-preview/help behaviour and the depth of game review.
3. Content quantities/difficulty, library replenishment and first-release slices.
4. Character/art direction and milestone rules for earned clothing/accessories.
5. Board/piece selection, music style and audio defaults.
6. Single learner versus multiple local slots; parent gate and recovery.
7. Concrete backend purpose, if any; backup and local retention expectations.

Resolved direction: competent independent reader/player is the primary audience;
puzzles and bot games lead; sound effects/music and local stats are requested.
Language proficiency does not itself choose the application's launch language.

Next: agree the revised product target, then sketch the puzzle and guided-game
journeys, including review/statistics and rewards, before detailed build planning.
