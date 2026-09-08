import { describe, expect, it } from 'vitest';
import { parseUciLine } from '../UciParser';

describe('parseUciLine', () => {
  it('recognises the uci handshake response', () => {
    expect(parseUciLine('uciok')).toEqual({ type: 'uciok' });
  });

  it('recognises the isready handshake response', () => {
    expect(parseUciLine('readyok')).toEqual({ type: 'readyok' });
  });

  it('parses a normal bestmove line', () => {
    expect(parseUciLine('bestmove e2e4')).toEqual({
      type: 'bestmove',
      move: 'e2e4',
      ponder: undefined,
    });
  });

  it('parses a bestmove line with a ponder move', () => {
    expect(parseUciLine('bestmove e2e4 ponder e7e5')).toEqual({
      type: 'bestmove',
      move: 'e2e4',
      ponder: 'e7e5',
    });
  });

  it('parses a promotion bestmove', () => {
    expect(parseUciLine('bestmove e7e8q')).toEqual({
      type: 'bestmove',
      move: 'e7e8q',
      ponder: undefined,
    });
  });

  it('represents "bestmove (none)" as a null move rather than a literal string', () => {
    expect(parseUciLine('bestmove (none)')).toEqual({
      type: 'bestmove',
      move: null,
      ponder: undefined,
    });
  });

  it('trims surrounding whitespace before matching', () => {
    expect(parseUciLine('  uciok  ')).toEqual({ type: 'uciok' });
    expect(parseUciLine('  bestmove e2e4  ')).toEqual({
      type: 'bestmove',
      move: 'e2e4',
      ponder: undefined,
    });
  });

  it('treats irrelevant UCI lines (id/info/banner) as unknown', () => {
    expect(parseUciLine('id name Stockfish 18')).toEqual({
      type: 'unknown',
      line: 'id name Stockfish 18',
    });
    expect(parseUciLine('info depth 10 seldepth 14 multipv 1 score cp 25')).toEqual({
      type: 'unknown',
      line: 'info depth 10 seldepth 14 multipv 1 score cp 25',
    });
    expect(parseUciLine('Stockfish 18 by the Stockfish developers')).toEqual({
      type: 'unknown',
      line: 'Stockfish 18 by the Stockfish developers',
    });
  });

  it('parses a spin option line with default/min/max (e.g. "Skill Level")', () => {
    expect(parseUciLine('option name Skill Level type spin default 20 min 0 max 20')).toEqual({
      type: 'option',
      name: 'Skill Level',
      optionType: 'spin',
      default: '20',
      min: 0,
      max: 20,
    });
  });

  it('parses a check option line with only a default (e.g. "UCI_LimitStrength")', () => {
    expect(parseUciLine('option name UCI_LimitStrength type check default false')).toEqual({
      type: 'option',
      name: 'UCI_LimitStrength',
      optionType: 'check',
      default: 'false',
      min: undefined,
      max: undefined,
    });
  });

  it('parses an option name unrelated to the two this project cares about the same generic way', () => {
    expect(parseUciLine('option name Threads type spin default 1 min 1 max 1024')).toEqual({
      type: 'option',
      name: 'Threads',
      optionType: 'spin',
      default: '1',
      min: 1,
      max: 1024,
    });
  });

  it('treats malformed/empty lines as unknown rather than throwing', () => {
    expect(() => parseUciLine('')).not.toThrow();
    expect(parseUciLine('')).toEqual({ type: 'unknown', line: '' });
    expect(parseUciLine('bestmove')).toEqual({ type: 'unknown', line: 'bestmove' });
    expect(parseUciLine('garbled \x00 output')).toEqual({
      type: 'unknown',
      line: 'garbled \x00 output',
    });
  });
});
