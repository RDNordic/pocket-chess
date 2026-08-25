import styles from './HomeScreen.module.css';

interface HomeScreenProps {
  onPlayLocal: () => void;
}

export function HomeScreen({ onPlayLocal }: HomeScreenProps) {
  return (
    <div className={styles.screen}>
      <h1 className={styles.title}>Pocket Chess</h1>
      <p className={styles.tagline}>Offline chess practice. No account, no tracking.</p>

      <div className={styles.actions}>
        <button type="button" className={styles.primaryAction} onClick={onPlayLocal}>
          Play (local two-player)
        </button>
        <button type="button" className={styles.secondaryAction} disabled>
          Puzzles (coming soon)
        </button>
      </div>
    </div>
  );
}
