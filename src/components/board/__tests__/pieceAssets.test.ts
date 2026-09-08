import { describe, expect, it } from 'vitest';
import type { PieceType, PlayerColour } from '../../../chess/chessTypes';
import { pieceAccessibleName, pieceAssetUrl } from '../pieceAssets';

const PIECE_TYPES: PieceType[] = ['k', 'q', 'r', 'b', 'n', 'p'];
const COLOURS: PlayerColour[] = ['white', 'black'];

describe('pieceAssetUrl', () => {
  it('resolves a non-empty asset URL for every colour/type combination', () => {
    for (const colour of COLOURS) {
      for (const type of PIECE_TYPES) {
        const url = pieceAssetUrl(type, colour);
        expect(typeof url).toBe('string');
        expect(url.length).toBeGreaterThan(0);
      }
    }
  });

  it('maps every one of the 12 pieces to a distinct asset', () => {
    const urls = new Set<string>();
    for (const colour of COLOURS) {
      for (const type of PIECE_TYPES) {
        urls.add(pieceAssetUrl(type, colour));
      }
    }
    expect(urls.size).toBe(12);
  });

  it('maps the same piece type to a different asset per colour', () => {
    for (const type of PIECE_TYPES) {
      expect(pieceAssetUrl(type, 'white')).not.toBe(pieceAssetUrl(type, 'black'));
    }
  });
});

describe('pieceAccessibleName', () => {
  it('combines colour and piece name', () => {
    expect(pieceAccessibleName('k', 'white')).toBe('white king');
    expect(pieceAccessibleName('q', 'black')).toBe('black queen');
    expect(pieceAccessibleName('r', 'white')).toBe('white rook');
    expect(pieceAccessibleName('b', 'black')).toBe('black bishop');
    expect(pieceAccessibleName('n', 'white')).toBe('white knight');
    expect(pieceAccessibleName('p', 'black')).toBe('black pawn');
  });
});
