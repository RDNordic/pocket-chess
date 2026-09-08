/**
 * The subset of UCI engine-to-GUI responses this adapter actually reacts
 * to. Everything else (`id`, `info`, the startup banner, blank lines, or
 * anything malformed) parses to `unknown` and is silently ignored by the
 * caller - this is deliberately not a general UCI parser. `option` lines
 * are recognised (real UCI syntax: `option name <name> type <type>
 * [default <v>] [min <v>] [max <v>]`) since `StockfishAdapter` needs them
 * to validate the engine's advertised difficulty-related capabilities
 * (build spec section 14) - but the parser itself does not decide which
 * option names matter, that filtering happens in the adapter.
 */
export type UciEvent =
  | { type: 'uciok' }
  | { type: 'readyok' }
  | { type: 'bestmove'; move: string | null; ponder?: string }
  | { type: 'option'; name: string; optionType: string; default?: string; min?: number; max?: number }
  | { type: 'unknown'; line: string };

const BESTMOVE_PATTERN = /^bestmove\s+(\S+)(?:\s+ponder\s+(\S+))?/;

/** Captures the option's name (anything up to the mandatory `type` token),
 * its type word, and the optional `default`/`min`/`max` tokens - the only
 * pieces of an `option` line this project ever needs. */
const OPTION_PATTERN =
  /^option name (.+?) type (\S+)(?:.*?\bdefault (\S+))?(?:.*?\bmin (-?\d+))?(?:.*?\bmax (-?\d+))?/;

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

  const optionMatch = OPTION_PATTERN.exec(trimmed);
  if (optionMatch) {
    const [, name, optionType, defaultValue, min, max] = optionMatch;
    return {
      type: 'option',
      name,
      optionType,
      default: defaultValue,
      min: min === undefined ? undefined : Number(min),
      max: max === undefined ? undefined : Number(max),
    };
  }

  return { type: 'unknown', line: trimmed };
}
