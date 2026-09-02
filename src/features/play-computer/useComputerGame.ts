import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChessGame } from '../../chess/ChessGame';
import type { GameStateSnapshot, PlayerColour, PromotionPiece, SquareId } from '../../chess/chessTypes';
import type { ChessEngine } from '../../engine/ChessEngine';
import { StockfishAdapter } from '../../engine/StockfishAdapter';

/**
 * Modest, fixed search time for Phase 2B's single engine strength - fast
 * enough to feel responsive on a phone, long enough that the lite Stockfish
 * build still gets a real search. Adjustable difficulty is explicitly a
 * later phase (build spec section 14) - this is not exposed to the UI.
 */
const DEFAULT_MOVETIME_MS = 1000;

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

  const [snapshot, setSnapshot] = useState<GameStateSnapshot>(() => game.getSnapshot());
  const [selectedSquare, setSelectedSquare] = useState<SquareId | null>(null);
  const [phase, setPhase] = useState<ComputerGamePhase>(
    playerColour === 'black' ? 'computer-thinking' : 'player-turn',
  );
  const [engineError, setEngineError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
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
   * already the computer's turn (the player chose Black). */
  const initialiseEngine = useCallback(async () => {
    sessionRef.current += 1;
    const session = sessionRef.current;

    const engine = createEngine();
    engineRef.current = engine;
    const startPromise = engine.start();
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
        return;
      }
      if (currentSnapshot.turn !== playerColour) {
        await requestComputerMove(currentSnapshot.fen);
      } else {
        setPhase('player-turn');
      }
    } catch {
      if (session !== sessionRef.current) return;
      setPhase('engine-error');
      setEngineError(ENGINE_UNAVAILABLE_MESSAGE);
    }
  }, [createEngine, game, playerColour, requestComputerMove, disposeCurrentEngine]);

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

  const requiresPromotion = useCallback(
    (from: SquareId, to: SquareId) => game.requiresPromotion(from, to),
    [game],
  );

  return {
    snapshot,
    selectedSquare,
    legalTargets,
    phase,
    engineError,
    isRetrying,
    lastComputerMove,
    selectSquare,
    move,
    retry,
    requiresPromotion,
  };
}
