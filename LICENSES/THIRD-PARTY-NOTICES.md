# Third-party notices

This file covers dependencies actually bundled into the production
application output (`npm run build`'s `dist/`), plus artwork. Build-time and
test-only tooling (Vite, Vitest, Playwright, TypeScript, Testing Library,
ESLint-equivalents, etc.) is not distributed with the app and is not listed
here; see `package.json` for those.

---

## chess.js

- Version distributed: 1.4.0 (confirm against `package-lock.json` at each
  release; do not assume this stays current).
- Licence: BSD-2-Clause.
- Source: https://github.com/jhlywa/chess.js
- Role: authoritative chess rules engine (legality, FEN, PGN, game-over
  detection) - see `src/chess/ChessGame.ts`.

```
Copyright (c) 2025, Jeff Hlywa (jhlywa@gmail.com)
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice,
   this list of conditions and the following disclaimer.
2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE
LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
POSSIBILITY OF SUCH DAMAGE.
```

---

## React and React DOM

- Version distributed: 19.2.8 (confirm against `package-lock.json` at each
  release).
- Licence: MIT.
- Source: https://github.com/facebook/react
- Role: UI rendering runtime.

```
MIT License

Copyright (c) Meta Platforms, Inc. and affiliates.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## Piece artwork

Standard Unicode chess symbols (U+2654-U+265F), rendered as text glyphs in
`src/components/board/pieceGlyphs.ts`. These are characters of the Unicode
standard, not a licensed third-party asset; no separate licence notice
applies. No third-party image or font assets are bundled for pieces.

---

## Stockfish (not yet integrated)

Stockfish is GPLv3-licensed and will be added in Phase 2, not this phase.
When integrated, this file must be updated with: exact upstream
version/commit, the GPLv3 licence text, attribution, and a source pointer
sufficient to satisfy GPLv3 distribution requirements. Not applicable yet -
do not add Stockfish licensing until Stockfish is actually bundled.

## Lichess puzzle database (not yet integrated)

The Lichess open puzzle database (CC0) will be used to build the bundled
puzzle dataset in Phase 5. Provenance (puzzle IDs, source export date) will
be retained even though CC0 does not require attribution.
