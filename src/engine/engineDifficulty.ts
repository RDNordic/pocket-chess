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
 * for anything not a genuine, own entry of `SKILL_LEVEL_BY_DIFFICULTY` whose
 * value is itself a valid Skill Level number - a malformed runtime
 * configuration (e.g. a bad value smuggled past TypeScript via `as any`)
 * must never silently fall back to a default strength.
 *
 * Deliberately does not use plain `SKILL_LEVEL_BY_DIFFICULTY[difficulty]`
 * indexing followed by an `undefined` check: `difficulty` can be an
 * arbitrary string at runtime, and indexing a plain object with an
 * inherited property name (`"toString"`, `"constructor"`, `"__proto__"`,
 * `"hasOwnProperty"`, ...) resolves through the prototype chain to a
 * function, not `undefined` - silently passing validation and handing a
 * function where a number is required. `Object.hasOwn` first, then a
 * `typeof`/finiteness check on the resolved value, closes both that hole
 * and any future one where a mapping entry itself is accidentally not a
 * finite number. */
export function skillLevelForDifficulty(difficulty: EngineDifficulty): number {
  if (!Object.hasOwn(SKILL_LEVEL_BY_DIFFICULTY, difficulty)) {
    throw new EngineError(`invalid engine difficulty: "${String(difficulty)}"`);
  }
  const skillLevel = SKILL_LEVEL_BY_DIFFICULTY[difficulty];
  if (typeof skillLevel !== 'number' || !Number.isFinite(skillLevel)) {
    throw new EngineError(`invalid engine difficulty: "${String(difficulty)}"`);
  }
  return skillLevel;
}
