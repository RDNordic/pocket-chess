import { EngineError } from './engineTypes';
import type { EngineDifficulty } from './engineTypes';

/**
 * The single, authoritative mapping from a friendly difficulty label to the
 * Stockfish `Skill Level` value that produces it (build spec section 14:
 * "store the mapping in one configuration file rather than scattering magic
 * values through the codebase"). `Skill Level` is a spin option verified
 * locally against the vendored Stockfish 18 Lite WASM build to range 0-20
 * (default 20) - these four values are chosen points within that range, not
 * calibrated ratings. `strongest` intentionally maps to the engine's own
 * default (20), so a session configured with it behaves identically to the
 * engine never having received a `Skill Level` `setoption` at all.
 */
export const SKILL_LEVEL_BY_DIFFICULTY: Readonly<Record<EngineDifficulty, number>> = {
  gentle: 0,
  casual: 5,
  challenging: 10,
  strongest: 20,
};

/** Resolves `difficulty` to its `Skill Level` value. Throws `EngineError`
 * for anything not in `SKILL_LEVEL_BY_DIFFICULTY` - a malformed runtime
 * configuration (e.g. a bad value smuggled past TypeScript via `as any`)
 * must never silently fall back to a default strength. */
export function skillLevelForDifficulty(difficulty: EngineDifficulty): number {
  const skillLevel = SKILL_LEVEL_BY_DIFFICULTY[difficulty];
  if (skillLevel === undefined) {
    throw new EngineError(`invalid engine difficulty: "${String(difficulty)}"`);
  }
  return skillLevel;
}
