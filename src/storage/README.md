# Local records - M2

Headless repositories only. These modules are not imported by the application;
M3/M4 will connect screens/session coordinators. No adult route, engine or live
ChessGame ownership changes. No content, assets, accounts or network service.

`LocalRepositories(new IndexedDbBackend())` uses the device-local database
`pocket-chess-local`, IndexedDB layout version 1. Separate stores hold settings,
games, compact ledger, puzzle/scenario progress, checkpoints, awards, wardrobe
and metadata. No name, tap stream or engine memory is stored. Logical starter
and milestone item IDs define inventory contracts, not acquired artwork.

## Validation and migration

Records have schemaVersion 2. Every deserialised record is validated and copied;
keys must agree with record identities. Game start FEN passes the reviewed raw
metadata boundary before evaluation; every stored UCI move goes through
ChessGame. Board-derived outcomes must agree with ChessGame. Resignation/abort
are explicit use-case outcomes and cannot mask an already terminal board.

Schema v1 uses the same layouts, except settings may omit music (migrated off)
and metadata may use a numerical generation (converted to a namespaced string).
No earlier production persistence shipped. This is an explicit, tested migration
contract, not a claim to support arbitrary legacy database shapes. Ordinary load
validates/migrates in memory without altering raw data. `migrate(token)` writes
only supported v1 records in one transaction. Invalid/future records remain
isolated, with store/key diagnostics. Their data is not silently overwritten.
Mutations that depend on incompatible records fail. Deliberate fresh-start may
erase them; narrower resets cannot silently replace incompatible metadata.

`load()` returns defaults only for absent settings/wardrobe, never for incompatible
ones. Record issues mean any derived statistics may be incomplete; future UI must
show that status. Valid detail can be reconstructed with `reconstructGame` into
a new ChessGame, never deserialised directly as a live board.

## Saves, results and awards

Obtain an opaque in-memory token through `beginSession()` after reload/reset.
All writes return `StorageResult`; only `ok: true` means the native transaction
committed. A denied/quota/aborted transaction leaves previous data intact. Retain
the live domain session and pending save intent on failure, expose unsaved status,
and allow retry. There is no fake persistent success or implicit memory fallback.

Revisions are nonnegative integers, monotonically increasing per game/progress
ID and per settings/wardrobe/checkpoint slot. Equal revisions with equal contents
are idempotent; different contents conflict; older revisions are stale. A new
activity replacing an occupied checkpoint slot must use a newer slot revision.
Activity slot high-water marks and closed-session receipts live in the existing
metadata store and survive checkpoint deletion and reload. A completed session
cannot save a checkpoint again, even with a bumped revision. Intentional repeats
use a new session ID and a revision above the retained slot/progress floor.
Game duplicate comparison uses SHA-256 of canonical validated data, preserving
idempotence after detailed replay has been pruned. No hash or data leaves device.

`saveGame` atomically updates current bot checkpoint/detail, compact ledger,
first-completion order, award evidence and inventory. One unfinished bot game can
coexist with puzzle/scenario checkpoints. Finish/abandon the current bot game
before replacing its slot. A board-terminal result may be reopened via a newer
legal record; it drops out of totals, retains first-completion order and preserves
awards. Re-completion updates that ID/order. Resignation stays terminal. Abandonment
does not fill a Legacy block or earn the first-game item.

`completeActivity` consumes a trusted domain/use-case completion intent; it does
not decide that a chess goal was solved. New intents require a session ID and a
completion revision newer than that session's checkpoint. It atomically stores
progress, records the closed session, removes only its matching ID/version/session
checkpoint and grants eligible items. Exact duplicates return without mutating
checkpoints, progress, evidence or inventory, including newer replay sessions.
Legacy stored progress without a session ID remains readable and contributes its
revision floor; no identity is inferred from whichever checkpoint is now active.
Distinct
stable puzzle IDs count across versions/repeats/hints. Permanent evidence and
earned items survive learning resets, takeback and detail pruning. Default grants:
first completed game, five distinct solved puzzles, first completed scenario.
No additional item-grant API, reward randomness or UI mechanics are implemented.

Source/entity IDs remain limited to 200 characters. Evidence IDs validate the
`puzzle:`, `scenario:` or `game:` namespace plus a source ID separately (up to
209 characters including the longest prefix). Generated evidence/grant records
are validated before insertion, in the same atomic transaction as completion.

Retain at most 100 completed replay details. `saveGame` reports pruned IDs. The
future history UI must explain this cap before using it. Compact ledger entries
remain, including revision/order tombstones for reopened/abandoned sessions.
`deriveLegacy` groups active completions into successive 100-game blocks, with
the current partial block and lifetime totals; order is first completion, not last
write. Score is `100 * (wins + 0.5 * draws) / games`. Difficulty/help counts accompany
the score. This is not Elo or a calibrated strength estimate.

## Recovery and reset

Activity checkpoints contain stable ID/version, session ID, original start FEN,
accepted UCI path, decision ply and hint count; no projections or reply tokens.
`captureCheckpoint` and `recoverCheckpoint` validate puzzle paths through M1.
Failed attempts resume at the accepted decision; pending replies get fresh
capabilities. Completed paths cannot be resumed as unfinished sessions.
Removed content returns selection; changed version/start position returns restart.
Other progress/results/awards remain intact. Callers pass their deliberately
activated content snapshot; this module does not activate service-worker/content
updates. Saving against an incompatible activated snapshot fails explicitly.

Scenario recovery has the same ID/version/start/path contract, plus a trusted
branch-validation adapter. M2 verifies legal ChessGame replay and requires that
adapter to verify the goal/decision boundary. Actual scenario rules/content arrive
in M5; no opening correctness is guessed by the repository.

Reset operations are atomic and implement the plan matrix:

| Action | Erases/changes | Preserves |
|---|---|---|
| Appearance | Equipped outfit, board/piece theme to defaults | Owned items, awards, progress, bot records/Legacy, audio/language |
| Learning | Progress and puzzle/scenario checkpoints | Award evidence/items, bot records/Legacy, preferences |
| Games | Details, bot checkpoint, compact ledger/order | Learning, wardrobe/awards, preferences |
| Fresh | All learner records, defaults restored | Bundled app/content/licences; no cache uninstall |

Every reset immediately invalidates this repository's local tokens, even on
failure. Successful reset changes the persisted opaque epoch in the same
transaction, invalidating earlier tokens from other instances/tabs too. Pending
old writes cannot resurrect erased records. A failed reset reports failure and
rolls back all erasures; reacquire a token before intentional retries/new work.
Future UI must obtain destructive confirmation and explain that game/fresh reset
also erases Legacy. No reset screens or confirmation UI ship in M2.
Learning/fresh resets clear activity lifecycle receipts/high-water marks along
with progress, protected by the new persisted reset epoch. Other resets preserve
these activity records.

## Verification boundary

Unit tests use a test-only transactional memory model for corruption/failure/race
and ledger boundary checks. `npm run test:storage` uses real IndexedDB in fresh,
non-persistent Playwright-managed Chromium contexts and blocks external requests.
The dev-only harness is not a Vite build entry. Its in-process local Vite runner
owns/ closes its server, avoiding the earlier Windows child-tree teardown issue;
existing browser runners are unchanged. No new dependency is required.

Local automated verification is separate from M2 independent review and physical
iPad/iPhone storage/offline acceptance. Stop for review before any M3 screens.
