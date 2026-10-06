# Pocket Chess
## Full Build Specification
### Offline-first personal chess trainer PWA

**Status:** Build specification  
**Target:** v0.1 / personal-use prototype  
**Primary platform:** iPhone installed as a Progressive Web App (PWA)  
**Secondary platforms:** desktop and tablet browsers  
**Primary user:** one local user  
**Backend:** none  
**Accounts:** none  
**Network dependency after installation:** none for core functionality  

---

# 1. Product vision

Pocket Chess is a small, privacy-preserving chess application for playing against a local chess engine and practising tactical puzzles.

It is **not** intended to reproduce Chess.com, Lichess, or any other existing chess service. It should avoid social features, subscriptions, advertising, accounts, cloud sync, multiplayer, AI chat, and other scope that is unnecessary for the core use case.

The product principle is:

> **Offline chess practice with no account, no tracking, no subscription, and no nonsense.**

The application should feel good on an iPhone, install from Safari using **Add to Home Screen / Open as Web App**, and remain usable when the device has no internet connection.

---

# 2. Goals

Version 0.1 must allow the user to:

1. Install the application to an iPhone home screen as a PWA.
2. Start and finish a legal game of standard chess.
3. Play as White, Black, or a randomly assigned colour.
4. Play against Stockfish locally in the browser.
5. Choose from a small number of useful computer difficulty levels.
6. Undo or restart a game when playing casually.
7. Save completed games locally.
8. View basic game history.
9. Practise chess puzzles from a bundled local dataset.
10. Track locally which puzzles were attempted, solved, or failed.
11. Work offline after required assets have been cached.
12. Store all personal usage data only on the user's device.

---

# 3. Explicit non-goals for v0.1

Do **not** implement the following unless required to make the core application function:

- user accounts;
- authentication;
- backend API;
- databases hosted on a server;
- multiplayer;
- matchmaking;
- leaderboards;
- friends;
- chat;
- social sharing;
- advertisements;
- subscriptions;
- analytics;
- telemetry;
- crash reporting that sends user data externally;
- cloud synchronisation;
- opening explorer;
- online tablebases;
- large language model integration;
- AI-generated chess advice;
- voice interaction;
- achievements;
- daily streak mechanics;
- gamified currencies;
- lessons or copied instructional material;
- Chess.com/Lichess UI cloning;
- native iOS packaging;
- Android-specific packaging.

These can be reconsidered later only if a concrete user need emerges.

---

# 4. Technical approach

## 4.1 Recommended stack

Use:

- **React**
- **TypeScript**
- **Vite**
- **chess.js** for authoritative chess rules and game state
- **Stockfish 18 WebAssembly build** for computer moves and analysis
- **Web Worker** for Stockfish execution
- **IndexedDB** for game history, puzzle progress, and preferences
- a small IndexedDB wrapper only if it clearly reduces complexity
- **Service Worker / PWA plugin** for offline caching and installability
- **Vitest** for unit tests
- **Playwright** for browser/end-to-end tests

Avoid introducing a state-management framework unless the application genuinely grows beyond React state/context.

Avoid introducing a backend.

---

# 5. Critical engine choice

For the first implementation, use the **Stockfish 18 lite single-threaded WebAssembly build** from the maintained `nmrugg/stockfish.js` project, or an equivalent verified Stockfish 18 browser build.

The reason for this choice is architectural rather than chess strength:

- the lite engine is still dramatically stronger than the intended user;
- the payload is far smaller than the full engine;
- the single-threaded build does not require Cross-Origin-Opener-Policy and Cross-Origin-Embedder-Policy headers;
- that makes deployment to static hosting simpler;
- it reduces Safari/PWA compatibility risk;
- it avoids making GitHub Pages deployment dependent on custom cross-origin isolation headers.

Do not optimise for maximum Stockfish strength in v0.1.

The desired outcome is a responsive local opponent, not a tournament engine benchmark.

### Important

The Stockfish WebAssembly binary must run inside a **Web Worker**.

Never run engine search on the main UI thread.

---

# 6. Architectural boundaries

The application should have five clear layers:

```text
Presentation
    ↓
Application / use cases
    ↓
Chess domain
    ↓
Adapters
    ↓
Local persistence / engine / static puzzle data
```

Suggested responsibilities:

## Presentation

React components.

Responsible for:

- rendering board and controls;
- user interaction;
- loading/error/empty states;
- navigation;
- accessibility.

Must not contain chess-rule logic.

## Application layer

Coordinates operations such as:

- create game;
- make player move;
- request engine move;
- resign;
- undo;
- complete game;
- start puzzle;
- submit puzzle move;
- save result.

## Chess domain

Owns application-level chess concepts and wraps `chess.js`.

Responsible for:

- legal move validation;
- FEN;
- PGN;
- turn state;
- check;
- checkmate;
- stalemate;
- draw;
- repetition;
- insufficient material;
- move history;
- board orientation.

`chess.js` is the authoritative rules engine.

## Engine adapter

Encapsulates every interaction with Stockfish/UCI.

The rest of the application should not know how Stockfish messages are formatted.

## Persistence/data adapters

Responsible for:

- IndexedDB;
- preferences;
- game history;
- puzzle attempts;
- bundled puzzle data.

---

# 7. Proposed repository structure

```text
pocket-chess/
├── public/
│   ├── icons/
│   ├── engine/
│   │   ├── stockfish-18-lite-single.js
│   │   └── stockfish-18-lite-single.wasm
│   └── puzzles/
│       └── puzzles-v1.json
│
├── scripts/
│   └── build-puzzle-dataset.ts
│
├── src/
│   ├── app/
│   │   ├── App.tsx
│   │   ├── routes.ts
│   │   └── AppShell.tsx
│   │
│   ├── chess/
│   │   ├── ChessGame.ts
│   │   ├── chessTypes.ts
│   │   ├── gameResult.ts
│   │   └── __tests__/
│   │
│   ├── engine/
│   │   ├── StockfishAdapter.ts
│   │   ├── UciParser.ts
│   │   ├── engineTypes.ts
│   │   └── __tests__/
│   │
│   ├── puzzles/
│   │   ├── PuzzleSession.ts
│   │   ├── PuzzleRepository.ts
│   │   ├── puzzleTypes.ts
│   │   └── __tests__/
│   │
│   ├── persistence/
│   │   ├── db.ts
│   │   ├── GameRepository.ts
│   │   ├── PuzzleProgressRepository.ts
│   │   └── SettingsRepository.ts
│   │
│   ├── features/
│   │   ├── home/
│   │   ├── play/
│   │   ├── puzzles/
│   │   ├── history/
│   │   └── settings/
│   │
│   ├── components/
│   │   ├── board/
│   │   └── common/
│   │
│   ├── styles/
│   ├── main.tsx
│   └── vite-env.d.ts
│
├── tests/
│   └── e2e/
│
├── LICENSES/
│   ├── STOCKFISH-GPL-3.0.txt
│   └── THIRD-PARTY-NOTICES.md
│
├── package.json
├── tsconfig.json
├── vite.config.ts
├── README.md
└── BUILD_SPEC.md
```

This is a suggested structure, not a requirement to create empty folders before they are needed.

---

# 8. Chess state model

The chess state must have one authoritative source.

Do not independently store piece locations in React state.

A game may be represented at application level as:

```ts
type PlayerColour = 'white' | 'black';

type GameMode = 'computer';

type GameStatus =
  | 'active'
  | 'checkmate'
  | 'stalemate'
  | 'draw'
  | 'resigned'
  | 'aborted';

interface GameSession {
  id: string;
  mode: GameMode;
  playerColour: PlayerColour;
  startedAt: string;
  status: GameStatus;
  engineLevel: EngineLevel;
}
```

The actual board position and move history should derive from the wrapped `chess.js` instance.

Persist games in reconstructable form using:

- PGN as canonical game record;
- final FEN if useful;
- metadata separately.

Do not persist two competing representations of the entire board state unless there is a concrete reason.

---

# 9. Move model

Use UCI coordinates for engine communication and puzzle source data.

Example:

```text
e2e4
e7e8q
```

Use SAN for human-readable move history.

Example:

```text
e4
Nf3
O-O
Qxd5+
```

Conversion should happen through the chess rules layer.

Do not manually implement SAN parsing.

---

# 10. Board UI

A custom board is preferred for v0.1 rather than adopting a large GPL board UI dependency.

The board should:

- display an 8×8 board;
- support touch;
- support mouse;
- allow tap-source then tap-destination;
- optionally allow drag-and-drop if it remains reliable on touch;
- show legal destination squares after selecting a piece;
- highlight the last move;
- indicate check;
- support board rotation;
- automatically orient toward the player's colour;
- render promotion selection;
- block interaction when it is Stockfish's turn;
- block interaction when the game has ended.

### Piece artwork

Do not copy Chess.com assets.

Use either:

1. an appropriately licensed open chess piece set, with licence recorded; or
2. simple original SVG pieces.

Do not spend meaningful implementation time on custom artwork before the game works.

---

# 11. Computer game workflow

## New game

User chooses:

- play White;
- play Black;
- random colour;
- engine difficulty.

Then:

1. create fresh `ChessGame`;
2. initialise Stockfish;
3. configure engine strength;
4. render board;
5. if Stockfish is White, request first engine move.

## Player move

When the user attempts a move:

1. convert interaction into source/destination/promotion;
2. ask chess domain to execute it;
3. reject illegal move without changing state;
4. update visible board;
5. check terminal game state;
6. if game continues, request engine move.

## Engine move

1. send current FEN to Stockfish;
2. request bounded search;
3. receive `bestmove`;
4. validate the engine move through `chess.js`;
5. execute;
6. check terminal game state;
7. return control to player.

Even Stockfish output should be validated at the application boundary.

---

# 12. Stockfish/UCI adapter

Create a small explicit API.

Example conceptual interface:

```ts
interface ChessEngine {
  initialise(): Promise<void>;

  configure(options: EngineOptions): Promise<void>;

  findBestMove(
    fen: string,
    limits: SearchLimits,
    signal?: AbortSignal
  ): Promise<EngineMove>;

  analyse(
    fen: string,
    limits: SearchLimits,
    signal?: AbortSignal
  ): Promise<PositionAnalysis>;

  stop(): Promise<void>;

  dispose(): void;
}
```

The adapter owns:

- Worker lifecycle;
- `uci`;
- `isready`;
- `ucinewgame`;
- `position fen ...`;
- `go ...`;
- parsing `info`;
- parsing `bestmove`;
- cancellation;
- timeout handling;
- engine errors.

React components must never send raw UCI commands.

---

# 13. Engine state machine

Do not treat UCI communication as arbitrary strings flying between components.

Track an explicit engine state, for example:

```text
uninitialised
    ↓
starting
    ↓
ready
    ↓
searching
    ↓
ready
```

Also support:

```text
error
disposed
```

Rules:

- only one active search at a time;
- send `stop` before replacing an active search;
- do not change engine options during search;
- do not send a new position while an old search is active;
- ignore stale search responses using request IDs/tokens;
- terminate/recreate the Worker if the engine becomes unrecoverable.

---

# 14. Difficulty system

Do not claim that the displayed values are calibrated FIDE ratings in v0.1.

Use friendly level names.

Suggested initial UI:

| Level | Label | Intended feel |
|---|---|---|
| 1 | Beginner | forgiving |
| 2 | Casual | developing player |
| 3 | Club | competent |
| 4 | Strong | challenging |
| 5 | Expert | very challenging |
| 6 | Maximum | strongest local setting |

Implementation may use Stockfish options such as constrained engine strength where supported, combined with bounded search.

Before implementing the exact mapping, inspect the selected Stockfish 18 browser build and verify which UCI options are exposed.

Do not invent unsupported UCI options.

Store the mapping in one configuration file rather than scattering magic values through the codebase.

---

# 15. Time controls

v0.1 should default to **untimed casual chess**.

A chess clock is not required for the first playable milestone.

If implemented later, support it as a separate domain feature.

Do not mix UI timer logic into chess legality.

---

# 16. Game completion

Recognise at least:

- checkmate;
- stalemate;
- threefold repetition;
- fifty-move draw;
- insufficient material;
- resignation.

Use `chess.js` capabilities rather than writing custom implementations unless a missing rule is proven.

When the game ends:

1. freeze board interaction;
2. show result clearly;
3. save game locally;
4. allow:
   - rematch;
   - new game;
   - return home;
   - view moves.

---

# 17. Undo behaviour

Because this is a personal training app, undo is acceptable.

For a human-vs-engine game, "Undo" should normally undo:

- the engine's latest move; and
- the player's preceding move;

so that the user returns to their previous decision point.

Do not create inconsistent engine and board histories.

After undo:

- cancel active engine search;
- restore chess state;
- refresh board;
- reset engine using the resulting FEN before the next request.

---

# 18. Puzzle source

Use a curated subset of the **Lichess open puzzle database**.

The Lichess puzzle export is released as **CC0**.

Current source format includes fields such as:

```text
PuzzleId
FEN
Moves
Rating
RatingDeviation
Popularity
NbPlays
Themes
GameUrl
OpeningTags
DailyDate
```

Do not bundle the entire multi-million-puzzle database in the PWA.

Instead generate a compact local dataset as a build-time step.

---

# 19. Puzzle dataset v1

Target approximately **5,000 puzzles** initially.

This is enough variety for a personal trainer while remaining manageable offline.

Suggested filters:

- standard chess only;
- popularity >= a reasonable quality threshold;
- useful rating range, initially perhaps ~600-2200;
- exclude malformed records;
- exclude very long solutions for v0.1 if they create poor mobile UX;
- retain themes;
- retain source puzzle ID;
- retain rating.

Do not scrape puzzle pages.

Use the official database export.

---

# 20. Puzzle preprocessing

Create a build script:

```text
scripts/build-puzzle-dataset.ts
```

It should transform the selected source rows into the application's compact schema.

Suggested format:

```ts
interface Puzzle {
  id: string;
  fen: string;
  moves: string[];
  rating: number;
  themes: string[];
  popularity?: number;
}
```

Lichess defines its puzzle FEN as the position **before the opponent's setup move**.

Therefore puzzle startup must:

1. load the supplied FEN;
2. apply the first move from `Moves`;
3. show the resulting position to the player;
4. expect the second move as the player's first solution move.

This detail should have a unit test because it is easy to implement incorrectly.

---

# 21. Puzzle workflow

Puzzle screen:

1. select puzzle;
2. initialise position;
3. orient board to the side that must solve;
4. wait for player's move;
5. compare legal UCI move against expected solution;
6. if correct:
   - apply opponent response automatically;
   - continue until line complete;
7. if wrong:
   - mark attempt incorrect;
   - allow retry;
   - optionally reveal the expected move.

Do not require Stockfish to solve known Lichess puzzle lines during normal puzzle play.

The published puzzle solution is deterministic source data.

---

# 22. Puzzle selection

v0.1 modes:

- Random;
- Around my level;
- By theme;
- Previously failed.

No cloud rating is required.

Maintain a simple local estimated puzzle level.

Do not build a full Glicko implementation unless needed later.

A basic adaptive approach is enough:

```text
start estimate: 1000 or configurable

correct:
    move estimate slightly upward

incorrect:
    move estimate slightly downward
```

Better calibration can be added after real use.

---

# 23. Puzzle themes

Expose a small curated set first, such as:

- mate;
- mate in 1;
- mate in 2;
- fork;
- pin;
- skewer;
- discovered attack;
- sacrifice;
- defensive move;
- endgame.

The underlying dataset may retain additional themes without surfacing all of them in the v0.1 interface.

---

# 24. Local persistence

Use IndexedDB.

Suggested stores:

```text
settings
games
puzzleProgress
appMetadata
```

## Settings

Example:

```ts
interface UserSettings {
  engineLevel: EngineLevel;
  preferredColour: 'white' | 'black' | 'random';
  boardOrientation?: 'white' | 'black';
  soundEnabled: boolean;
}
```

## Game record

```ts
interface StoredGame {
  id: string;
  startedAt: string;
  completedAt?: string;
  playerColour: PlayerColour;
  engineLevel: EngineLevel;
  result: string;
  pgn: string;
  finalFen: string;
}
```

## Puzzle progress

```ts
interface PuzzleProgress {
  puzzleId: string;
  attempts: number;
  solved: boolean;
  failures: number;
  lastAttemptAt: string;
}
```

Do not store personal information because none is required.

---

# 25. Data lifecycle

All user-generated data is device-local.

Provide:

- clear history;
- clear puzzle progress;
- reset all app data.

No data should be transmitted to R&D Nordic, GitHub, Stockfish, Lichess, or any analytics provider as part of normal application use.

Static hosting will naturally involve ordinary HTTP requests to obtain application files when online. Once cached, gameplay itself should not require remote requests.

---

# 26. Privacy requirements

The application should contain:

- no cookies for tracking;
- no advertising SDK;
- no analytics SDK;
- no third-party tracking pixels;
- no fingerprinting;
- no account;
- no collection of names, emails, device identifiers, or location;
- no external chess request during a local game;
- no remote LLM call.

If deployed publicly, write a short privacy statement explaining that gameplay and history remain local to the device.

## Permanent privacy invariant

This is a standing architectural requirement, not a Phase-specific note:

> **Game data stays on-device unless the user deliberately initiates an
> export or a future sync feature.**

Local browser storage (IndexedDB, `localStorage`, Cache Storage/the service
worker's own cache) remains fully compatible with this invariant - "on
device" means exactly that storage, provided nothing in the application
transmits its contents elsewhere on its own initiative. The invariant is
about outbound transmission, not about which local storage API is used.

Introducing any of the following must trigger a privacy review against this
invariant before it ships, not after:

- cloud sync;
- accounts;
- multiplayer;
- crash reporting;
- telemetry;
- analytics;
- remote AI;
- uploaded PGNs;
- social features.

A privacy review means: identify exactly what would newly leave the device,
under what circumstances, whether the user deliberately initiated it, and
update the in-app About/Privacy screen, this section, and README.md
accordingly before the feature is considered done - not as a follow-up.

---

# 27. Security requirements

This is low-risk software but should still follow basic security hygiene.

Requirements:

- pin/lock dependency versions through the package lock;
- run dependency audit during development;
- do not load engine JavaScript from a third-party CDN at runtime;
- bundle/serve the verified engine files with the app;
- do not dynamically execute puzzle content;
- treat imported PGN as untrusted if PGN import is added later;
- validate parsed persisted data;
- use no secrets because the architecture requires none;
- do not add environment variables unless a real requirement appears;
- deploy only over HTTPS.

---

# 28. PWA requirements

The PWA must have:

- valid web app manifest;
- application name;
- short name;
- suitable icons;
- `display: standalone`;
- theme/background metadata;
- service worker;
- offline caching;
- responsive viewport;
- iPhone-safe layout.

Recommended manifest intent:

```json
{
  "name": "Pocket Chess",
  "short_name": "Chess",
  "display": "standalone",
  "start_url": "/",
  "scope": "/"
}
```

Adjust paths for hosting configuration.

---

# 29. Offline caching

Core offline cache must include:

- HTML;
- CSS;
- JavaScript bundles;
- icons;
- piece assets;
- Stockfish JS;
- Stockfish WASM;
- bundled puzzle dataset;
- application shell.

After successful initial load/install, airplane mode should still allow:

- starting app;
- playing Stockfish;
- solving puzzles;
- viewing local history.

This must be tested rather than assumed.

---

# 30. Update behaviour

A service worker can cause confusing stale-version behaviour.

Implement a simple update strategy.

When a new version has been downloaded and is ready:

> "A new version is available."

Allow user to reload.

Do not aggressively replace a running application in the middle of a chess game.

---

# 31. iPhone-specific UX

Optimise around portrait iPhone use first.

The board should be the dominant element.

Target:

```text
┌─────────────────────────┐
│ Pocket Chess        Menu│
├─────────────────────────┤
│ opponent / status       │
│                         │
│       CHESS BOARD       │
│                         │
│ player / status         │
├─────────────────────────┤
│ Undo   Resign   New     │
└─────────────────────────┘
```

Requirements:

- board fits within viewport width;
- controls have touch-friendly hit targets;
- no accidental horizontal scrolling;
- respect safe-area insets;
- avoid hover-dependent interactions;
- promotion UI must be obvious on touch;
- text must remain readable without desktop-style density.

Do not design desktop first and shrink it later.

---

# 32. Accessibility

At minimum:

- keyboard-accessible controls on desktop;
- meaningful button labels;
- sufficient colour contrast;
- do not communicate legal moves or check state solely through colour;
- pieces should have accessible names if represented by interactive elements;
- respect reduced-motion preferences;
- no unnecessary animation.

---

# 33. Navigation

Keep navigation small.

Recommended screens:

```text
Home
Play
Puzzles
History
Settings
About / Licences
```

Home should primarily offer:

```text
Play computer
Solve puzzle
```

Do not build a dashboard.

---

# 34. Home screen

Suggested content:

```text
Pocket Chess

[ Play ]

[ Puzzles ]

Recent game
Puzzle progress
```

That is sufficient.

Avoid charts, badges, streak flames, news, social panels, AI buttons, or fake complexity.

---

# 35. History

Show locally saved games.

Each row/card can display:

- date;
- player colour;
- opponent level;
- result;
- number of moves.

Selecting a game can show:

- move list;
- final board;
- PGN;
- replay controls.

Deep Stockfish analysis is a later milestone.

---

# 36. Post-game analysis

This is desirable but should be implemented **after** stable play and puzzles.

Initial analysis can:

1. replay game positions;
2. evaluate each player decision using bounded Stockfish search;
3. calculate evaluation difference;
4. identify clearly poor moves;
5. let user return to a mistake position and try another move.

Do not attempt to recreate proprietary Chess.com classifications such as "Brilliant" or copy their wording/rules.

Create our own simple categories if needed:

```text
Best
Good
Inaccuracy
Mistake
Blunder
```

Thresholds must be documented and should account for mate scores.

Analysis must run locally.

---

# 37. Personal mistake practice

A later v0.x feature may transform significant mistakes from saved games into local practice positions.

Concept:

```text
play game
    ↓
local analysis
    ↓
identify bad decision
    ↓
save FEN + best line
    ↓
"Practice my mistakes"
```

This feature is strategically valuable because it creates a personalised training loop without accounts or AI.

Do not implement it before the base engine and puzzle flows are robust.

---

# 38. Error handling

Handle at least:

## Engine failed to initialise

Show:

> "The chess engine could not start."

Allow retry.

Do not leave the board appearing playable if the opponent cannot respond.

## Engine search timeout

- stop current search;
- retry once if safe;
- otherwise surface a clear error;
- keep game state intact.

## Corrupt local game record

Skip/boundary-handle the record rather than crashing history.

## Puzzle record invalid

Reject it and load another puzzle.

## Service worker update failure

Application should continue using the currently cached functioning version.

## IndexedDB unavailable

Fall back gracefully for the current session where possible, but explain that history cannot be saved.

---

# 39. Performance requirements

The app should remain responsive while Stockfish is searching.

Targets are qualitative for v0.1:

- board interaction feels immediate;
- engine work never freezes UI;
- PWA starts promptly after assets are cached;
- puzzle change feels immediate;
- avoid loading thousands of React elements;
- do not parse the full official Lichess dataset in the browser.

Puzzle preprocessing belongs at build time.

---

# 40. Testing strategy

Testing matters because chess has highly deterministic rules.

## Unit tests

Cover:

- normal legal move;
- illegal move rejection;
- castling;
- en passant;
- promotion;
- check;
- checkmate;
- stalemate;
- draw conditions exposed by library;
- PGN generation;
- FEN restoration;
- undo;
- engine UCI parsing;
- stale engine responses;
- puzzle initial setup move;
- correct puzzle move;
- incorrect puzzle move;
- multi-move puzzle completion.

## Engine integration tests

Verify:

1. Worker launches;
2. `uci` handshake completes;
3. `isready` completes;
4. engine accepts known FEN;
5. `bestmove` is returned;
6. returned move is legal;
7. cancellation/stop works.

Do not assert a particular best move for every arbitrary position unless search conditions are deterministic enough for that test.

## End-to-end tests

At least:

### E2E 1: Start game as White

- launch;
- choose Play;
- select White;
- make `e2-e4`;
- verify engine responds;
- verify turn returns to player.

### E2E 2: Start game as Black

- engine moves first;
- player can respond.

### E2E 3: Complete a known short game

Use deterministic moves/fixture where practical and verify result state.

### E2E 4: Puzzle

- load known fixture;
- make expected sequence;
- verify solved state.

### E2E 5: Persistence

- complete/save game;
- reload app;
- game appears in history.

### E2E 6: Offline

- load application online;
- ensure service worker installed;
- simulate offline;
- reload;
- start game;
- initialise engine;
- open puzzle.

---

# 41. Manual iPhone acceptance testing

A release candidate is not accepted until tested on an actual iPhone.

Test:

- Safari load;
- Add to Home Screen;
- Open as Web App;
- portrait layout;
- touch moves;
- drag if enabled;
- promotion;
- board as White;
- board as Black;
- engine response;
- device lock/unlock during game;
- switching apps and returning;
- offline launch;
- offline engine game;
- offline puzzle;
- local save;
- PWA update.

Desktop browser tests alone are insufficient.

---

# 42. Deployment

Initial deployment may use GitHub Pages or another simple HTTPS static host.

Because the selected engine should be the **single-threaded** browser build, the architecture must not depend on special COOP/COEP headers.

If GitHub Pages creates a blocking limitation, move to another static host rather than compromising the application architecture.

The deployment output should be entirely static.

No server-side runtime should be required.

---

# 43. Base path

If deploying below a GitHub Pages repository path, configure Vite and the PWA manifest correctly for that base path.

Example conceptual deployment:

```text
https://<account>.github.io/pocket-chess/
```

A custom domain can be added later.

Do not hard-code root-relative paths that break GitHub Pages deployment.

Engine, WASM, manifest, service worker, and puzzle assets all need to respect the production base path.

---

# 44. Licensing

This section is mandatory.

## Stockfish

Stockfish is distributed under **GPLv3**.

If distributing the Stockfish binary/WASM with the app, include:

- the GPLv3 licence;
- clear attribution;
- the corresponding Stockfish source or an appropriate durable pointer/source offer sufficient to meet the licence requirements;
- source for any modifications made to Stockfish.

Do not modify Stockfish unless necessary.

Record the exact upstream version/commit used to build or obtain the distributed binary.

## chess.js

At the time this specification was written, `chess.js` identifies itself as **BSD-2-Clause**.

Verify the licence of the exact package version installed and retain the notice.

## Lichess puzzle database

Lichess database exports, including puzzles, are published under **CC0**.

Retain provenance information even though attribution is not required in the same way as an attribution licence.

## Other assets

Every chess piece set, icon set, font, or third-party asset must have:

- known source;
- compatible licence;
- licence recorded in `THIRD-PARTY-NOTICES.md`.

Do not copy visual assets from commercial chess services.

---

# 45. Dependency policy

Before adding a dependency, ask:

> Does this solve a real problem better than a small amount of maintainable code?

Avoid dependencies for:

- basic buttons;
- trivial state;
- simple formatting;
- basic modal behaviour;
- chess-board layout if a small custom component is sufficient.

Dependencies must not be added merely because generated code is easier with them.

Before installation:

1. verify maintained status;
2. verify licence;
3. check package purpose;
4. avoid abandoned chess wrappers when a small adapter around UCI is clearer.

---

# 46. Version policy

Do not blindly use version numbers from this specification at implementation time.

Before installing:

- confirm current stable React/Vite/TypeScript versions;
- confirm current stable `chess.js`;
- confirm selected Stockfish browser build is Stockfish 18 or newer compatible version;
- confirm licences have not changed.

Commit the lockfile.

Do not automatically chase major-version upgrades during the initial build.

---

# 47. Suggested implementation phases

## Phase 0: scaffold

Deliver:

- Vite + React + TypeScript;
- tests running;
- PWA manifest;
- placeholder home screen;
- no chess yet.

Acceptance:

```text
npm install
npm run dev
npm test
npm run build
```

all function correctly.

---

## Phase 1: deterministic chess foundation

Deliver:

- chess.js wrapper;
- game state;
- board renderer;
- legal moves;
- promotion;
- check/game-over states;
- unit tests.

No Stockfish yet.

Acceptance:

Two humans can play a complete legal game on one device using the same board.

This phase validates the chess UI and state model independently from engine complexity.

---

## Phase 2: Stockfish integration

Deliver:

- Worker;
- UCI adapter;
- engine lifecycle;
- one engine strength initially;
- play White;
- play Black;
- cancellation/error handling.

Acceptance:

A complete legal human-vs-computer game can be played without UI freezing.

---

## Phase 3: engine levels and game UX

Deliver:

- multiple difficulty levels;
- random colour;
- undo;
- resign;
- restart;
- game status;
- basic polish.

Acceptance:

The application is pleasant enough for routine casual play.

**Phase 3A (implemented, provisional, pending review): adjustable bot
strength only.** A scoped-down slice delivering just the "multiple
difficulty levels" bullet, via Stockfish's `Skill Level` UCI option
(`UCI_LimitStrength` explicitly `false` - no `UCI_Elo`/rating estimation).
Four friendly presets (Gentle/Casual/Challenging/Strongest, mapped to
Skill Level 0/5/10/20 in `src/engine/engineDifficulty.ts`), chosen after
verifying which UCI options the vendored Stockfish 18 Lite build actually
advertises. These are provisional levels, not calibrated ratings, and
remain subject to revision. Implemented on branch
`feature/phase-3a-bot-strength` and passing all automated checks, but
**not yet merged** - still pending independent review/GO and the physical
iPhone + offline acceptance check (only checked in an emulated mobile
viewport so far). The rest of this phase - random colour, undo, resign,
restart, game status polish - is **not** part of Phase 3A and remains open
(see next-steps.md's Phase 3B entry).

---

## Phase 4: local persistence

Deliver:

- IndexedDB schema;
- preferences;
- completed games;
- history;
- clear data.

Acceptance:

Close/reopen application and previous games remain.

---

## Phase 5: puzzle pipeline

Deliver:

- dataset preprocessing script;
- approximately 5,000 bundled puzzles;
- puzzle session logic;
- random puzzles;
- solve/fail;
- progress persistence;
- theme filtering.

Acceptance:

Puzzles work without network access.

---

## Phase 6: PWA/offline hardening

Deliver:

- service worker;
- cached engine;
- cached puzzle dataset;
- cached application shell;
- install icons;
- update behaviour.

Acceptance:

Install on actual iPhone, enable airplane mode, launch app, play Stockfish, solve puzzle.

This is the v0.1 release gate.

---

## Phase 7: post-game analysis

Only after v0.1 is stable.

Deliver:

- bounded local analysis;
- evaluation graph only if useful;
- move quality;
- replay positions;
- retry mistake.

Do not allow this phase to delay the first usable PWA.

---

# 48. Definition of Done for v0.1

v0.1 is complete when all of the following are true:

- [ ] installs to iPhone home screen;
- [ ] launches standalone;
- [ ] playable as White;
- [ ] playable as Black;
- [ ] random colour works;
- [ ] all user moves validated legally;
- [ ] Stockfish runs in Worker;
- [ ] UI remains responsive while engine searches;
- [ ] engine errors do not corrupt game state;
- [ ] promotion works;
- [ ] castling works;
- [ ] en passant works;
- [ ] checkmate/stalemate/draw states work;
- [ ] resign works;
- [ ] undo behaves coherently;
- [ ] games save locally;
- [ ] history survives reload;
- [ ] bundled puzzles work;
- [ ] puzzle solution orientation/setup is correct;
- [ ] puzzle progress saves locally;
- [ ] no analytics/tracking exists;
- [ ] no account exists;
- [ ] no backend exists;
- [ ] application loads offline after installation;
- [ ] Stockfish works offline;
- [ ] puzzles work offline;
- [ ] licensing notices are present;
- [ ] automated tests pass;
- [ ] actual iPhone acceptance test passes.

---

# 49. Claude Code implementation rules

When implementing this specification:

1. **Do not generate the whole project in one giant pass.**
2. Work phase by phase.
3. At the beginning of each phase, inspect the existing repository.
4. Preserve working architecture unless there is a concrete reason to change it.
5. Do not create a backend.
6. Do not introduce authentication.
7. Do not introduce an LLM.
8. Do not add analytics.
9. Do not add UI frameworks unless justified.
10. Do not put chess business logic inside React components.
11. Do not let Stockfish become the authoritative chess-rules engine.
12. Do not let rendered board state become authoritative application state.
13. Validate all engine moves through the chess rules layer.
14. Keep UCI handling isolated in the engine adapter.
15. Run tests after each meaningful change.
16. Run the production build before declaring a phase complete.
17. Report any dependency or licensing uncertainty rather than guessing.
18. Verify current package APIs against documentation before using them.
19. Prefer the smallest safe implementation.
20. Stop and fix foundation problems before adding polish.

---

# 50. First instruction to Claude Code

Use this as the initial implementation task:

```text
Read BUILD_SPEC.md fully.

We are building Pocket Chess as described there.

Do not implement the whole specification yet.

Start with Phase 0 and Phase 1 only:

1. scaffold or inspect the React + TypeScript + Vite project;
2. establish the minimal PWA shell;
3. integrate chess.js behind a small domain wrapper;
4. implement an original/simple responsive chess board;
5. support complete legal local two-player chess;
6. handle promotion and terminal game states;
7. add focused unit tests;
8. add at least one browser smoke test;
9. run tests and production build.

Do not add Stockfish yet.
Do not add puzzles yet.
Do not add persistence yet.
Do not add a backend.
Do not add authentication.
Do not add AI features.
Do not over-design the UI.

Before installing dependencies, verify their current package APIs and licences.

Keep chess state authoritative in the domain layer rather than React UI state.

At the end, report:
- files created/changed;
- architecture used;
- tests run;
- current limitations;
- anything that should be resolved before Phase 2.
```

---

# 51. Future possibilities

These are ideas, not current requirements:

- personal mistake puzzles;
- opening repertoire practice;
- endgame position packs;
- PGN import/export;
- analysis annotations;
- local statistics;
- alternative board themes;
- native wrapper;
- iPad layout;
- Android install;
- Stockfish evaluation bar;
- analysis graph;
- local opening database.

Each should be added only when the existing product provides a stable reason for it.

---

# 52. References checked when this specification was written

Technical assumptions in this specification were checked on **25 August 2026**.

- Stockfish official website: https://stockfishchess.org/
- Stockfish 18 announcement: https://stockfishchess.org/blog/2026/stockfish-18/
- Stockfish GPL information: https://stockfishchess.org/about/
- Stockfish.js browser build: https://github.com/nmrugg/stockfish.js
- Lichess Stockfish browser builds: https://github.com/lichess-org/stockfish-web
- chess.js: https://github.com/jhlywa/chess.js
- Lichess open database: https://database.lichess.org/
- Apple iPhone web-app installation guidance: https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/ios

---

# 53. Core architectural decision

If future implementation choices become ambiguous, preserve this model:

```text
React UI
    ↓ user intent

Application services
    ↓

chess.js-backed domain
    ↓ authoritative legality/state

┌───────────────────────┬───────────────────────┐
│                       │                       │
Stockfish adapter       Local repositories      Puzzle repository
computer/analysis       IndexedDB               bundled CC0 data
│                       │                       │
Web Worker              device only             static/offline
```

The browser UI is not the game state.

Stockfish is not the game state.

The database is not the live game state.

The chess domain is authoritative.

That boundary should remain boring, explicit, and testable.

# 54. Authorised Kids Mode M0/M1 amendment - 2026-10-06

The user authorises M0 followed by M1 only from `plan-build.md`, using the
recommended defaults needed for those milestones. This overrides the old phase
order for this bounded headless puzzle foundation; persistence and application
screens are not prerequisites and are not authorised here. Kids lessons and
cosmetic milestones are planned exceptions to section 3's old product non-goals,
not permission to implement them during M1. Later release choices remain open.

For this slice, sections 20/21's canonical-line comparison is superseded by
objective validation covering all winning alternatives and required defences.
Support only checkmate within one/two player moves and explicit capture goals.
Use six synthetic test fixtures, not a production content library or the old
5,000-puzzle target. Preparation is bounded and exhaustive; normal session play
uses validated branch data. Three authored hints per reachable decision are
requested explicitly, never automatically. Retry restores the missed decision;
replay is read-only and completion is emitted once per loaded session.

Keep sections 6, 26, 49 and 53's authority/privacy boundaries. No UI, storage,
engine refactor, dependencies, asset acquisition, external integration, commits
or deployment. The current configured Codex carries out this authorised work;
independent review is a separate subsequent step. Existing Phase 3B follow-up
review and physical acceptance remain unresolved and do not block M1.
