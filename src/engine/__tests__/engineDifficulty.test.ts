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
});
