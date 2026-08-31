import styles from './HomeScreen.module.css';

interface HomeScreenProps {
  onPlayLocal: () => void;
  onPlayComputer: () => void;
  onAbout: () => void;
}

export function HomeScreen({ onPlayLocal, onPlayComputer, onAbout }: HomeScreenProps) {
  return (
    <div className={styles.screen}>
      <h1 className={styles.title}>Pocket Chess</h1>
      <p className={styles.tagline}>Offline chess practice. No account, no tracking.</p>

      <div className={styles.actions}>
        <button type="button" className={styles.primaryAction} onClick={onPlayComputer}>
          Play computer
        </button>
        <button type="button" className={styles.secondaryAction} onClick={onPlayLocal}>
          Play (local two-player)
        </button>
        <button type="button" className={styles.secondaryAction} disabled>
          Puzzles (coming soon)
        </button>
        <button type="button" className={styles.secondaryAction} onClick={onAbout}>
          About / Licences / Privacy
        </button>
      </div>
    </div>
  );
}
