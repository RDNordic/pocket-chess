import type { GameOutcome, PlayerColour } from '../chess/chessTypes';
import type { EngineDifficulty } from '../engine/engineTypes';

export const STORES = ['metadata', 'settings', 'games', 'ledger', 'progress', 'awards', 'wardrobe', 'checkpoints'] as const;
export type StoreName = typeof STORES[number];
export type Tables = Record<StoreName, Map<string, unknown>>;
/** Callback is synchronous: all reads and writes share ONE storage transaction. */
export interface LocalBackend {
  transact<T>(write: boolean, action: (tables: Tables) => T): Promise<T>;
  close(): void;
}
export type FailureCode = 'unavailable' | 'blocked' | 'write-failed' | 'corrupt' | 'unsupported' |
  'stale' | 'conflict' | 'invalid' | 'content-changed';
export class LocalRecordError extends Error {
  constructor(public readonly code: FailureCode, message: string) { super(message); }
}
export type StorageResult<T> = { ok: true; value: T } | { ok: false; code: FailureCode; message: string };
export interface RecordIssue { store: StoreName; key: string; code: 'corrupt' | 'unsupported' }
export interface SettingsRecord {
  schemaVersion: 2; revision: number; launchMode: 'adult' | 'kids'; language: string;
  effects: boolean; music: boolean;
}
export interface WardrobeRecord {
  schemaVersion: 2; revision: number; owned: string[]; equipped: string[];
  boardTheme: string; pieceTheme: string;
}
export interface HelpMetadata { preview: boolean; hints: number; takebacks: number }
export interface GameRecord {
  schemaVersion: 2; id: string; revision: number; startFen: string; moves: string[];
  playerColour: PlayerColour; difficulty: EngineDifficulty; help: HelpMetadata; outcome: GameOutcome;
}
/** An inactive entry retains revision and first-completion order after takeback.
 * Abandonment has no order and never fills a Legacy block. No replay in ledger. */
export interface LedgerRecord {
  schemaVersion: 2; id: string; revision: number; order: number | null;
  playerColour: PlayerColour; difficulty: EngineDifficulty; help: HelpMetadata;
  outcome: GameOutcome; fingerprint: string;
}
export interface ProgressRecord {
  schemaVersion: 2; kind: 'puzzle' | 'scenario'; id: string;
  contentVersion: string; revision: number;
  /** Required on new completion intents; absent only on legacy stored progress. */
  sessionId?: string;
}
export type ActivityCompletion = ProgressRecord & { sessionId: string };
/** Slot high-water mark and closed-session receipts survive checkpoint deletion. */
export interface ActivityLifecycleRecord {
  schemaVersion: 2; recordType: 'activity-lifecycle'; kind: 'puzzle' | 'scenario';
  contentId: string; contentVersion: string; sessionId: string; revision: number;
  state: 'checkpoint' | 'complete';
}
export interface CheckpointRecord {
  schemaVersion: 2; kind: 'puzzle' | 'scenario'; contentId: string; contentVersion: string;
  sessionId: string; startFen: string;
  revision: number; acceptedMoves: string[]; decisionPly: number; hintCount: number;
}
export interface AwardRecord {
  schemaVersion: 2; kind: 'grant' | 'evidence'; id: string;
}
export interface MetadataRecord { schemaVersion: 2; generation: string; nextOrder: number }
export interface SaveToken { readonly generation: string; readonly localGeneration: number }
export type ResetAction = 'appearance' | 'learning' | 'games' | 'fresh';
export const STARTER_ITEMS = ['starter:1', 'starter:2', 'starter:3', 'starter:4', 'starter:5', 'starter:6'];
export const DEFAULT_SETTINGS: SettingsRecord = {
  schemaVersion: 2, revision: 0, launchMode: 'adult', language: 'en', effects: true, music: false,
};
export const DEFAULT_WARDROBE: WardrobeRecord = {
  schemaVersion: 2, revision: 0, owned: STARTER_ITEMS, equipped: [], boardTheme: 'classic', pieceTheme: 'cburnett',
};
export const DEFAULT_METADATA: MetadataRecord = { schemaVersion: 2, generation: 'initial', nextOrder: 1 };
