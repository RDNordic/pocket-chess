import { useEffect, useRef } from 'react';
import type { PlayerColour, PromotionPiece } from '../../chess/chessTypes';
import { pieceAssetUrl } from './pieceAssets';
import styles from './Board.module.css';

const PROMOTION_OPTIONS: Array<{ piece: PromotionPiece; label: string }> = [
  { piece: 'q', label: 'Promote to Queen' },
  { piece: 'r', label: 'Promote to Rook' },
  { piece: 'b', label: 'Promote to Bishop' },
  { piece: 'n', label: 'Promote to Knight' },
];

interface PromotionDialogProps {
  colour: PlayerColour;
  onSelect: (piece: PromotionPiece) => void;
  onCancel: () => void;
}

/**
 * Accessible modal: traps focus among its four options, opens with focus on
 * the first option, closes on Escape, and never leaves the board's inactive
 * squares reachable by keyboard while it is open (the board disables its
 * squares while this is mounted - see Board.tsx). Focus is returned to the
 * square that opened the dialog by the caller (Board.tsx), not here, since
 * only the caller knows which square that was.
 */
export function PromotionDialog({ colour, onSelect, onCancel }: PromotionDialogProps) {
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    optionRefs.current[0]?.focus();
  }, []);

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onCancel();
      return;
    }
    if (event.key !== 'Tab') return;

    // Small fixed-size focus trap: wrap Tab/Shift+Tab within the four
    // options rather than letting focus escape to the (disabled) board.
    const options = optionRefs.current.filter((el): el is HTMLButtonElement => el !== null);
    if (options.length === 0) return;
    const currentIndex = options.indexOf(document.activeElement as HTMLButtonElement);
    const lastIndex = options.length - 1;

    if (event.shiftKey && currentIndex <= 0) {
      event.preventDefault();
      options[lastIndex].focus();
    } else if (!event.shiftKey && currentIndex >= lastIndex) {
      event.preventDefault();
      options[0].focus();
    }
  }

  return (
    <div
      className={styles.promotionOverlay}
      onClick={onCancel}
      onKeyDown={handleKeyDown}
    >
      <div
        className={styles.promotionPanel}
        role="dialog"
        aria-modal="true"
        aria-label="Choose promotion piece"
        onClick={(event) => event.stopPropagation()}
      >
        {PROMOTION_OPTIONS.map(({ piece, label }, index) => (
          <button
            key={piece}
            ref={(el) => {
              optionRefs.current[index] = el;
            }}
            type="button"
            className={styles.promotionOption}
            aria-label={label}
            onClick={() => onSelect(piece)}
          >
            <img
              className={styles.promotionPieceImage}
              src={pieceAssetUrl(piece, colour)}
              alt=""
              aria-hidden="true"
              draggable={false}
            />
          </button>
        ))}
      </div>
    </div>
  );
}
