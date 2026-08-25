# Third-party notices

## chess.js

- Version: 1.4.0 (verify against `package-lock.json` at build time)
- Licence: BSD-2-Clause
- Source: https://github.com/jhlywa/chess.js
- Role: authoritative chess rules engine (legality, FEN, PGN, game-over detection).

## Piece artwork

- Standard Unicode chess symbols (U+2654-U+265F), rendered as text glyphs in
  `src/components/board/pieceGlyphs.ts`. No third-party image or font assets
  are bundled for pieces.

## Stockfish (not yet integrated)

Stockfish is GPLv3-licensed and will be added in Phase 2. When integrated,
this file must be updated with: exact upstream version/commit, the GPLv3
licence text, attribution, and a source pointer sufficient to satisfy GPLv3
distribution requirements.

## Lichess puzzle database (not yet integrated)

The Lichess open puzzle database (CC0) will be used to build the bundled
puzzle dataset in Phase 5. Provenance (puzzle IDs, source export date) will
be retained even though CC0 does not require attribution.
