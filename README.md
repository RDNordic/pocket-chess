# Pocket Chess

Offline-first personal chess trainer PWA. No accounts, no backend, no tracking.

See pocket-chess-build-spec.md for the full specification and AGENTS.md /
CLAUDE.md for the current implementation status and working rules.

## Development

```bash
npm install
npm run dev
npm test
npm run lint
npm run build
npm run test:e2e
```

## Deploying under a sub-path (e.g. GitHub Pages)

The app defaults to being hosted at the domain root (`/`). To deploy under a
repository sub-path such as `https://<account>.github.io/pocket-chess/`, set
`VITE_BASE_PATH` at build time - this is the single source of truth for
both Vite's asset base and the PWA manifest's `start_url`/`scope`:

```bash
VITE_BASE_PATH=/pocket-chess/ npm run build
```

## Status

Phase 0 (scaffold) and Phase 1 (deterministic local two-player chess) are
implemented. Stockfish, puzzles, and persistence are not yet built - see
next-steps.md.
