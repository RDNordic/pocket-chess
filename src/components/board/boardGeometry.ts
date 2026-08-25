import type { SquareId } from '../../chess/chessTypes';

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
const RANKS = ['1', '2', '3', '4', '5', '6', '7', '8'] as const;

export type BoardOrientation = 'white' | 'black';

/** Returns the 64 square ids in on-screen row-major order (top-left first). */
export function orderedSquares(orientation: BoardOrientation): SquareId[] {
  const files = orientation === 'white' ? FILES : [...FILES].reverse();
  const ranks = orientation === 'white' ? [...RANKS].reverse() : RANKS;
  const squares: SquareId[] = [];
  for (const rank of ranks) {
    for (const file of files) {
      squares.push(`${file}${rank}` as SquareId);
    }
  }
  return squares;
}

export function isLightSquare(square: SquareId): boolean {
  const file = square.charCodeAt(0) - 'a'.charCodeAt(0);
  const rank = Number(square[1]) - 1;
  return (file + rank) % 2 === 1;
}
