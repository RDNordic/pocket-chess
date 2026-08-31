import type { PlayerColour } from '../../chess/chessTypes';
import styles from './ColourSelectScreen.module.css';

interface ColourSelectScreenProps {
  onBack: () => void;
  onSelect: (colour: PlayerColour) => void;
}

/**
 * Minimal colour choice before a computer game starts. No "random" option
 * yet (build spec phase 3) - just White or Black.
 */
export function ColourSelectScreen({ onBack, onSelect }: ColourSelectScreenProps) {
  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <button type="button" onClick={onBack} aria-label="Back to home">
          Back
        </button>
        <h1>Play computer</h1>
      </header>

      <p className={styles.prompt}>Choose your colour</p>

      <div className={styles.actions}>
        <button type="button" className={styles.choice} onClick={() => onSelect('white')}>
          Play as White
        </button>
        <button type="button" className={styles.choice} onClick={() => onSelect('black')}>
          Play as Black
        </button>
      </div>
    </div>
  );
}
