import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChessGame } from '../../chess/ChessGame';
import type { GameStateSnapshot, PlayerColour, PromotionPiece, SquareId } from '../../chess/chessTypes';
import type { ChessEngine } from '../../engine/ChessEngine';
import type { EngineSessionConfig } from '../../engine/engineTypes';
import { StockfishAdapter } from '../../engine/StockfishAdapter';

/**
 * Modest, fixed search time for Phase 2B's single engine strength - fast
 * enough to feel responsive on a phone, long enough that the lite Stockfish
 * build still gets a real search. Adjustable difficulty is explicitly a
 * later phase (build spec section 14) - this is not exposed to the UI.
 */
const DEFAULT_MOVETIME_MS = 1000;

/** `useComputerGame`'s own default when no `sessionConfig` is supplied -
 * mirrors `StockfishAdapter`'s default, so a caller that doesn't think
 * about difficulty gets the same full-strength behaviour as before Phase
 * 3A. The UI layer (`ColourSelectScreen`) is what actually defaults new
 * games to `'gentle'` - this hook has no opinion on that. */
const DEFAULT_SESSION_CONFIG: EngineSessionConfig = { difficulty: 'strongest' };

/** Total engine start-up attempts per session before surfacing
 * `engine-error` to the player - the original attempt plus one automatic,
 * transparent retry. See `initialiseEngine`'s doc comment
 * (`hotfix/play-computer-offline-regression`) for why a cold start-up can
 * fail transiently on a real device with no network available. */
const STARTUP_ATTEMPT_LIMIT = 2;

/**
 * Explicit computer-game phase - the player's turn, the engine searching,
 * the game having ended, or the engine having failed. Deliberately a real
 * state value transitioned at each orchestration step, not something
 * inferred from `snapshot.turn`/disabled buttons: turn comparison alone
 * can't distinguish "the engine is genuinely searching" from "the engine
 * just failed", and both need different UI/interaction behaviour.
 */
export type ComputerGamePhase = 'player-turn' | 'computer-thinking' | 'game-over' | 'engine-error';

/** From/to squares of the engine's most recently *successfully applied*
 * move - reuses `GameStateSnapshot['lastMove']`'s own shape rather than
 * defining a parallel one. */
export type LastComputerMove = NonNullable<GameStateSnapshot['lastMove']>;

const ENGINE_UNAVAILABLE_MESSAGE = 'The computer opponent ran into a problem.';
const ILLEGAL_ENGINE_MOVE_MESSAGE = 'The computer proposed a move that could not be applied.';

export interface UseComputerGameOptions {
  /** Overrides the real `StockfishAdapter`. Exposed so tests can inject a
   * fake `ChessEngine` without touching a real Worker/WASM instance. */
  createEngine?: () => ChessEngine;
  /** Overrides `DEFAULT_MOVETIME_MS`. Exposed for tests. */
  movetimeMs?: number;
  /** The engine difficulty for this session, passed through to
   * `ChessEngine.start()`. Fixed for the hook's whole lifetime (one hook
   * instance is one computer-game session) - `retry()` re-uses the same
   * value, it is never re-read from a changed prop mid-session. Defaults to
   * `DEFAULT_SESSION_CONFIG` ('strongest') when omitted. */
  sessionConfig?: EngineSessionConfig;
}

/**
 * Coordinates a human-vs-Stockfish game: the application/use-case layer for
 * Phase 2B. Owns no chess rules and no UCI/Worker details itself - moves
 * are validated by the authoritative `ChessGame`, and the engine is only
 * ever spoken to through the `ChessEngine` interface established in Phase
 * 2A. One engine instance is created per computer-game session (i.e. per
 * mount of whatever screen calls this hook) and disposed when that session
 * ends, per the build spec's engine lifecycle requirements.
 *
 * Stale-response safety: `sessionRef` is bumped every time a fresh engine
 * is created (initial mount, or `retry()` after a failure) and on
 * unmount/disposal. Every asynchronous continuation checks it captured the
 * still-current session before touching state, so a late response from an
 * abandoned or superseded engine can never affect a later game - the same
 * principle `StockfishAdapter` itself already applies one layer down, kept
 * here rather than duplicating any of its actual timeout/recovery logic.
 */
export function useComputerGame(playerColour: PlayerColour, options: UseComputerGameOptions = {}) {
  const createEngine = options.createEngine ?? (() => new StockfishAdapter());
  const movetimeMs = options.movetimeMs ?? DEFAULT_MOVETIME_MS;

  // Snapshotted once, on the first render, into a ref rather than read
  // fresh from `options` on every render/callback rebuild - this hook's
  // lifetime is one computer-game session (see the class doc comment) and
  // difficulty is fixed for the whole session (build spec section 14), so
  // neither a later `sessionConfig` prop change nor the caller mutating the
  // same config object in place after mount may change what `retry()`
  // starts with. The shallow copy is what defeats in-place mutation of the
  // caller-owned object; `EngineSessionConfig` currently has only the one
  // primitive `difficulty` field, so a shallow copy is a full snapshot. A
  // different difficulty requires a new session (a fresh mount), not a
  // prop update on this one.
  const sessionConfigRef = useRef<EngineSessionConfig | null>(null);
  if (sessionConfigRef.current === null) {
    sessionConfigRef.current = { ...(options.sessionConfig ?? DEFAULT_SESSION_CONFIG) };
  }
  const sessionConfig = sessionConfigRef.current;

  // Lazily constructed once, like useLocalGame's gameRef - this hook's
  // lifetime is one computer-game session (see the class doc comment), so
  // there is no in-place "new game"/restart to worry about invalidating it.
  const gameRef = useRef<ChessGame | null>(null);
  if (gameRef.current === null) {
    gameRef.current = new ChessGame();
  }
  const game = gameRef.current;

  const engineRef = useRef<ChessEngine | null>(null);
  const startPromiseRef = useRef<Promise<void> | null>(null);
  const sessionRef = useRef(0);
  // True from mount until the unmount cleanup runs - guards the one
  // asynchronous continuation (retry()'s own `.finally`) that isn't
  // already covered by the session-token check, so it never calls setState
  // after this hook's owning component has unmounted.
  const mountedRef = useRef(true);
  // Synchronous (unlike the `isRetrying` state below) so a second retry()
  // call in the same tick - before React has re-rendered with the
  // disabled button - still sees a retry already in flight and bails.
  const retryInFlightRef = useRef(false);
  // Same synchronous-double-call guard as `retryInFlightRef`, for takeback.
  const takebackInFlightRef = useRef(false);

  const [snapshot, setSnapshot] = useState<GameStateSnapshot>(() => game.getSnapshot());
  const [selectedSquare, setSelectedSquare] = useState<SquareId | null>(null);
  const [phase, setPhase] = useState<ComputerGamePhase>(
    playerColour === 'black' ? 'computer-thinking' : 'player-turn',
  );
  const [engineError, setEngineError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isTakingBack, setIsTakingBack] = useState(false);
  // Bumped on every takeback so `Board` can force-close any open promotion
  // dialog it owns - see `Board`'s own `resetSignal` prop doc comment.
  const [boardResetSignal, setBoardResetSignal] = useState(0);
  // Set only by `resign()`. `ChessGame`/chess.js has no notion of
  // resignation (build spec section 17/phase 3B: "do not manufacture a
  // chess.js checkmate position") - this is a pure application-layer
  // overlay applied to the *returned* snapshot's outcome only, right at
  // this hook's own return statement below, so every internal reference to
  // `snapshot/game` elsewhere in this hook keeps working against the real,
  // unmodified chess.js-derived state.
  const [resignedWinner, setResignedWinner] = useState<PlayerColour | null>(null);
  // The engine's most recently *successfully applied* move (for the "last
  // computer move" board highlight) - set only where the engine's proposed
  // move has already passed `game.applyUciMove()`'s validation below, never
  // from raw engine output. Starts `null` and stays that way until the
  // first such move; this hook is recreated fresh per computer-game
  // session (see the class doc comment), so a new game/session already
  // gets a `null` starting value with no extra clearing logic needed.
  const [lastComputerMove, setLastComputerMove] = useState<LastComputerMove | null>(null);

  /** Disposes whatever engine is currently live for this session (if any)
   * and bumps the session token, so nothing further - a late response, a
   * queued search, a stray repeat call - can act on it again. This is the
   * one shared path for every way a session's engine involvement ends:
   * the game just became terminal (whether the player's move or the
   * engine's own move ended it), `retry()` discarding a failed engine
   * before starting a fresh one, and unmount. `engineRef.current` is
   * nulled immediately after, so a later call (e.g. unmount right after a
   * terminal move already disposed it) is a safe no-op - each engine
   * instance is disposed at most once. */
  const disposeCurrentEngine = useCallback(() => {
    sessionRef.current += 1;
    engineRef.current?.dispose();
    engineRef.current = null;
  }, []);

  const legalTargets = useMemo(() => {
    if (!selectedSquare) return [];
    return game.legalDestinations(selectedSquare);
  }, [game, selectedSquare, snapshot]);

  /** Whether there is a previous player decision left to restore.
   * `baseline` is the one ply that is never eligible for takeback: when
   * the player is Black, the computer's forced opening move (ply 0) must
   * always survive a takeback of the player's first move, so the floor is
   * 1 ply instead of 0. Derived from `ChessGame`'s own authoritative
   * `history` (`game.history.length`), not a parallel counter - `snapshot`
   * is only this memo's re-run trigger, since `game.history` is otherwise
   * not itself reactive. Resignation always disables takeback outright
   * (build spec phase 3B: "do not allow it after resignation in this
   * slice"), regardless of history length. */
  const canTakeback = useMemo(() => {
    if (resignedWinner) return false;
    const baseline = playerColour === 'black' ? 1 : 0;
    return game.history.length > baseline;
  }, [game, snapshot, playerColour, resignedWinner]);

  /** Asks the engine for a move in `fen` and applies it once validated
   * through `ChessGame`. Never trusts the engine's move on its own - an
   * illegal/malformed reply is surfaced as a recoverable error, never
   * silently patched or substituted. */
  const requestComputerMove = useCallback(
    async (fen: string) => {
      const session = sessionRef.current;
      setPhase('computer-thinking');
      setEngineError(null);
      try {
        await startPromiseRef.current;
        if (session !== sessionRef.current) return;
        const engine = engineRef.current;
        if (!engine) return;

        const candidate = await engine.findBestMove(fen, { movetimeMs });
        if (session !== sessionRef.current) return;

        const applied = game.applyUciMove(candidate.uci);
        if (!applied) {
          setPhase('engine-error');
          setEngineError(ILLEGAL_ENGINE_MOVE_MESSAGE);
          return;
        }

        setLastComputerMove({ from: applied.from, to: applied.to });
        const nextSnapshot = game.getSnapshot();
        setSnapshot(nextSnapshot);
        if (nextSnapshot.outcome.status === 'in-progress') {
          setPhase('player-turn');
        } else {
          // The engine's own move ended the game - dispose it immediately
          // rather than waiting for unmount, per the engine lifecycle rule
          // ("one engine instance per session, disposed when that session
          // ends"). No further search must ever be requested past this
          // point; disposeCurrentEngine's session bump guarantees that even
          // if something else were still in flight.
          setPhase('game-over');
          disposeCurrentEngine();
        }
      } catch {
        if (session !== sessionRef.current) return;
        setPhase('engine-error');
        setEngineError(ENGINE_UNAVAILABLE_MESSAGE);
      }
    },
    [game, movetimeMs, disposeCurrentEngine],
  );

  /** Starts a fresh engine for a new session (initial mount, or a retry
   * after failure), then requests the opening computer move if it's
   * already the computer's turn (the player chose Black).
   *
   * A cold engine start-up - spawning the Worker and completing the full
   * `uci`/`isready` handshake for the first time - can fail transiently on
   * a real device the first time it's attempted with no network available
   * (see `hotfix/play-computer-offline-regression`'s root-cause note): the
   * WASM has to be read from the service worker's cache rather than
   * streamed from a fast connection, and some browsers have had timing
   * quirks around a freshly-installed service worker's control of a page's
   * Workers. `STARTUP_ATTEMPT_LIMIT` gives one transparent, automatic
   * retry - a fresh Worker, same `sessionConfig` - before ever surfacing
   * `engine-error` to the player; the existing manual "Retry" button
   * (`retry()`, unchanged) remains the fallback if both attempts fail. */
  const initialiseEngine = useCallback(async () => {
    for (let attempt = 1; attempt <= STARTUP_ATTEMPT_LIMIT; attempt += 1) {
      sessionRef.current += 1;
      const session = sessionRef.current;

      const engine = createEngine();
      engineRef.current = engine;
      const startPromise = engine.start(sessionConfig);
      startPromiseRef.current = startPromise;

      try {
        await startPromise;
        if (session !== sessionRef.current) return;

        const currentSnapshot = game.getSnapshot();
        if (currentSnapshot.outcome.status !== 'in-progress') {
          // Defensive: not reachable in the current UI (a fresh session
          // always starts from the initial position), but kept consistent
          // with the "no live engine past a terminal game" rule in case a
          // future caller ever starts this hook from an already-terminal
          // position.
          setPhase('game-over');
          disposeCurrentEngine();
        } else if (currentSnapshot.turn !== playerColour) {
          await requestComputerMove(currentSnapshot.fen);
        } else {
          setPhase('player-turn');
        }
        return;
      } catch {
        if (session !== sessionRef.current) return;
        if (attempt < STARTUP_ATTEMPT_LIMIT) {
          // Dispose this attempt's failed engine (bumps the session too,
          // via the same helper every other cleanup path uses) before
          // trying again - a late response from the failed attempt can
          // never affect the retry, exactly as for any other session
          // transition in this hook.
          disposeCurrentEngine();
          continue;
        }
        setPhase('engine-error');
        setEngineError(ENGINE_UNAVAILABLE_MESSAGE);
        return;
      }
    }
  }, [createEngine, game, playerColour, requestComputerMove, disposeCurrentEngine, sessionConfig]);

  useEffect(() => {
    mountedRef.current = true;
    void initialiseEngine();
    return () => {
      mountedRef.current = false;
      disposeCurrentEngine();
    };
    // Intentionally mount/unmount only: this hook's lifetime is one
    // computer-game session (see the class doc comment) - a later change to
    // `playerColour`/`createEngine` on an already-mounted instance is not a
    // supported flow (the caller remounts a fresh screen for a new game).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectSquare = useCallback(
    (square: SquareId) => {
      if (phase !== 'player-turn') return;
      const piece = snapshot.pieces.find((p) => p.square === square);
      if (square === selectedSquare) {
        setSelectedSquare(null);
        return;
      }
      // Only the player's own colour may ever be selected here - a direct
      // enforcement of "the player must never move the computer's pieces",
      // independent of (in addition to) the phase check above.
      if (piece && piece.colour === playerColour) {
        setSelectedSquare(square);
        return;
      }
      setSelectedSquare(null);
    },
    [phase, selectedSquare, snapshot, playerColour],
  );

  const move = useCallback(
    (from: SquareId, to: SquareId, promotion?: PromotionPiece) => {
      if (phase !== 'player-turn') return;
      const applied = game.applyMove({ from, to, promotion });
      setSelectedSquare(null);
      if (!applied) return;

      const nextSnapshot = game.getSnapshot();
      setSnapshot(nextSnapshot);
      if (nextSnapshot.outcome.status !== 'in-progress') {
        // The player's own move ended the game - dispose the engine
        // immediately rather than waiting for unmount (see the matching
        // comment in requestComputerMove). No search is started.
        setPhase('game-over');
        disposeCurrentEngine();
        return;
      }
      void requestComputerMove(nextSnapshot.fen);
    },
    [phase, game, requestComputerMove, disposeCurrentEngine],
  );

  /** Recovers from `engine-error` by disposing whatever's left of the
   * failed engine and starting a fresh one - the smallest sensible retry
   * path (build spec section 38's "engine failed to initialise"/"engine
   * search timeout" guidance), without reloading the page or ever
   * substituting a non-engine move.
   *
   * `retryInFlightRef` is a synchronous guard against a second `retry()`
   * call landing before React re-renders with the button disabled (e.g.
   * two rapid taps in the same tick, or a direct double call in a test):
   * without it, both calls would see `phase === 'engine-error'` and each
   * spin up its own replacement Worker. `isRetrying` mirrors it as UI
   * state so the Retry button can be disabled while a replacement engine
   * is starting. */
  const retry = useCallback(() => {
    if (phase !== 'engine-error') return;
    if (retryInFlightRef.current) return;
    retryInFlightRef.current = true;
    setIsRetrying(true);
    disposeCurrentEngine();
    void initialiseEngine().finally(() => {
      retryInFlightRef.current = false;
      if (mountedRef.current) setIsRetrying(false);
    });
  }, [phase, initialiseEngine, disposeCurrentEngine]);

  /** Returns the player to their previous decision point: undoes the
   * engine's latest reply and the player's preceding move so play resumes
   * exactly where the player last had a choice - or, while the engine is
   * still searching after a player move, safely cancels that search and
   * undoes only the player's move (there is no engine reply yet to also
   * remove). Available from every phase (`player-turn`, `computer-
   * thinking`, `engine-error`, and a board-derived `game-over`) as long as
   * `canTakeback` holds; the only phase that permanently disables it is a
   * resignation (`canTakeback` itself already accounts for that).
   *
   * Ply count: whoever made the *last* move in `game.history` decides it.
   * If it was the player's own move (an in-flight search, an engine
   * failure while replying, or the player's move itself ending the game),
   * exactly one ply is undone. If it was the engine's (a completed reply,
   * or an engine move that ended the game), two plies are undone - its
   * reply and the player's move before it. Either way this always lands
   * exactly on "the player's turn to decide" - never mid-search, never
   * mid-terminal, and (via `canTakeback`'s own floor) never before the
   * computer's opening move when the player is Black.
   *
   * Engine handling deliberately does not try to distinguish "cancel an
   * active search" from "the engine was already disposed (game-over)" from
   * "the engine is stuck in `error`" as separate cases: `disposeCurrentEngine`
   * is already safe to call from any of those (idempotent, and it rejects/
   * ignores any outstanding work via the same session-token bump every
   * other transition in this hook already relies on - see its own doc
   * comment), and `initialiseEngine` already knows how to bring up a fresh,
   * ready engine (with its own automatic retry-once) and land on
   * `player-turn` once `game.turn === playerColour`, which undoing up to
   * and including the player's own last move always guarantees. Reusing
   * both exactly as `retry()` does keeps takeback's engine handling on the
   * same already-hardened path rather than a second, parallel one. */
  const takeback = useCallback(() => {
    if (!canTakeback) return;
    if (takebackInFlightRef.current) return;
    takebackInFlightRef.current = true;
    setIsTakingBack(true);
    // Disables the board and shows a busy state for the async engine
    // restart below, exactly like `requestComputerMove` already does for
    // an ordinary search - `computer-thinking` is the closest existing
    // phase bucket for "the board is not interactive right now"; the
    // screen layer is what turns this specific case into more accurate
    // status wording (see `ComputerGameScreen`'s own `isTakingBack` check).
    setPhase('computer-thinking');
    setEngineError(null);
    setSelectedSquare(null);
    setLastComputerMove(null);
    setBoardResetSignal((count) => count + 1);

    const history = game.history;
    const lastMoverColour: PlayerColour = (history.length - 1) % 2 === 0 ? 'white' : 'black';
    const pliesToUndo = lastMoverColour === playerColour ? 1 : 2;
    for (let i = 0; i < pliesToUndo; i += 1) {
      game.undoLastMove();
    }
    setSnapshot(game.getSnapshot());

    disposeCurrentEngine();
    void initialiseEngine().finally(() => {
      takebackInFlightRef.current = false;
      if (mountedRef.current) setIsTakingBack(false);
    });
  }, [canTakeback, game, playerColour, disposeCurrentEngine, initialiseEngine]);

  /** Ends the game immediately with an explicit resignation result - the
   * computer as winner - without ever asking `ChessGame` to reach a
   * chess-rules terminal state it hasn't actually reached (build spec
   * phase 3B: "do not manufacture a chess.js checkmate position").
   * `resignedWinner` is applied only as an overlay on the *returned*
   * snapshot's outcome (see the return statement below) - `chess`/`game`
   * itself is never touched, so its own history/FEN stay exactly what
   * they were at the moment of resignation, ready for a takeback to
   * restore correctly if the game is later un-resigned by one. Confirming
   * the resignation itself is a UI concern (see `ComputerGameScreen`'s
   * `ConfirmDialog`), not this hook's job - by the time this is called the
   * decision has already been made. A no-op once the game has already
   * ended, so a stray repeat call (e.g. a slow double-tap past the
   * confirm dialog) cannot re-resign or re-dispose anything. */
  const resign = useCallback(() => {
    if (phase === 'game-over') return;
    disposeCurrentEngine();
    setResignedWinner(playerColour === 'white' ? 'black' : 'white');
    setPhase('game-over');
    setSelectedSquare(null);
    setBoardResetSignal((count) => count + 1);
  }, [phase, playerColour, disposeCurrentEngine]);

  const requiresPromotion = useCallback(
    (from: SquareId, to: SquareId) => game.requiresPromotion(from, to),
    [game],
  );

  // Applied only here, at the boundary - `snapshot` itself (used
  // everywhere above) stays the real, unmodified chess.js-derived state;
  // only what this hook *returns* to the UI shows the resignation.
  const displayedSnapshot: GameStateSnapshot = resignedWinner
    ? { ...snapshot, outcome: { status: 'resigned', winner: resignedWinner } }
    : snapshot;

  return {
    snapshot: displayedSnapshot,
    selectedSquare,
    legalTargets,
    phase,
    engineError,
    isRetrying,
    isTakingBack,
    canTakeback,
    boardResetSignal,
    lastComputerMove,
    selectSquare,
    move,
    retry,
    takeback,
    resign,
    requiresPromotion,
  };
}
