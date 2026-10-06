import { ChessGame } from '../chess/ChessGame';
import type { AppliedMove, GameStateSnapshot } from '../chess/chessTypes';
import type { PuzzleDecisionContent, PuzzleObjective, PuzzleRecord } from './puzzleTypes';

export class PuzzleContentError extends Error {
  constructor(message: string) { super(message); this.name = 'PuzzleContentError'; }
}

export interface PuzzleChoice {
  complete: boolean;
  /** Every legal defence, never just the display line. */
  replies: Map<string, PreparedDecision>;
}
export interface PreparedDecision {
  fen: string;
  choices: Map<string, PuzzleChoice>;
  failures: Map<string, { reply: string | null }>;
  content: PuzzleDecisionContent | null;
}
export interface PreparedPuzzle {
  record: PuzzleRecord;
  root: PreparedDecision;
}

function requireContent(condition: unknown, message: string): asserts condition {
  if (!condition) throw new PuzzleContentError(message);
}
function object(value: unknown): Record<string, unknown> {
  requireContent(value !== null && typeof value === 'object' && !Array.isArray(value), 'Expected content object');
  return value as Record<string, unknown>;
}
function text(value: unknown): asserts value is string {
  requireContent(typeof value === 'string' && value.trim().length > 0 && value.length <= 2000, 'Invalid content text');
}
function uci(value: unknown): asserts value is string {
  requireContent(typeof value === 'string' && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(value), 'Invalid content move');
}
/** Inspect the supplied board before chess.js can normalise FEN or simulate
 * en passant. This checks metadata structure, not historical reachability;
 * ChessGame remains responsible for move legality and position evaluation. */
function positionMetadata(fen: string): void {
  const [placement, turn, castling = '-', ep = '-'] = fen.split(/\s+/);
  const ranks = placement.split('/');
  requireContent(ranks.length === 8, 'Invalid FEN');
  const board = new Map<string, string>();
  ranks.forEach((rank, index) => {
    let file = 0;
    for (const symbol of rank) {
      if (/^[1-8]$/.test(symbol)) file += Number(symbol);
      else {
        requireContent(/^[prnbqkPRNBQK]$/.test(symbol) && file < 8, 'Invalid FEN');
        board.set(String.fromCharCode(97 + file++) + (8 - index), symbol);
      }
    }
    requireContent(file === 8, 'Invalid FEN');
  });
  for (const [right, king, kingSquare, rook, rookSquare] of [
    ['K', 'K', 'e1', 'R', 'h1'], ['Q', 'K', 'e1', 'R', 'a1'],
    ['k', 'k', 'e8', 'r', 'h8'], ['q', 'k', 'e8', 'r', 'a8'],
  ]) {
    if (castling.includes(right)) requireContent(board.get(kingSquare) === king &&
      board.get(rookSquare) === rook, 'Inconsistent castling metadata');
  }
  if (ep !== '-') {
    requireContent((turn === 'w' && /^[a-h]6$/.test(ep)) ||
      (turn === 'b' && /^[a-h]3$/.test(ep)), 'Inconsistent en-passant metadata');
    const file = ep[0];
    requireContent(!board.has(ep) &&
      board.get(file + (turn === 'w' ? '5' : '4')) === (turn === 'w' ? 'p' : 'P') &&
      !board.has(file + (turn === 'w' ? '7' : '2')), 'Inconsistent en-passant metadata');
    // A double pawn move may record a target even without a legal capturer.
  }
}
function position(fen: unknown): ChessGame {
  text(fen);
  positionMetadata(fen);
  let game: ChessGame;
  try { game = new ChessGame(fen); } catch { throw new PuzzleContentError('Invalid FEN'); }
  // chess.js checks FEN syntax, not every impossible position. At least reject
  // adjacent kings, back-rank pawns and a checked non-moving king.
  const pieces = game.getSnapshot().pieces;
  const kings = pieces.filter(p => p.type === 'k');
  requireContent(kings.length === 2, 'Position needs two kings');
  const [a, b] = kings;
  requireContent(Math.abs(a.square.charCodeAt(0) - b.square.charCodeAt(0)) > 1 ||
    Math.abs(Number(a.square[1]) - Number(b.square[1])) > 1, 'Adjacent kings');
  requireContent(!pieces.some(p => p.type === 'p' && /[18]$/.test(p.square)), 'Back-rank pawn');
  const fields = game.fen.split(' ');
  fields[1] = fields[1] === 'w' ? 'b' : 'w';
  fields[3] = '-';
  requireContent(!new ChessGame(fields.join(' ')).getSnapshot().isCheck, 'Non-moving king in check');
  return game;
}

/** Checks a capture against the exact target, including en passant removal. */
export function capturedGoal(objective: PuzzleObjective, before: GameStateSnapshot,
  after: GameStateSnapshot, move: AppliedMove): boolean {
  if (objective.kind !== 'capture' || move.captured !== objective.piece) return false;
  return before.pieces.some(p => p.square === objective.target && p.type === objective.piece && p.colour !== before.turn) &&
    !after.pieces.some(p => p.square === objective.target && p.colour !== before.turn);
}

/** Bounded preparation only. Runtime play consumes the resulting proof tree. */
export function validatePuzzle(input: unknown): PreparedPuzzle {
  // Copy at the boundary so edits to caller-owned records cannot alter a session.
  let raw: Record<string, unknown>;
  try { raw = object(JSON.parse(JSON.stringify(input))); } catch (error) {
    if (error instanceof PuzzleContentError) throw error;
    throw new PuzzleContentError('Content must be serialisable');
  }
  requireContent(raw.schemaVersion === 1, 'Unsupported puzzle schema');
  text(raw.id); text(raw.contentVersion); text(raw.completionText);
  requireContent(raw.player === 'white' || raw.player === 'black', 'Invalid player colour');
  const start = position(raw.startFen);
  requireContent(start.turn === raw.player && !start.isGameOver, 'Invalid starting turn or terminal position');
  const goal = object(raw.objective);
  requireContent(goal.kind === 'mate' || goal.kind === 'capture', 'Unsupported objective');
  if (goal.kind === 'mate') requireContent(goal.moves === 1 || goal.moves === 2, 'Unsupported mate depth');
  else {
    requireContent(typeof goal.target === 'string' && /^[a-h][1-8]$/.test(goal.target), 'Invalid capture target');
    requireContent(['p', 'n', 'b', 'r', 'q'].includes(goal.piece as string), 'Invalid capture piece');
    requireContent(start.getSnapshot().pieces.some(p => p.square === goal.target && p.type === goal.piece && p.colour !== start.turn), 'Capture target missing');
  }
  if (raw.source !== undefined) {
    const source = object(raw.source); const sourceGame = position(source.fen); uci(source.setupMove);
    requireContent(sourceGame.turn !== raw.player && sourceGame.applyUciMove(source.setupMove), 'Invalid opponent setup');
    requireContent(sourceGame.fen === start.fen, 'Setup does not produce starting position');
  }
  requireContent(Array.isArray(raw.displayLine) && raw.displayLine.length > 0 && raw.displayLine.length <= 3, 'Invalid display line');
  raw.displayLine.forEach(uci);
  requireContent(Array.isArray(raw.decisions) && raw.decisions.length > 0 && raw.decisions.length <= 512, 'Invalid decision content');
  const authored = new Map<string, PuzzleDecisionContent>();
  for (const value of raw.decisions) {
    const item = object(value); text(item.fen);
    requireContent(!authored.has(item.fen), 'Duplicate decision content');
    requireContent(Array.isArray(item.hints) && item.hints.length === 3, 'Need three hints');
    const [concept, piece, destination] = item.hints.map(object);
    requireContent(concept.kind === 'concept' && piece.kind === 'piece' && destination.kind === 'destination', 'Invalid hint order');
    text(concept.text); text(piece.text); text(destination.text); uci(destination.move);
    requireContent(piece.square === destination.move.slice(0, 2), 'Piece/destination hints disagree');
    authored.set(item.fen, item as unknown as PuzzleDecisionContent);
  }
  const record = raw as unknown as PuzzleRecord;
  let visited = 0;
  const memo = new Map<string, PreparedDecision>();
  const step = (fen: string, move: AppliedMove): ChessGame => {
    requireContent(++visited <= 50000, 'Puzzle preparation budget exceeded');
    const game = new ChessGame(fen);
    requireContent(game.applyUciMove(move.uci), 'Proof move is illegal');
    return game;
  };
  const solve = (game: ChessGame, remaining: number): PreparedDecision => {
    const key = game.fen + '/' + remaining;
    const cached = memo.get(key); if (cached) return cached;
    const decision: PreparedDecision = { fen: game.fen, choices: new Map(), failures: new Map(), content: null };
    memo.set(key, decision);
    const before = record.objective.kind === 'capture' ? game.getSnapshot() : null;
    for (const move of game.legalMoves()) {
      requireContent(++visited <= 50000, 'Puzzle preparation budget exceeded');
      // ChessGame's verbose descriptors already include authoritative mate SAN.
      // At the final mate decision there is no need to reconstruct a position
      // for every non-mating leaf. The defence enumeration is still exhaustive.
      const next = record.objective.kind === 'capture' ? step(game.fen, move) : null;
      const complete = record.objective.kind === 'mate'
        ? move.isCheckmate
        : capturedGoal(record.objective, before!, next!.getSnapshot(), move);
      if (complete) { decision.choices.set(move.uci, { complete: true, replies: new Map() }); continue; }
      const replies = new Map<string, PreparedDecision>();
      let failed = record.objective.kind !== 'mate' || remaining <= 1;
      let refutation: string | null = null;
      if (!failed) {
        const attempted = step(game.fen, move);
        failed = attempted.isGameOver;
        for (const defence of failed ? [] : attempted.legalMoves()) {
          const defended = step(attempted.fen, defence);
          const continuation = solve(defended, remaining - 1);
          if (defended.isGameOver || continuation.choices.size === 0) {
            failed = true; refutation = defence.uci; break;
          }
          replies.set(defence.uci, continuation);
        }
      }
      if (failed) decision.failures.set(move.uci, { reply: refutation });
      else decision.choices.set(move.uci, { complete: false, replies });
    }
    return decision;
  };
  const root = solve(start, record.objective.kind === 'mate' ? record.objective.moves : 1);
  requireContent(root.choices.size > 0, 'Objective has no solution');
  // Losing hypothetical branches need no hints; EVERY reachable winning branch does.
  const reachable = new Set<string>();
  const decorate = (decision: PreparedDecision): void => {
    if (reachable.has(decision.fen)) return;
    reachable.add(decision.fen);
    const content = authored.get(decision.fen);
    requireContent(content, 'Missing hints for reachable decision');
    requireContent(decision.choices.has(content.hints[2].move), 'Hint does not name a winning move');
    decision.content = content;
    for (const option of decision.choices.values()) for (const reply of option.replies.values()) decorate(reply);
  };
  decorate(root);
  requireContent(reachable.size === authored.size, 'Unreachable decision content');
  let decision = root;
  let complete = false;
  for (let i = 0; i < record.displayLine.length;) {
    const choice = decision.choices.get(record.displayLine[i++]);
    requireContent(choice, 'Display line is not a solution');
    if (choice.complete) { complete = true; requireContent(i === record.displayLine.length, 'Moves after completion'); break; }
    const reply = choice.replies.get(record.displayLine[i++]);
    requireContent(reply, 'Display reply missing'); decision = reply;
  }
  requireContent(complete, 'Incomplete display line');
  return { record, root };
}
