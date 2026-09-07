import { useState } from 'react';
import type { PlayerColour } from '../../chess/chessTypes';
import type { EngineDifficulty } from '../../engine/engineTypes';
import { DIFFICULTY_LABELS, DIFFICULTY_ORDER } from './engineDifficultyLabels';
import styles from './ColourSelectScreen.module.css';

interface ColourSelectScreenProps {
  onBack: () => void;
  onSelect: (colour: PlayerColour, difficulty: EngineDifficulty) => void;
}

/** New UI games start at the friendliest preset - the player picks a colour
 * first and can always pick a harder difficulty before starting; nothing
 * here persists across sessions (build spec section 14/26). */
const DEFAULT_DIFFICULTY: EngineDifficulty = 'gentle';

/**
 * Colour + difficulty choice before a computer game starts (build spec
 * phase 3A - random colour selection is still deferred to a later phase).
 * Difficulty is fixed for the game once a colour is picked; a new game
 * picks its own via this same screen.
 */
export function ColourSelectScreen({ onBack, onSelect }: ColourSelectScreenProps) {
  const [difficulty, setDifficulty] = useState<EngineDifficulty>(DEFAULT_DIFFICULTY);

  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <button type="button" onClick={onBack} aria-label="Back to home">
          Back
        </button>
        <h1>Play computer</h1>
      </header>

      <p className={styles.prompt}>Computer difficulty</p>
      <div className={styles.difficulty} role="radiogroup" aria-label="Computer difficulty">
        {DIFFICULTY_ORDER.map((level) => (
          <button
            key={level}
            type="button"
            role="radio"
            aria-checked={level === difficulty}
            className={level === difficulty ? styles.difficultyChoiceSelected : styles.difficultyChoice}
            onClick={() => setDifficulty(level)}
          >
            {DIFFICULTY_LABELS[level]}
          </button>
        ))}
      </div>

      <p className={styles.prompt}>Choose your colour</p>

      <div className={styles.actions}>
        <button type="button" className={styles.choice} onClick={() => onSelect('white', difficulty)}>
          Play as White
        </button>
        <button type="button" className={styles.choice} onClick={() => onSelect('black', difficulty)}>
          Play as Black
        </button>
      </div>
    </div>
  );
}
