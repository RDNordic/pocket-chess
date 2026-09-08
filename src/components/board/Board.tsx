import { useEffect, useMemo, useRef, useState } from 'react';
import type { GameStateSnapshot, PromotionPiece, SquareId } from '../../chess/chessTypes';
import { isLightSquare, orderedSquares, type BoardOrientation } from './boardGeometry';
import { pieceAccessibleName, pieceAssetUrl } from './pieceAssets';
import { PromotionDialog } from './PromotionDialog';
import styles from './Board.module.css';

interface BoardProps {
  snapshot: GameStateSnapshot;
  orientation: BoardOrientation;
  /** Squares the currently selected piece may legally move to. */
  legalTargets: SquareId[];
  selectedSquare: SquareId | null;
  /** From/to squares of the opponent engine's most recently successfully
   * applied move (Play Computer only) - `undefined`/`null` elsewhere (e.g.
   * local two-player), which simply renders no highlight. */
  lastComputerMove?: { from: SquareId; to: SquareId } | null;
  interactionDisabled?: boolean;
  onSelectSquare: (square: SquareId) => void;
  onMove: (from: SquareId, to: SquareId, promotion?: PromotionPiece) => void;
  /**
   * Domain-provided predicate: does this legal from/to pair require a
   * promotion choice? The board never infers this itself (e.g. by checking
   * ranks) - that is chess-rule knowledge and belongs in the chess domain.
   */
  requiresPromotion: (from: SquareId, to: SquareId) => boolean;
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
  lastComputerMove,
  interactionDisabled = false,
  onSelectSquare,
  onMove,
  requiresPromotion,
}: BoardProps) {
  const [pendingPromotion, setPendingPromotion] = useState<
    { from: SquareId; to: SquareId } | null
  >(null);
  // The square button that triggered the promotion dialog, so focus can
  // return to it once the dialog closes (accessibility requirement: focus
  // must not simply vanish into the document body).
  const promotionOriginRef = useRef<HTMLButtonElement | null>(null);

  const squares = useMemo(() => orderedSquares(orientation), [orientation]);
  // orderedSquares() returns squares in row-major (rank-by-rank) order, so
  // every consecutive run of 8 is exactly one visual rank - chunking it here
  // gives each rank a role="row" wrapper for proper ARIA grid semantics
  // (role="grid" > role="row" > role="gridcell"), without changing the
  // underlying square order that selection/highlighting logic relies on.
  const squareRows = useMemo(() => {
    const rows: SquareId[][] = [];
    for (let i = 0; i < squares.length; i += 8) {
      rows.push(squares.slice(i, i + 8));
    }
    return rows;
  }, [squares]);
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

  function handleSquareClick(square: SquareId, target: HTMLButtonElement) {
    if (interactionDisabled) return;

    if (selectedSquare && legalTargets.includes(square)) {
      if (requiresPromotion(selectedSquare, square)) {
        promotionOriginRef.current = target;
        setPendingPromotion({ from: selectedSquare, to: square });
        return;
      }
      onMove(selectedSquare, square);
      return;
    }

    onSelectSquare(square);
  }

  function closePromotionDialog() {
    setPendingPromotion(null);
  }

  const boardInteractionDisabled = interactionDisabled || pendingPromotion !== null;

  // Restore focus only after the board's squares are re-enabled in the DOM
  // (i.e. after this state change commits) - a disabled button cannot
  // receive focus, and the square is still disabled at the moment
  // closePromotionDialog() itself runs.
  useEffect(() => {
    if (pendingPromotion === null && promotionOriginRef.current) {
      promotionOriginRef.current.focus();
      promotionOriginRef.current = null;
    }
  }, [pendingPromotion]);

  return (
    <div className={styles.board} role="grid" aria-label="Chess board">
      {squareRows.map((row, rowIndex) => (
        <div role="row" className={styles.row} key={rowIndex}>
          {row.map((square) => {
            const piece = pieceBySquare.get(square);
            const isSelected = square === selectedSquare;
            const isLegalTarget = legalTargets.includes(square);
            const isLastMove =
              snapshot.lastMove &&
              (square === snapshot.lastMove.from || square === snapshot.lastMove.to);
            const isComputerMove =
              lastComputerMove != null &&
              (square === lastComputerMove.from || square === lastComputerMove.to);
            const isCheckSquare = square === kingSquareInCheck;

            const classNames = [
              styles.square,
              isLightSquare(square) ? styles.light : styles.dark,
              isSelected ? styles.selected : '',
              !isSelected && isLastMove ? styles.lastMove : '',
              // Takes precedence over the generic last-move highlight above
              // when both would land on the same square (the computer's own
              // move is, by definition, also the game's last move) - only
              // one `::after` background can render per square, so this is
              // a plain boolean override, not a colour blend.
              !isSelected && isComputerMove ? styles.computerMove : '',
              isCheckSquare ? styles.check : '',
              isLegalTarget && !piece ? styles.legalTarget : '',
              isLegalTarget && piece ? styles.legalCapture : '',
            ]
              .filter(Boolean)
              .join(' ');

            const description = [
              piece ? pieceAccessibleName(piece.type, piece.colour) : undefined,
              isLegalTarget ? 'legal move target' : undefined,
              isCheckSquare ? 'king in check' : undefined,
              isComputerMove ? "computer's last move" : undefined,
            ]
              .filter(Boolean)
              .join(', ');

            return (
              <button
                key={square}
                type="button"
                role="gridcell"
                className={classNames}
                disabled={boardInteractionDisabled}
                aria-selected={isSelected}
                aria-label={description ? `${square}, ${description}` : square}
                onClick={(event) => handleSquareClick(square, event.currentTarget)}
              >
                {piece && (
                  <img
                    className={styles.piece}
                    src={pieceAssetUrl(piece.type, piece.colour)}
                    alt=""
                    aria-hidden="true"
                    draggable={false}
                  />
                )}
              </button>
            );
          })}
        </div>
      ))}

      {pendingPromotion && (
        <PromotionDialog
          colour={snapshot.turn}
          onCancel={closePromotionDialog}
          onSelect={(piece) => {
            onMove(pendingPromotion.from, pendingPromotion.to, piece);
            closePromotionDialog();
          }}
        />
      )}
    </div>
  );
}
