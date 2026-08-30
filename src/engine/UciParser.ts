/**
 * The subset of UCI engine-to-GUI responses this adapter actually reacts
 * to. Everything else (`id`, `option`, `info`, the startup banner, blank
 * lines, or anything malformed) parses to `unknown` and is silently
 * ignored by the caller - this is deliberately not a general UCI parser.
 */
export type UciEvent =
  | { type: 'uciok' }
  | { type: 'readyok' }
  | { type: 'bestmove'; move: string | null; ponder?: string }
  | { type: 'unknown'; line: string };

const BESTMOVE_PATTERN = /^bestmove\s+(\S+)(?:\s+ponder\s+(\S+))?/;

/** Parses a single trimmed line of engine output. Never throws. */
export function parseUciLine(line: string): UciEvent {
  const trimmed = line.trim();

  if (trimmed === 'uciok') {
    return { type: 'uciok' };
  }
  if (trimmed === 'readyok') {
    return { type: 'readyok' };
  }

  const bestmoveMatch = BESTMOVE_PATTERN.exec(trimmed);
  if (bestmoveMatch) {
    const [, move, ponder] = bestmoveMatch;
    return {
      type: 'bestmove',
      // Stockfish reports "bestmove (none)" when there is no legal move in
      // the supplied position (e.g. it was asked to search a terminal
      // position) - represented distinctly from a real move rather than
      // being passed through as the literal string "(none)".
      move: move === '(none)' ? null : move,
      ponder,
    };
  }

  return { type: 'unknown', line: trimmed };
}
