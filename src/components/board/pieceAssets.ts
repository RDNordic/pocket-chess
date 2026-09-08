import type { PieceType, PlayerColour } from '../../chess/chessTypes';

// Local vector piece artwork ("cburnett", by Colin M.L. Burnett) - see
// LICENSES/THIRD-PARTY-NOTICES.md for licence/provenance. Every file is a
// static local asset resolved at build time by Vite's ordinary asset
// import handling (no runtime fetch, no CDN, no third-party dependency
// added just to render SVGs). vite.config.ts sets `build.assetsInlineLimit:
// 0` specifically so these always resolve to real, separately-served
// same-origin files rather than being inlined as `data:` URIs (every one
// of these 12 files is small enough to qualify for Vite's default 4KB
// inlining) - the production CSP's `img-src 'self'` does not include
// `data:`, and this project does not weaken the CSP to add it.
import wK from './pieces/wK.svg';
import wQ from './pieces/wQ.svg';
import wR from './pieces/wR.svg';
import wB from './pieces/wB.svg';
import wN from './pieces/wN.svg';
import wP from './pieces/wP.svg';
import bK from './pieces/bK.svg';
import bQ from './pieces/bQ.svg';
import bR from './pieces/bR.svg';
import bB from './pieces/bB.svg';
import bN from './pieces/bN.svg';
import bP from './pieces/bP.svg';

/**
 * The single, centralised piece colour + type -> local SVG asset mapping
 * (build spec's presentation-layer boundary: this is the only place that
 * knows which file renders which piece - callers only ever go through
 * `pieceAssetUrl`, never import a `pieces/*.svg` file directly).
 */
const PIECE_ASSET_URLS: Record<PlayerColour, Record<PieceType, string>> = {
  white: { k: wK, q: wQ, r: wR, b: wB, n: wN, p: wP },
  black: { k: bK, q: bQ, r: bR, b: bB, n: bN, p: bP },
};

export function pieceAssetUrl(type: PieceType, colour: PlayerColour): string {
  return PIECE_ASSET_URLS[colour][type];
}

const PIECE_NAMES: Record<PieceType, string> = {
  k: 'king',
  q: 'queen',
  r: 'rook',
  b: 'bishop',
  n: 'knight',
  p: 'pawn',
};

export function pieceAccessibleName(type: PieceType, colour: PlayerColour): string {
  return `${colour} ${PIECE_NAMES[type]}`;
}
