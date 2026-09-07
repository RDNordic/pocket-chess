// Test-only harness, not part of the shipped application - see the
// comment in engine-harness.html. Exposes a tiny, explicit API on
// `window` so the Playwright test (engine.spec.ts) can drive the real
// `StockfishAdapter` from Node without reimplementing UCI itself.
import { StockfishAdapter } from '../../src/engine/StockfishAdapter';
import type { EngineMove, EngineSessionConfig, SearchLimits } from '../../src/engine/engineTypes';

const adapter = new StockfishAdapter();

interface EngineHarness {
  start(config?: EngineSessionConfig): Promise<void>;
  findBestMove(fen: string, limits: SearchLimits): Promise<EngineMove>;
  stop(): Promise<void>;
  dispose(): void;
  getState(): string;
}

declare global {
  interface Window {
    __pocketChessEngineHarness: EngineHarness;
  }
}

window.__pocketChessEngineHarness = {
  start: (config) => adapter.start(config),
  findBestMove: (fen, limits) => adapter.findBestMove(fen, limits),
  stop: () => adapter.stop(),
  dispose: () => adapter.dispose(),
  getState: () => adapter.state,
};
