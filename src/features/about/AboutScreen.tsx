import styles from './AboutScreen.module.css';

interface AboutScreenProps {
  onExit: () => void;
}

// `import.meta.env.BASE_URL` is Vite's own resolved `base` config value
// (see vite.config.ts's VITE_BASE_PATH), always ending in '/'. Building
// links from it - rather than a literal '/legal/...' - is what makes these
// links work correctly under both the root deployment and a sub-path
// deployment (e.g. '/pocket-chess/'), matching how the rest of the app's
// assets are already resolved.
const licenceHref = `${import.meta.env.BASE_URL}legal/LICENSE.txt`;
const thirdPartyNoticesHref = `${import.meta.env.BASE_URL}legal/THIRD-PARTY-NOTICES.md`;

/**
 * Small, static About/Licences/Privacy surface. Deliberately not a
 * "settings" or "legal centre" screen - just enough for a user (or a
 * reviewer) to see the licence, the third-party notices that apply, and an
 * honest statement of what the app does and doesn't do with their data,
 * without leaving the app.
 *
 * The linked licence/notice files under `legal/` are not hand-duplicated
 * text - they're exact copies of this repository's own top-level `LICENSE`
 * and `LICENSES/THIRD-PARTY-NOTICES.md`, produced at build time by
 * `scripts/copy-legal-files.mjs` (see `npm run build`/`npm run dev`), so
 * there is exactly one canonical source for each and nothing to drift.
 */
export function AboutScreen({ onExit }: AboutScreenProps) {
  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <button type="button" onClick={onExit} aria-label="Back to home">
          Back
        </button>
        <h1>About</h1>
      </header>

      <section aria-labelledby="licence-heading">
        <h2 id="licence-heading">Licence</h2>
        <p>
          Pocket Chess is free software, licensed under the{' '}
          <strong>GNU General Public License, version 3 or later</strong>{' '}
          (GPL-3.0-or-later).
        </p>
        <p>
          <a href={licenceHref} target="_blank" rel="noopener noreferrer">
            Read the full licence text
          </a>
        </p>
      </section>

      <section aria-labelledby="third-party-heading">
        <h2 id="third-party-heading">Third-party notices</h2>
        <p>This app is built with the following runtime dependencies:</p>
        <ul>
          <li>
            <strong>chess.js</strong> (BSD-2-Clause) - the chess rules engine.
          </li>
          <li>
            <strong>React</strong> and <strong>React DOM</strong> (MIT) - the UI
            rendering runtime.
          </li>
          <li>
            <strong>Scheduler</strong> (MIT) - used internally by React DOM.
          </li>
          <li>
            <strong>Workbox</strong> and <strong>vite-plugin-pwa</strong> (MIT) -
            the offline/installable app (service worker) runtime and the
            build-time code that generates it.
          </li>
        </ul>
        <p>
          <a href={thirdPartyNoticesHref} target="_blank" rel="noopener noreferrer">
            Read the full third-party notices
          </a>
        </p>
      </section>

      <section aria-labelledby="privacy-heading">
        <h2 id="privacy-heading">Privacy</h2>
        <ul>
          <li>No account or sign-in.</li>
          <li>No analytics.</li>
          <li>No advertising.</li>
          <li>No telemetry from this application.</li>
          <li>No backend - chess rules and game state run entirely in your browser.</li>
          <li>No game history is uploaded anywhere.</li>
        </ul>
        <p>
          Pocket Chess is distributed as static files that can be hosted by
          any standard web host. Whichever provider hosts it will
          necessarily receive ordinary HTTP requests to deliver those files
          - the same as any website - which may include information that
          provider's own web server ordinarily logs, such as your IP
          address. That is a normal part of how the web works, is unrelated
          to this application's own code, and is not used by Pocket Chess
          itself for tracking or analytics.
        </p>
      </section>
    </div>
  );
}
