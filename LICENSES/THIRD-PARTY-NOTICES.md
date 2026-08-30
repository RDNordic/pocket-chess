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

## Scheduler

- Version distributed: 0.27.0 (confirm against `package-lock.json` at each
  release; this is a transitive dependency of React DOM, not a direct
  dependency of this project).
- Licence: MIT.
- Source: https://github.com/facebook/react (part of the React monorepo).
- Role: task-scheduling primitives used internally by React DOM. Confirmed
  actually present in `dist/` (not merely installed) by checking the built
  bundle for its distinctive exported names
  (`unstable_scheduleCallback`, `unstable_ImmediatePriority`).

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

## Workbox

- Version distributed: 7.4.1 (confirm against `package-lock.json` at each
  release; this is pulled in transitively by `vite-plugin-pwa`, which pins
  `workbox-build`/`workbox-window` to `^7.4.1`).
- Licence: MIT.
- Source: https://github.com/GoogleChrome/workbox
- Role: the generated service worker (`dist/sw.js` and
  `dist/workbox-*.js`) is Workbox's own precaching/routing runtime, compiled
  in by `vite-plugin-pwa` at build time - this is runtime code shipped to
  every visitor's browser, not just build tooling, so it belongs here rather
  than only in `package.json`.

```
Copyright 2018 Google LLC

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

---

## vite-plugin-pwa

- Version distributed: 1.3.0 (confirm against `package-lock.json` at each
  release).
- Licence: MIT.
- Source: https://github.com/vite-pwa/vite-plugin-pwa
- Role: `dist/registerSW.js` is not original code written for this project -
  it is generated at build time from one of vite-plugin-pwa's own source
  templates (`client/build/register.js` in the installed package), copied
  into the production output essentially verbatim. That makes it shipped
  third-party code, not merely build-time tooling, the same reasoning that
  already applies to Workbox above (which vite-plugin-pwa also compiles
  into `dist/sw.js`/`dist/workbox-*.js` at build time).

```
MIT License

Copyright (c) 2020-PRESENT Anthony Fu <https://github.com/antfu>

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

## Stockfish (Phase 2A)

- Build distributed: `stockfish-18-lite-single.js` +
  `stockfish-18-lite-single.wasm` (the "lite single-threaded" flavour) from
  the **nmrugg/stockfish.js** project - a browser/WebAssembly build of
  Stockfish maintained by Nathan Rugg for Chess.com, LLC.
- Upstream project: https://github.com/nmrugg/stockfish.js
- Exact release used: tag `v18.0.0`
  (https://github.com/nmrugg/stockfish.js/releases/tag/v18.0.0), published
  2026-02-11. That release's own description references the upstream
  official Stockfish source commit
  `official-stockfish/Stockfish@cb3d4ee9b47d0c5aae855b12379378ea1439675c`.
- Files as vendored, with checksums of the exact bytes committed to this
  repository (`public/engine/`):
  - `stockfish-18-lite-single.js` - sha256
    `2278005057f381491f1c9bb3e44c9f5920b3a00bef9759e33cc6582769a1f1fe`
  - `stockfish-18-lite-single.wasm` - sha256
    `a8fbc05ec6920b56d7485826dcb02c5ffd2826bcbf751cf973046f237a9096f1`
- Licence: **GPLv3** (not "or later" - this is the upstream project's own
  licence, distinct from this repository's own GPL-3.0-or-later licence).
  The file's own header reads: "Stockfish.js 18 (c) 2026, Chess.com, LLC ...
  License: GPLv3 ... Based on Stockfish (c) T. Romstad, M. Costalba,
  J. Kiiski, G. Linscott and other contributors." The full GPLv3 licence
  text is already present verbatim in this repository's top-level `LICENSE`
  file (Pocket Chess's own GPL-3.0-or-later licence necessarily contains the
  full GPLv3 text) - no separate copy is needed to satisfy the "include the
  licence" requirement.
- Modifications: **none**. These two files are the exact, unmodified bytes
  of the upstream `v18.0.0` release assets (see checksums above) - Pocket
  Chess does not patch, recompile, or otherwise alter Stockfish.
- Corresponding source availability: because these are unmodified upstream
  release artefacts (not a Pocket-Chess-specific build), and this project
  does not distribute them for a fee, GPLv3 section 6(d) is satisfied by
  offering equivalent network access to the Corresponding Source through
  the same kind of place, at no charge: the exact commit/tag pointer above
  (https://github.com/nmrugg/stockfish.js/releases/tag/v18.0.0, itself
  referencing official-stockfish/Stockfish@cb3d4ee9) is a durable public
  location providing that source, maintained by the upstream project
  independently of this repository. If that upstream location ever becomes
  unavailable, the recorded commit hashes above are sufficient to locate or
  reconstruct equivalent source from `official-stockfish/Stockfish` and
  `nmrugg/stockfish.js`.
- Role: chess engine used to compute candidate moves, run inside a Web
  Worker via `src/engine/StockfishAdapter.ts`. Stockfish is never
  authoritative for legality/turn/check/checkmate/draw/history - every move
  it proposes is validated through `src/chess/ChessGame.ts` (chess.js)
  before it can affect a game. As of Phase 2A there is no user-facing "Play
  computer" feature yet; the adapter exists as an isolated, tested boundary
  only.
- Why this specific build (lite, single-threaded): dramatically smaller
  (~7MB vs >100MB) and still far stronger than the intended user; critically,
  the single-threaded build does not use `SharedArrayBuffer` and therefore
  does not require Cross-Origin-Opener-Policy/Cross-Origin-Embedder-Policy
  headers or cross-origin isolation - simplifying static hosting (GitHub
  Pages/Cloudflare) and reducing Safari/iOS PWA compatibility risk. See
  build spec section 5.

## Lichess puzzle database (not yet integrated)

The Lichess open puzzle database (CC0) will be used to build the bundled
puzzle dataset in Phase 5. Provenance (puzzle IDs, source export date) will
be retained even though CC0 does not require attribution.
