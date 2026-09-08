import { useState } from 'react';
import { Board } from '../../components/board/Board';
import type { BoardOrientation } from '../../components/board/boardGeometry';
import type { PlayerColour } from '../../chess/chessTypes';
import type { EngineDifficulty } from '../../engine/engineTypes';
import { describeGameOutcome } from '../../chess/gameResult';
import { ConfirmDialog } from './ConfirmDialog';
import { DIFFICULTY_LABELS } from './engineDifficultyLabels';
import { useComputerGame, type UseComputerGameOptions } from './useComputerGame';
import styles from './ComputerGameScreen.module.css';

interface ComputerGameScreenProps {
  playerColour: PlayerColour;
  /** Fixed for the whole game - chosen on the colour-select screen. No
   * in-game control changes it; a new game picks its own via a fresh
   * mount of this screen. */
  difficulty: EngineDifficulty;
  onExit: () => void;
  /** Returns to colour/difficulty setup (build spec phase 3B "New game").
   * Confirmation before abandoning an in-progress game is this screen's
   * own concern (see handleNewGameClick) - by the time this is called the
   * decision has already been made. */
  onNewGame: () => void;
  /** Starts a fresh game session with the same player colour and
   * difficulty (build spec phase 3B "Rematch"). The caller (App) is
   * expected to implement this by remounting this screen with a new React
   * key and the same playerColour/difficulty props, so a rematch reuses
   * this screen's own already-correct mount-time initialisation rather
   * than a second, parallel in-place reset path. */
  onRematch: () => void;
  /** Test-only injection point (a fake ChessEngine, shorter movetime) -
   * never set in the real app, where useComputerGame's own defaults (the
   * real StockfishAdapter) apply. */
  engineOptions?: UseComputerGameOptions;
}

function statusText(
  phase: ReturnType<typeof useComputerGame>['phase'],
  turn: PlayerColour,
  isCheck: boolean,
  isTakingBack: boolean,
): string {
  if (isTakingBack) return 'Restoring position...';
  if (phase === 'computer-thinking') return 'Computer thinking...';
  return `${turn} to move${isCheck ? ' (check)' : ''}`;
}

/**
 * Human vs. Stockfish. Renders whatever useComputerGame reports - no chess
 * rules or engine/UCI details live here, only interaction wiring and
 * status text (build spec section 6's presentation-layer boundary).
 */
export function ComputerGameScreen({
  playerColour,
  difficulty,
  onExit,
  onNewGame,
  onRematch,
  engineOptions,
}: ComputerGameScreenProps) {
  const sessionConfig = engineOptions?.sessionConfig ?? { difficulty };
  const {
    snapshot,
    selectedSquare,
    legalTargets,
    phase,
    engineError,
    isRetrying,
    isTakingBack,
    canTakeback,
    boardResetSignal,
    lastComputerMove,
    selectSquare,
    move,
    retry,
    takeback,
    resign,
    requiresPromotion,
  } = useComputerGame(playerColour, { ...engineOptions, sessionConfig });
  const [orientation, setOrientation] = useState<BoardOrientation>(playerColour);
  // Which confirmation prompt (if any) is open - a pure UI concern, not
  // domain state, so it lives here rather than in the hook. null means no
  // dialog is open.
  const [activeConfirm, setActiveConfirm] = useState<'resign' | 'new-game' | null>(null);

  const isGameOver = phase === 'game-over';
  const boardInteractionDisabled = phase !== 'player-turn';

  function handleResignClick() {
    setActiveConfirm('resign');
  }

  function handleNewGameClick() {
    // Nothing to abandon once the game has already ended - confirming
    // would only ask the player to approve something with no real
    // consequence.
    if (isGameOver) {
      onNewGame();
      return;
    }
    setActiveConfirm('new-game');
  }

  function handleConfirmAccept() {
    const confirmed = activeConfirm;
    setActiveConfirm(null);
    if (confirmed === 'resign') {
      resign();
    } else if (confirmed === 'new-game') {
      onNewGame();
    }
  }

  function handleConfirmCancel() {
    setActiveConfirm(null);
  }

  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <button type="button" onClick={onExit} aria-label="Back to home">
          Back
        </button>
        <h1>Play computer</h1>
        <span className={styles.difficultyBadge}>{DIFFICULTY_LABELS[difficulty]}</span>
      </header>

      <p className={styles.status} aria-live="polite">
        {isGameOver
          ? describeGameOutcome(snapshot.outcome)
          : phase === 'engine-error'
            ? engineError
            : statusText(phase, snapshot.turn, snapshot.isCheck, isTakingBack)}
      </p>

      <Board
        snapshot={snapshot}
        orientation={orientation}
        legalTargets={legalTargets}
        selectedSquare={selectedSquare}
        lastComputerMove={lastComputerMove}
        interactionDisabled={boardInteractionDisabled}
        resetSignal={boardResetSignal}
        onSelectSquare={selectSquare}
        onMove={move}
        requiresPromotion={requiresPromotion}
      />

      <div className={styles.controls}>
        {phase === 'engine-error' && (
          <button type="button" onClick={retry} disabled={isRetrying}>
            {isRetrying ? 'Retrying...' : 'Retry'}
          </button>
        )}
        <button type="button" onClick={takeback} disabled={!canTakeback || isTakingBack}>
          {isTakingBack ? 'Taking back...' : 'Take back'}
        </button>
        {!isGameOver && (
          <button type="button" onClick={handleResignClick}>
            Resign
          </button>
        )}
        {phase !== 'engine-error' && (
          <button
            type="button"
            onClick={() => setOrientation((current) => (current === 'white' ? 'black' : 'white'))}
          >
            Flip board
          </button>
        )}
        {isGameOver && (
          <button type="button" onClick={onRematch}>
            Rematch
          </button>
        )}
        <button type="button" onClick={handleNewGameClick}>
          New game
        </button>
      </div>

      {activeConfirm === 'resign' && (
        <ConfirmDialog
          title="Resign this game?"
          message="The computer will be recorded as the winner. This cannot be undone."
          confirmLabel="Resign"
          onConfirm={handleConfirmAccept}
          onCancel={handleConfirmCancel}
        />
      )}
      {activeConfirm === 'new-game' && (
        <ConfirmDialog
          title="Start a new game?"
          message="This abandons the game currently in progress."
          confirmLabel="New game"
          onConfirm={handleConfirmAccept}
          onCancel={handleConfirmCancel}
        />
      )}
    </div>
  );
}
