import { describe, expect, it } from 'vitest';
import { EngineError } from '../engineTypes';
import { SKILL_LEVEL_BY_DIFFICULTY, skillLevelForDifficulty } from '../engineDifficulty';

describe('skillLevelForDifficulty', () => {
  it.each([
    ['gentle', 0],
    ['casual', 5],
    ['challenging', 10],
    ['strongest', 20],
  ] as const)('maps "%s" to Skill Level %i', (difficulty, expected) => {
    expect(skillLevelForDifficulty(difficulty)).toBe(expected);
    expect(SKILL_LEVEL_BY_DIFFICULTY[difficulty]).toBe(expected);
  });

  it('throws EngineError for a difficulty value outside the known set', () => {
    expect(() => skillLevelForDifficulty('bogus' as never)).toThrow(EngineError);
    expect(() => skillLevelForDifficulty('bogus' as never)).toThrow(/invalid engine difficulty/);
  });

  it.each(['toString', 'constructor', '__proto__', 'hasOwnProperty', 'valueOf', 'toLocaleString'])(
    'rejects the inherited Object.prototype property name "%s" rather than resolving it through the prototype chain',
    (inherited) => {
      // A plain object indexed with one of these resolves through the
      // prototype chain to a function, not `undefined` - a naive
      // `SKILL_LEVEL_BY_DIFFICULTY[difficulty] === undefined` check would
      // wrongly accept it. Confirm the mapping itself doesn't already
      // (accidentally) own one of these keys, so the test is meaningful.
      expect(Object.hasOwn(SKILL_LEVEL_BY_DIFFICULTY, inherited)).toBe(false);
      expect(() => skillLevelForDifficulty(inherited as never)).toThrow(EngineError);
      expect(() => skillLevelForDifficulty(inherited as never)).toThrow(/invalid engine difficulty/);
    },
  );
});
