import { useCallback, useMemo, useRef, useState } from 'react';
import { ChessGame } from '../../chess/ChessGame';
import type { GameStateSnapshot, PromotionPiece, SquareId } from '../../chess/chessTypes';

/**
 * Coordinates a local two-humans-one-device game against the authoritative
 * ChessGame domain wrapper. This is the application/use-case layer: it owns
 * no chess rules itself, only move intent, selection, and undo history.
 */
export function useLocalGame() {
  const gameRef = useRef(new ChessGame());
  const [snapshot, setSnapshot] = useState<GameStateSnapshot>(() =>
    gameRef.current.getSnapshot(),
  );
  const [selectedSquare, setSelectedSquare] = useState<SquareId | null>(null);

  const legalTargets = useMemo(() => {
    if (!selectedSquare) return [];
    return gameRef.current.legalDestinations(selectedSquare);
  }, [selectedSquare, snapshot]);

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

  const move = useCallback((from: SquareId, to: SquareId, promotion?: PromotionPiece) => {
    const applied = gameRef.current.applyMove({ from, to, promotion });
    if (applied) {
      setSnapshot(gameRef.current.getSnapshot());
    }
    setSelectedSquare(null);
  }, []);

  const undo = useCallback(() => {
    if (gameRef.current.undoLastMove()) {
      setSnapshot(gameRef.current.getSnapshot());
      setSelectedSquare(null);
    }
  }, []);

  const restart = useCallback(() => {
    gameRef.current = new ChessGame();
    setSnapshot(gameRef.current.getSnapshot());
    setSelectedSquare(null);
  }, []);

  return {
    snapshot,
    selectedSquare,
    legalTargets,
    selectSquare,
    move,
    undo,
    restart,
  };
}
