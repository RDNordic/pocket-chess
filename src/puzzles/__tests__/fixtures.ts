import { Chess } from 'chess.js';
import type { Move } from 'chess.js';
import type { PuzzleObjective, PuzzleRecord, PuzzleDecisionContent } from '../puzzleTypes';

/** Synthetic test-only oracle. Uses chess.js directly, independently of the
 * production preparer and ChessGame facade. No fixture is imported by the app. */
export interface OracleOption { complete: boolean; replies: Map<string, OracleDecision> }
export interface OracleDecision { fen: string; options: Map<string, OracleOption> }

export function oracle(fen: string, objective: PuzzleObjective, remaining: number = objective.kind === 'mate' ? objective.moves : 1): OracleDecision {
  const chess = new Chess(fen);
  const options = new Map<string, OracleOption>();
  if (chess.isGameOver()) return { fen: chess.fen(), options };
  for (const move of chess.moves({ verbose: true })) {
    chess.move(move);
    const complete = objective.kind === 'mate' ? chess.isCheckmate() :
      move.captured === objective.piece && move.to === objective.target;
    if (complete) options.set(move.lan, { complete: true, replies: new Map() });
    else if (objective.kind === 'mate' && remaining > 1 && !chess.isGameOver()) {
      const replies = new Map<string, OracleDecision>();
      let all = true;
      for (const reply of chess.moves({ verbose: true })) {
        chess.move(reply);
        const child = oracle(chess.fen(), objective, remaining - 1);
        chess.undo();
        // Evaluate EVERY reply, even when an earlier defence already refutes it.
        if (!child.options.size) all = false;
        replies.set(reply.lan, child);
      }
      if (all && replies.size) options.set(move.lan, { complete: false, replies });
    }
    chess.undo();
  }
  return { fen: chess.fen(), options };
}

function fixture(id: string, startFen: string, objective: PuzzleObjective, first?: string): PuzzleRecord {
  const tree = oracle(startFen, objective);
  const content = new Map<string, PuzzleDecisionContent>();
  const fill = (node: OracleDecision): void => {
    if (content.has(node.fen)) return;
    const move = node.options.has(first ?? '') ? first! : node.options.keys().next().value!;
    const chess = new Chess(node.fen);
    const piece = chess.get(move.slice(0, 2) as Move['from']);
    if (!piece) throw new Error('Synthetic hint source missing');
    content.set(node.fen, {
      fen: node.fen,
      hints: [
        { kind: 'concept', text: objective.kind === 'mate' ? 'Look for a move that limits the king or gives mate.' : 'Find a legal capture of the target.' },
        { kind: 'piece', text: `Consider the ${piece.type} on ${move.slice(0, 2)}.`, square: move.slice(0, 2) as Move['from'] },
        { kind: 'destination', text: `Try ${move}${move.length === 5 ? ' with the named promotion' : ''}.`, move },
      ],
    });
    for (const option of node.options.values()) for (const child of option.replies.values()) fill(child);
  };
  fill(tree);
  const displayLine: string[] = [];
  let node = tree;
  while (true) {
    const move = node.options.has(first ?? '') ? first! : node.options.keys().next().value!;
    const option = node.options.get(move)!;
    displayLine.push(move);
    if (option.complete) break;
    const reply = option.replies.keys().next().value!;
    displayLine.push(reply);
    node = option.replies.get(reply)!;
  }
  return {
    schemaVersion: 1, id, contentVersion: 'synthetic-v1', startFen: tree.fen,
    player: new Chess(tree.fen).turn() === 'w' ? 'white' : 'black', objective,
    displayLine, decisions: [...content.values()],
    completionText: objective.kind === 'mate' ? 'Checkmate: the king is checked with no legal escape.' : 'You captured the specified target.',
  };
}

export const fixtures = {
  immediateMate: fixture('immediate-mate', '6k1/4Q3/5K2/8/8/8/8/8 w - - 2 2', { kind: 'mate', moves: 1 }, 'e7g7'),
  alternatives: fixture('multiple-first-solutions', '7k/8/5K2/8/4Q3/8/8/8 w - - 0 1', { kind: 'mate', moves: 2 }, 'e4e7'),
  defences: fixture('branching-defences', '7k/p7/5K2/8/4Q3/8/8/8 w - - 0 1', { kind: 'mate', moves: 2 }, 'e4e7'),
  unsuccessful: fixture('verified-unsuccessful-attempt', '7k/8/5K2/8/4Q3/8/8/8 w - - 1 2', { kind: 'mate', moves: 2 }, 'e4e7'),
  capture: fixture('explicit-capture', '8/3r3k/8/8/3Q4/8/8/K7 w - - 0 1', { kind: 'capture', target: 'd7', piece: 'r' }, 'd4d7'),
  promotion: fixture('promotion-capture', 'k6r/6P1/8/8/8/8/8/K7 w - - 0 1', { kind: 'capture', target: 'h8', piece: 'r' }, 'g7h8q'),
};
fixtures.unsuccessful.source = { fen: '8/7k/5K2/8/4Q3/8/8/8 b - - 0 1', setupMove: 'h7h8' };
