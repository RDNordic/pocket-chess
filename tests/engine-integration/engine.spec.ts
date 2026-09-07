import { expect, test } from '@playwright/test';
import { ChessGame } from '../../src/chess/ChessGame';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

type EngineDifficulty = 'gentle' | 'casual' | 'challenging' | 'strongest';

declare global {
  interface Window {
    __pocketChessEngineHarness: {
      start(config?: { difficulty: EngineDifficulty }): Promise<void>;
      findBestMove(
        fen: string,
        limits: { movetimeMs: number },
      ): Promise<{ uci: string; ponder?: string }>;
      stop(): Promise<void>;
      dispose(): void;
      getState(): string;
    };
  }
}

test.describe('real Stockfish engine (Web Worker + WASM)', () => {
  test('launches, completes the UCI handshake, and returns a legal bestmove', async ({ page }) => {
    await page.goto('/tests/engine-integration/engine-harness.html');

    try {
      // 1-3: the Worker launches and the adapter's start() only resolves
      // once the full uci->uciok / isready->readyok handshake completes.
      await page.evaluate(() => window.__pocketChessEngineHarness.start());
      const stateAfterStart = await page.evaluate(() =>
        window.__pocketChessEngineHarness.getState(),
      );
      expect(stateAfterStart).toBe('ready');

      // 4-5: a known legal FEN is supplied and the engine returns bestmove.
      const move = await page.evaluate(
        ([fen]) =>
          window.__pocketChessEngineHarness.findBestMove(fen, { movetimeMs: 300 }),
        [START_FEN],
      );

      // 6: the returned move can be parsed - it is a well-formed UCI move.
      expect(move.uci).toMatch(/^[a-h][1-8][a-h][1-8][qrbn]?$/);

      // 7: that move is legal when checked through ChessGame - never
      // trust engine output as authoritative on its own.
      const game = new ChessGame(START_FEN);
      const applied = game.applyUciMove(move.uci);
      expect(applied).not.toBeNull();

      const stateAfterMove = await page.evaluate(() =>
        window.__pocketChessEngineHarness.getState(),
      );
      expect(stateAfterMove).toBe('ready');
    } finally {
      // Cleanup so a failure above cannot leave the Worker (and the WASM
      // instance it holds) running past this test.
      await page.evaluate(() => window.__pocketChessEngineHarness.dispose()).catch(() => {});
    }
  });

  test('stop() cancels an in-flight search cleanly', async ({ page }) => {
    await page.goto('/tests/engine-integration/engine-harness.html');

    try {
      await page.evaluate(() => window.__pocketChessEngineHarness.start());

      const searchOutcome = page.evaluate(
        ([fen]) =>
          window.__pocketChessEngineHarness
            .findBestMove(fen, { movetimeMs: 10_000 })
            .then(
              () => 'resolved',
              (error: unknown) => (error instanceof Error ? error.message : String(error)),
            ),
        [START_FEN],
      );

      await page.evaluate(() => window.__pocketChessEngineHarness.stop());

      await expect(searchOutcome).resolves.toMatch(/stopped/);
    } finally {
      await page.evaluate(() => window.__pocketChessEngineHarness.dispose()).catch(() => {});
    }
  });

  const DIFFICULTIES: readonly EngineDifficulty[] = ['gentle', 'casual', 'challenging', 'strongest'];

  for (const difficulty of DIFFICULTIES) {
    test(`difficulty "${difficulty}": the real engine's advertised capabilities support it and it returns a legal move`, async ({
      page,
    }) => {
      await page.goto('/tests/engine-integration/engine-harness.html');

      try {
        // start() resolves only once the real engine has advertised the
        // "Skill Level"/"UCI_LimitStrength" capabilities this preset needs
        // and completed the isready/readyok handshake after configuring
        // them (build spec section 14) - a real, unmocked capability check
        // against the vendored Stockfish 18 Lite WASM build.
        await page.evaluate(
          ([selectedDifficulty]) =>
            window.__pocketChessEngineHarness.start({ difficulty: selectedDifficulty }),
          [difficulty],
        );
        const stateAfterStart = await page.evaluate(() =>
          window.__pocketChessEngineHarness.getState(),
        );
        expect(stateAfterStart).toBe('ready');

        const move = await page.evaluate(
          ([fen]) => window.__pocketChessEngineHarness.findBestMove(fen, { movetimeMs: 300 }),
          [START_FEN],
        );

        // No exact-move or calibrated-strength assertion - only that the
        // move is well-formed UCI and legal in the position.
        expect(move.uci).toMatch(/^[a-h][1-8][a-h][1-8][qrbn]?$/);
        const game = new ChessGame(START_FEN);
        expect(game.applyUciMove(move.uci)).not.toBeNull();
      } finally {
        await page.evaluate(() => window.__pocketChessEngineHarness.dispose()).catch(() => {});
      }
    });
  }
});
