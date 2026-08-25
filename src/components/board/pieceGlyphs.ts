import type { PieceType, PlayerColour } from '../../chess/chessTypes';

// Original glyph set using standard Unicode chess symbols. No third-party
// artwork is used; see LICENSES/THIRD-PARTY-NOTICES.md.
const WHITE_GLYPHS: Record<PieceType, string> = {
  k: '♔',
  q: '♕',
  r: '♖',
  b: '♗',
  n: '♘',
  p: '♙',
};

const BLACK_GLYPHS: Record<PieceType, string> = {
  k: '♚',
  q: '♛',
  r: '♜',
  b: '♝',
  n: '♞',
  p: '♟',
};

const PIECE_NAMES: Record<PieceType, string> = {
  k: 'king',
  q: 'queen',
  r: 'rook',
  b: 'bishop',
  n: 'knight',
  p: 'pawn',
};

export function pieceGlyph(type: PieceType, colour: PlayerColour): string {
  return colour === 'white' ? WHITE_GLYPHS[type] : BLACK_GLYPHS[type];
}

export function pieceAccessibleName(type: PieceType, colour: PlayerColour): string {
  return `${colour} ${PIECE_NAMES[type]}`;
}
