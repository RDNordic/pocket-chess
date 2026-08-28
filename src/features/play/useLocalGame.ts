import { useCallback, useMemo, useRef, useState } from 'react';
import { ChessGame } from '../../chess/ChessGame';
import type { GameStateSnapshot, PromotionPiece, SquareId } from '../../chess/chessTypes';

/**
 * Coordinates a local two-humans-one-device game against the authoritative
 * ChessGame domain wrapper. This is the application/use-case layer: it owns
 * no chess rules itself, only move intent, selection, and undo history.
 */
export function useLocalGame() {
  // Lazily constructed on first render only, rather than a fresh (and
  // immediately discarded) ChessGame on every render.
  const gameRef = useRef<ChessGame | null>(null);
  if (gameRef.current === null) {
    gameRef.current = new ChessGame();
  }
  const game = gameRef.current;

  const [snapshot, setSnapshot] = useState<GameStateSnapshot>(() => game.getSnapshot());
  const [selectedSquare, setSelectedSquare] = useState<SquareId | null>(null);

  const legalTargets = useMemo(() => {
    if (!selectedSquare) return [];
    return game.legalDestinations(selectedSquare);
  }, [game, selectedSquare, snapshot]);

  const selectSquare = useCallback(
    (square: SquareId) => {
      const piece = snapshot.pieces.find((p) => p.square === square);
      if (square === selectedSquare) {
        setSelectedSquare(null);
        return;
      }
      if (piece && piece.colour === snapshot.turn) {
        setSelectedSquare(square);
        return;
      }
      setSelectedSquare(null);
    },
    [selectedSquare, snapshot],
  );

  const move = useCallback(
    (from: SquareId, to: SquareId, promotion?: PromotionPiece) => {
      const applied = game.applyMove({ from, to, promotion });
      if (applied) {
        setSnapshot(game.getSnapshot());
      }
      setSelectedSquare(null);
    },
    [game],
  );

  const undo = useCallback(() => {
    if (game.undoLastMove()) {
      setSnapshot(game.getSnapshot());
      setSelectedSquare(null);
    }
  }, [game]);

  const restart = useCallback(() => {
    gameRef.current = new ChessGame();
    setSnapshot(gameRef.current.getSnapshot());
    setSelectedSquare(null);
  }, []);

  /** Whether the source square has a legal move requiring promotion choice. */
  const requiresPromotion = useCallback(
    (from: SquareId, to: SquareId) => game.requiresPromotion(from, to),
    [game],
  );

  return {
    snapshot,
    selectedSquare,
    legalTargets,
    selectSquare,
    move,
    undo,
    restart,
    requiresPromotion,
  };
}
