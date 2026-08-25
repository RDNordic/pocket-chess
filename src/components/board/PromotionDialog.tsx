import type { PlayerColour, PromotionPiece } from '../../chess/chessTypes';
import { pieceGlyph } from './pieceGlyphs';
import styles from './Board.module.css';

const PROMOTION_OPTIONS: PromotionPiece[] = ['q', 'r', 'b', 'n'];

interface PromotionDialogProps {
  colour: PlayerColour;
  onSelect: (piece: PromotionPiece) => void;
  onCancel: () => void;
}

export function PromotionDialog({ colour, onSelect, onCancel }: PromotionDialogProps) {
  return (
    <div
      className={styles.promotionOverlay}
      role="dialog"
      aria-label="Choose promotion piece"
      onClick={onCancel}
    >
      <div className={styles.promotionPanel} onClick={(event) => event.stopPropagation()}>
        {PROMOTION_OPTIONS.map((piece) => (
          <button
            key={piece}
            type="button"
            className={styles.promotionOption}
            aria-label={`Promote to ${piece}`}
            onClick={() => onSelect(piece)}
          >
            {pieceGlyph(piece, colour)}
          </button>
        ))}
      </div>
    </div>
  );
}
