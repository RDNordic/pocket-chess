import { IndexedDbBackend } from '../../src/storage/IndexedDbBackend';
import { LocalRepositories } from '../../src/storage/LocalRepositories';
import { ChessGame } from '../../src/chess/ChessGame';
import { DEFAULT_SETTINGS } from '../../src/storage/storageTypes';
import type { GameRecord } from '../../src/storage/storageTypes';
import { deriveLegacy } from '../../src/storage/legacy';
import { reconstructGame } from '../../src/storage/validateRecords';
import { PuzzleSession } from '../../src/puzzles/PuzzleSession';
import { validatePuzzle } from '../../src/puzzles/validatePuzzle';
import { captureCheckpoint, recoverCheckpoint } from '../../src/storage/checkpointRecovery';
import type { PuzzleRecord } from '../../src/puzzles/puzzleTypes';

const backend = new IndexedDbBackend('pocket-chess-m2-test');
const repo = new LocalRepositories(backend);
const game = (id = 'game'): GameRecord => ({ schemaVersion: 2, id, revision: 0,
  startFen: new ChessGame().fen, moves: ['e2e4'], playerColour: 'white', difficulty: 'gentle',
  help: { preview: true, hints: 0, takebacks: 0 }, outcome: { status: 'resigned', winner: 'black' } });
const fen = '6k1/4Q3/5K2/8/8/8/8/8 w - - 2 2';
const syntheticPuzzle: PuzzleRecord = { schemaVersion: 1, id: 'native-puzzle', contentVersion: 'test-v1',
  startFen: fen, player: 'white', objective: { kind: 'mate', moves: 1 }, displayLine: ['e7g7'],
  decisions: [{ fen, hints: [{ kind: 'concept', text: 'Give mate.' },
    { kind: 'piece', text: 'Use the queen.', square: 'e7' },
    { kind: 'destination', text: 'Play Qg7.', move: 'e7g7' }] }], completionText: 'Checkmate.' };
const harness = { backend, repo, IndexedDbBackend, LocalRepositories, DEFAULT_SETTINGS, game, deriveLegacy, reconstructGame,
  PuzzleSession, validatePuzzle, captureCheckpoint, recoverCheckpoint, syntheticPuzzle };
export type StorageHarness = typeof harness;
declare global { interface Window { storageHarness: StorageHarness } }
window.storageHarness = harness;
