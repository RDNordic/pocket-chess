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
          <li>
            <strong>Stockfish</strong> (GPLv3, via the nmrugg/stockfish.js
            v18.0.0 lite single-threaded build) - the chess engine, run in a
            Web Worker. Unmodified from upstream; see the third-party
            notices for the exact source pointer. Not yet wired into any
            user-facing feature.
          </li>
          <li>
            <strong>Chess piece artwork</strong> (GPLv2+, the "cburnett" set
            by Colin M.L. Burnett, as vendored by the Lichess project) -
            recoloured only; see the third-party notices for the exact
            source and licence details.
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
        <p>
          Pocket Chess is designed to collect as little information about
          you as possible.
        </p>
        <ul>
          <li>No account or sign-in.</li>
          <li>No analytics.</li>
          <li>No advertising.</li>
          <li>No profiling.</li>
          <li>No application telemetry.</li>
          <li>No game history is uploaded.</li>
          <li>Chess rules and Stockfish run locally in your browser.</li>
          <li>
            Game data and settings are intended to remain on your device
            unless you deliberately export them.
          </li>
        </ul>
        <p>
          When Pocket Chess is served from a website, the hosting provider
          necessarily receives ordinary technical request information - such
          as your IP address and HTTP request metadata - in order to deliver
          and secure the application. That is a normal part of how the web
          works and is unrelated to this application's own code. Pocket
          Chess itself does not use that hosting request data for analytics,
          advertising, behavioural profiling, or gameplay tracking, and does
          not transmit positions, games, moves, or playing behaviour to any
          analytics service.
        </p>
      </section>
    </div>
  );
}
