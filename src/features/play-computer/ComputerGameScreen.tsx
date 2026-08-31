import { useState } from 'react';
import { Board } from '../../components/board/Board';
import type { BoardOrientation } from '../../components/board/boardGeometry';
import type { PlayerColour } from '../../chess/chessTypes';
import { describeGameOutcome } from '../../chess/gameResult';
import { useComputerGame, type UseComputerGameOptions } from './useComputerGame';
import styles from './ComputerGameScreen.module.css';

interface ComputerGameScreenProps {
  playerColour: PlayerColour;
  onExit: () => void;
  /** Test-only injection point (a fake `ChessEngine`, shorter movetime) -
   * never set in the real app, where `useComputerGame`'s own defaults
   * (the real `StockfishAdapter`) apply. */
  engineOptions?: UseComputerGameOptions;
}

function statusText(
  phase: ReturnType<typeof useComputerGame>['phase'],
  turn: PlayerColour,
  isCheck: boolean,
): string {
  if (phase === 'computer-thinking') return 'Computer thinking…';
  return `${turn} to move${isCheck ? ' (check)' : ''}`;
}

/**
 * Human vs. Stockfish. Renders whatever `useComputerGame` reports - no
 * chess rules or engine/UCI details live here, only interaction wiring and
 * status text (build spec section 6's presentation-layer boundary).
 */
export function ComputerGameScreen({ playerColour, onExit, engineOptions }: ComputerGameScreenProps) {
  const {
    snapshot,
    selectedSquare,
    legalTargets,
    phase,
    engineError,
    selectSquare,
    move,
    retry,
    requiresPromotion,
  } = useComputerGame(playerColour, engineOptions);
  const [orientation, setOrientation] = useState<BoardOrientation>(playerColour);

  const isGameOver = phase === 'game-over';
  const boardInteractionDisabled = phase !== 'player-turn';

  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <button type="button" onClick={onExit} aria-label="Back to home">
          Back
        </button>
        <h1>Play computer</h1>
      </header>

      <p className={styles.status} aria-live="polite">
        {isGameOver
          ? describeGameOutcome(snapshot.outcome)
          : phase === 'engine-error'
            ? engineError
            : statusText(phase, snapshot.turn, snapshot.isCheck)}
      </p>

      <Board
        snapshot={snapshot}
        orientation={orientation}
        legalTargets={legalTargets}
        selectedSquare={selectedSquare}
        interactionDisabled={boardInteractionDisabled}
        onSelectSquare={selectSquare}
        onMove={move}
        requiresPromotion={requiresPromotion}
      />

      <div className={styles.controls}>
        {phase === 'engine-error' ? (
          <button type="button" onClick={retry}>
            Retry
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setOrientation((current) => (current === 'white' ? 'black' : 'white'))}
          >
            Flip board
          </button>
        )}
      </div>
    </div>
  );
}
