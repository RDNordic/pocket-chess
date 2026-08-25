import { useMemo, useState } from 'react';
import type { GameStateSnapshot, PromotionPiece, SquareId } from '../../chess/chessTypes';
import { isLightSquare, orderedSquares, type BoardOrientation } from './boardGeometry';
import { pieceAccessibleName, pieceGlyph } from './pieceGlyphs';
import { PromotionDialog } from './PromotionDialog';
import styles from './Board.module.css';

interface BoardProps {
  snapshot: GameStateSnapshot;
  orientation: BoardOrientation;
  /** Squares the currently selected piece may legally move to. */
  legalTargets: string[];
  selectedSquare: SquareId | null;
  interactionDisabled?: boolean;
  onSelectSquare: (square: SquareId) => void;
  onMove: (from: SquareId, to: SquareId, promotion?: PromotionPiece) => void;
}

/**
 * Presentation-only board. Holds no chess rules: it renders whatever
 * snapshot/legalTargets it is given and reports taps upward. Selection
 * (tap-source then tap-destination) is coordinated by the caller.
 */
export function Board({
  snapshot,
  orientation,
  legalTargets,
  selectedSquare,
  interactionDisabled = false,
  onSelectSquare,
  onMove,
}: BoardProps) {
  const [pendingPromotion, setPendingPromotion] = useState<
    { from: SquareId; to: SquareId } | null
  >(null);

  const squares = useMemo(() => orderedSquares(orientation), [orientation]);
  const pieceBySquare = useMemo(() => {
    const map = new Map<string, GameStateSnapshot['pieces'][number]>();
    for (const piece of snapshot.pieces) {
      map.set(piece.square, piece);
    }
    return map;
  }, [snapshot.pieces]);

  const kingSquareInCheck = useMemo(() => {
    if (!snapshot.isCheck) return undefined;
    return snapshot.pieces.find(
      (piece) => piece.type === 'k' && piece.colour === snapshot.turn,
    )?.square;
  }, [snapshot.isCheck, snapshot.pieces, snapshot.turn]);

  function handleSquareClick(square: SquareId) {
    if (interactionDisabled) return;

    if (selectedSquare && legalTargets.includes(square)) {
      const movingPiece = pieceBySquare.get(selectedSquare);
      const isPromotion =
        movingPiece?.type === 'p' && (square.endsWith('8') || square.endsWith('1'));
      if (isPromotion) {
        setPendingPromotion({ from: selectedSquare, to: square });
        return;
      }
      onMove(selectedSquare, square);
      return;
    }

    onSelectSquare(square);
  }

  return (
    <div className={styles.board} role="grid" aria-label="Chess board">
      {squares.map((square) => {
        const piece = pieceBySquare.get(square);
        const isSelected = square === selectedSquare;
        const isLegalTarget = legalTargets.includes(square);
        const isLastMove =
          snapshot.lastMove &&
          (square === snapshot.lastMove.from || square === snapshot.lastMove.to);
        const isCheckSquare = square === kingSquareInCheck;

        const classNames = [
          styles.square,
          isLightSquare(square) ? styles.light : styles.dark,
          isSelected ? styles.selected : '',
          !isSelected && isLastMove ? styles.lastMove : '',
          isCheckSquare ? styles.check : '',
          isLegalTarget && !piece ? styles.legalTarget : '',
          isLegalTarget && piece ? styles.legalCapture : '',
        ]
          .filter(Boolean)
          .join(' ');

        return (
          <button
            key={square}
            type="button"
            role="gridcell"
            className={classNames}
            disabled={interactionDisabled}
            aria-label={
              piece ? `${square}, ${pieceAccessibleName(piece.type, piece.colour)}` : square
            }
            onClick={() => handleSquareClick(square)}
          >
            {piece && (
              <span className={styles.piece} data-colour={piece.colour} aria-hidden="true">
                {pieceGlyph(piece.type, piece.colour)}
              </span>
            )}
          </button>
        );
      })}

      {pendingPromotion && (
        <PromotionDialog
          colour={snapshot.turn}
          onCancel={() => setPendingPromotion(null)}
          onSelect={(piece) => {
            onMove(pendingPromotion.from, pendingPromotion.to, piece);
            setPendingPromotion(null);
          }}
        />
      )}
    </div>
  );
}
