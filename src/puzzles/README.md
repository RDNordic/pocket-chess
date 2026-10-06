# Headless puzzle contract - M1

This module is not wired into the application. Synthetic fixtures live only in
`__tests__/fixtures.ts`; they are not the production puzzle library. No UI,
engine, storage, timers, audio or reward system is provided here.

`PuzzleSession` loads an unknown serialisable `PuzzleRecord`. Schema version 1
supports mate **within** one/two player moves (earlier mate is also success) and
capturing an explicit opponent piece on a specified target square, including
the actual pawn removed by en passant. Capture success makes no material-gain
claim. Content errors produce `invalid-content`, a diagnostic and no position.
Unexpected domain/programming errors propagate; they are not wrong answers.

`validatePuzzle` is bounded synchronous preparation, not an engine search during
play. It enumerates all player alternatives, every required opponent defence
and mating finishes using ChessGame. It stores every accepted option plus a
verified failing defence when one exists. Work is capped at 50,000 enumerated
moves/constructed edges; records allow at most 512 authored decision entries.
Preparation must move to an appropriate build/preload boundary when real content
is added in M3; no full library preparation on a React render or player tap.

Records contain stable ID/version, normalised start FEN, player/objective, a
display line, completion text and three structured authored hints for every
reachable winning decision. Piece-square and destination-move hints agree and
name a verified accepted move. Missing/off-branch content or incomplete display
lines fail closed. Text accuracy/tone and source licensing still require human
content review; mathematical move checks do not prove prose true. Optional
source FEN/setup move must reproduce the normalised start exactly. Setup history
does not become part of the player's solution/replay.

Start/source FEN metadata is checked against the supplied piece placement before
constructing or evaluating ChessGame. Castling rights require the matching king
and rook on their home squares. An en-passant target requires the correct rank,
an empty target/origin and the opposing pawn on its double-move destination.
Blocked castling paths and en-passant targets without a legal capturer remain
valid metadata; ChessGame decides actual move legality. Inconsistent records
are rejected without repair. Full historical reachability is not checked.

The live ChessGame contains accepted history only. Unsuccessful attempts use
disposable domain projections exposed separately from the accepted position.
`showRefutation()` returns a detached demo, leaving the live game unchanged.
`retry()` restores the current decision checkpoint, including earlier accepted
moves; it also cancels an unadvanced successful reply. `restart()` starts from
the root. Hints reset on these operations and each new decision.

After an accepted nonterminal move, `getSnapshot().replyToken` is an ephemeral
Symbol capability. A future UI may schedule `advanceOpponentReply(token)`;
the default follows the display line when applicable, otherwise a deterministic
prepared reply. Tests may select any verified defence. Tokens are one-use and
invalidate on retry/restart/load/close; they are never persisted or sent remotely.
Player moves and hints are blocked during opponent turns.

At completion, `takeCompletion()` returns ID/version once per load. Restart,
re-solving and replay do not emit it again. A fresh load is a new session;
future M2 durable award deduplication must use stable puzzle IDs, not this
in-memory guard. `replaySnapshot(ply)` returns detached positions for the actual
accepted solution only, with no live cursor/phase mutation or event emission.
Snapshots and hint copies can be changed by a caller without changing the session.

The test-only oracle directly uses the installed chess.js, evaluates every
defence even for failing candidates, and checks complete winning branches
against the preparer. This is implementation verification, not independent review
or physical acceptance. Stop after M1; review before M2.
