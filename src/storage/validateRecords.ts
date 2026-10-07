import { ChessGame } from '../chess/ChessGame';
import type { GameOutcome } from '../chess/chessTypes';
import { validatePosition } from '../puzzles/validatePuzzle';
import { LocalRecordError, STARTER_ITEMS } from './storageTypes';
import type { StoreName, GameRecord, LedgerRecord, SettingsRecord, WardrobeRecord,
  ProgressRecord, CheckpointRecord, AwardRecord, MetadataRecord, ActivityLifecycleRecord } from './storageTypes';

export interface RecordByStore {
  metadata: MetadataRecord | ActivityLifecycleRecord; settings: SettingsRecord; games: GameRecord; ledger: LedgerRecord;
  progress: ProgressRecord; checkpoints: GameRecord | CheckpointRecord; awards: AwardRecord; wardrobe: WardrobeRecord;
}
function check(value: unknown, message = 'Invalid local record'): asserts value {
  if (!value) throw new LocalRecordError('corrupt', message);
}
function obj(value: unknown): Record<string, unknown> {
  check(value !== null && typeof value === 'object' && !Array.isArray(value));
  return value as Record<string, unknown>;
}
function id(value: unknown): asserts value is string { check(typeof value === 'string' && value.length > 0 && value.length <= 200 && !/[\u0000-\u001f]/.test(value)); }
function integer(value: unknown, max = Number.MAX_SAFE_INTEGER): asserts value is number {
  check(typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= max);
}
function strings(value: unknown, max: number): asserts value is string[] {
  check(Array.isArray(value) && value.length <= max); value.forEach(id);
}
function colour(value: unknown) { check(value === 'white' || value === 'black'); }
function help(value: unknown) {
  const h = obj(value); check(typeof h.preview === 'boolean'); integer(h.hints); integer(h.takebacks);
}
function outcome(value: unknown): GameOutcome {
  const o = obj(value);
  check(['in-progress', 'aborted', 'resigned', 'checkmate', 'draw'].includes(o.status as string));
  if (o.status === 'checkmate' || o.status === 'resigned') colour(o.winner);
  if (o.status === 'draw') check(['stalemate', 'threefold-repetition', 'fifty-move-rule', 'insufficient-material'].includes(o.reason as string));
  return o as unknown as GameOutcome;
}
export function isCompleted(value: GameOutcome): boolean {
  return value.status === 'checkmate' || value.status === 'draw' || value.status === 'resigned';
}
export function reconstructGame(record: Pick<GameRecord, 'startFen' | 'moves'>): ChessGame {
  try {
    const game = validatePosition(record.startFen);
    for (const move of record.moves) {
      check(!game.isGameOver, 'Moves after terminal position');
      check(game.applyUciMove(move), 'Illegal stored move');
    }
    return game;
  } catch (error) {
    if (error instanceof LocalRecordError) throw error;
    throw new LocalRecordError('corrupt', 'Invalid stored chess position/path');
  }
}

/** v1 is the same record layout; settings lacked music (defaults off).
 * No older production database exists. Unknown versions stay untouched. */
export function validateRecord<S extends StoreName>(store: S, input: unknown): RecordByStore[S] {
  let raw: Record<string, unknown>;
  try { raw = obj(structuredClone(input)); }
  catch { throw new LocalRecordError('corrupt', 'Invalid local record'); }
  if (raw.schemaVersion !== 1 && raw.schemaVersion !== 2) throw new LocalRecordError('unsupported', 'Unsupported local record version');
  if (raw.schemaVersion === 1) {
    raw.schemaVersion = 2;
    if (store === 'settings' && raw.music === undefined) raw.music = false;
    if (store === 'metadata' && typeof raw.generation === 'number') {
      integer(raw.generation); raw.generation = 'v1:' + raw.generation;
    }
  }
  if (store === 'metadata' && raw.recordType !== undefined) {
    check(raw.recordType === 'activity-lifecycle');
    check(raw.kind === 'puzzle' || raw.kind === 'scenario');
    id(raw.contentId); id(raw.contentVersion); id(raw.sessionId); integer(raw.revision);
    check(raw.state === 'checkpoint' || raw.state === 'complete');
  } else if (store === 'metadata') { id(raw.generation); integer(raw.nextOrder); check((raw.nextOrder as number) > 0); }
  else if (store === 'settings') {
    integer(raw.revision); check(raw.launchMode === 'adult' || raw.launchMode === 'kids'); id(raw.language);
    check(typeof raw.effects === 'boolean' && typeof raw.music === 'boolean');
  } else if (store === 'wardrobe') {
    integer(raw.revision); id(raw.boardTheme); id(raw.pieceTheme);
    strings(raw.owned, 1000); strings(raw.equipped, 100);
    check(new Set(raw.owned).size === raw.owned.length && new Set(raw.equipped).size === raw.equipped.length);
    check(STARTER_ITEMS.every(item => (raw.owned as string[]).includes(item)) && raw.equipped.every(item => (raw.owned as string[]).includes(item)));
  } else if (store === 'awards') {
    check(raw.kind === 'grant' || raw.kind === 'evidence');
    if (raw.kind === 'grant') {
      id(raw.id); check(['first-game', 'five-puzzles', 'first-scenario'].includes(raw.id));
    } else {
      check(typeof raw.id === 'string');
      const match = /^(puzzle|scenario|game):([\s\S]+)$/.exec(raw.id);
      check(match); id(match[2]); // Source ID stays <=200; namespace is additional.
    }
  } else if (store === 'progress') {
    id(raw.id); id(raw.contentVersion); integer(raw.revision); check(raw.kind === 'puzzle' || raw.kind === 'scenario');
    if (raw.sessionId !== undefined) id(raw.sessionId);
  } else if (store === 'checkpoints' && raw.kind !== undefined) {
    check(raw.kind === 'puzzle' || raw.kind === 'scenario'); id(raw.contentId); id(raw.contentVersion); integer(raw.revision);
    id(raw.sessionId); check(typeof raw.startFen === 'string' && raw.startFen.length <= 200);
    reconstructGame({ startFen: raw.startFen as string, moves: [] });
    strings(raw.acceptedMoves, 1000); check(raw.acceptedMoves.every(m => /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(m)));
    integer(raw.decisionPly, raw.acceptedMoves.length); integer(raw.hintCount, 3);
  } else {
    id(raw.id); integer(raw.revision); colour(raw.playerColour); help(raw.help);
    check(['gentle', 'casual', 'challenging', 'strongest'].includes(raw.difficulty as string));
    const result = outcome(raw.outcome);
    if (store === 'ledger') {
      check(raw.order === null || (Number.isSafeInteger(raw.order) && (raw.order as number) > 0));
      check(!isCompleted(result) || raw.order !== null); id(raw.fingerprint); check(/^[a-f0-9]{64}$/.test(raw.fingerprint));
    } else {
      check(typeof raw.startFen === 'string' && raw.startFen.length <= 200); strings(raw.moves, 2000);
      const game = reconstructGame(raw as unknown as GameRecord);
      const derived = game.getSnapshot().outcome;
      if (result.status === 'resigned' || result.status === 'aborted') check(derived.status === 'in-progress');
      else check(JSON.stringify(result) === JSON.stringify(derived), 'Stored outcome disagrees with ChessGame');
    }
  }
  // Return an explicitly selected shape, dropping unknown fields such as personal
  // data. Migration writes are explicit; reads do not overwrite the raw record.
  const fields: Record<StoreName, string[]> = {
    metadata: raw.recordType === 'activity-lifecycle' ? ['recordType', 'kind', 'contentId', 'contentVersion', 'sessionId', 'revision', 'state'] :
      ['generation', 'nextOrder'], settings: ['revision', 'launchMode', 'language', 'effects', 'music'],
    wardrobe: ['revision', 'owned', 'equipped', 'boardTheme', 'pieceTheme'], awards: ['kind', 'id'],
    progress: ['kind', 'id', 'contentVersion', 'revision', ...(raw.sessionId !== undefined ? ['sessionId'] : [])],
    games: ['id', 'revision', 'startFen', 'moves', 'playerColour', 'difficulty', 'help', 'outcome'],
    ledger: ['id', 'revision', 'order', 'playerColour', 'difficulty', 'help', 'outcome', 'fingerprint'],
    checkpoints: raw.kind !== undefined ? ['kind', 'contentId', 'contentVersion', 'sessionId', 'startFen', 'revision', 'acceptedMoves', 'decisionPly', 'hintCount'] :
      ['id', 'revision', 'startFen', 'moves', 'playerColour', 'difficulty', 'help', 'outcome'],
  };
  const selected = Object.fromEntries(['schemaVersion', ...fields[store]].map(key => [key, raw[key]]));
  // Sanitise nested metadata as well.
  if ('help' in selected) {
    const h = obj(selected.help); selected.help = { preview: h.preview, hints: h.hints, takebacks: h.takebacks };
    const o = outcome(selected.outcome);
    selected.outcome = o.status === 'checkmate' || o.status === 'resigned' ? { status: o.status, winner: o.winner } :
      o.status === 'draw' ? { status: o.status, reason: o.reason } : { status: o.status };
  }
  return selected as unknown as RecordByStore[S];
}

export function validateKey(store: StoreName, key: string, record: RecordByStore[StoreName]): void {
  const r = record as unknown as Record<string, unknown>;
  if (store === 'metadata' && r.recordType === 'activity-lifecycle') {
    check(key === `activity-slot:${r.kind}` ||
      (r.state === 'complete' && key === `activity-complete:${r.kind}:${r.sessionId}`), 'Lifecycle key disagrees with identity');
    return;
  }
  const expected = store === 'metadata' || store === 'settings' || store === 'wardrobe' ? 'local' :
    store === 'progress' ? `${r.kind}:${r.id}` : store === 'checkpoints' ? r.kind ?? 'bot' : r.id;
  check(key === expected, 'Record key disagrees with identity');
  if (store === 'checkpoints' && key === 'bot') check((r.outcome as GameOutcome).status === 'in-progress');
  if (store === 'games') check(isCompleted(r.outcome as GameOutcome));
}
