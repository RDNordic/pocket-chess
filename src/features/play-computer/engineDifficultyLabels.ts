import type { EngineDifficulty } from '../../engine/engineTypes';

/**
 * Display-only labels for `EngineDifficulty`, kept separate from
 * `src/engine/engineDifficulty.ts`'s numeric `Skill Level` mapping - React
 * must never contain a Stockfish option value, only these friendly names
 * (build spec section 12's "React components must never send raw UCI
 * commands" boundary, extended here to the numeric mapping too).
 */
export const DIFFICULTY_LABELS: Readonly<Record<EngineDifficulty, string>> = {
  gentle: 'Gentle',
  casual: 'Casual',
  challenging: 'Challenging',
  strongest: 'Strongest',
};

/** Display order for the difficulty selector - easiest to strongest. */
export const DIFFICULTY_ORDER: readonly EngineDifficulty[] = [
  'gentle',
  'casual',
  'challenging',
  'strongest',
];
