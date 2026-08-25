import { useState } from 'react';
import { Board } from '../../components/board/Board';
import type { BoardOrientation } from '../../components/board/boardGeometry';
import { useLocalGame } from './useLocalGame';
import styles from './PlayLocalScreen.module.css';

const STATUS_LABEL: Record<string, string> = {
  active: 'In progress',
  checkmate: 'Checkmate',
  stalemate: 'Stalemate',
  draw: 'Draw',
  resigned: 'Resigned',
  aborted: 'Aborted',
};

interface PlayLocalScreenProps {
  onExit: () => void;
}

export function PlayLocalScreen({ onExit }: PlayLocalScreenProps) {
  const { snapshot, selectedSquare, legalTargets, selectSquare, move, undo, restart } =
    useLocalGame();
  const [orientation, setOrientation] = useState<BoardOrientation>('white');

  const isGameOver = snapshot.status !== 'active';

  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <button type="button" onClick={onExit} aria-label="Back to home">
          Back
        </button>
        <h1>Local two-player</h1>
      </header>

      <p className={styles.status} aria-live="polite">
        {STATUS_LABEL[snapshot.status]}
        {snapshot.status === 'active' && ` - ${snapshot.turn} to move`}
        {snapshot.isCheck && snapshot.status === 'active' && ' (check)'}
      </p>

      <Board
        snapshot={snapshot}
        orientation={orientation}
        legalTargets={legalTargets}
        selectedSquare={selectedSquare}
        interactionDisabled={isGameOver}
        onSelectSquare={selectSquare}
        onMove={move}
      />

      <div className={styles.controls}>
        <button type="button" onClick={undo} disabled={snapshot.history.length === 0}>
          Undo
        </button>
        <button
          type="button"
          onClick={() => setOrientation((current) => (current === 'white' ? 'black' : 'white'))}
        >
          Flip board
        </button>
        <button type="button" onClick={restart}>
          New game
        </button>
      </div>
    </div>
  );
}
