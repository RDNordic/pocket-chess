import type { LedgerRecord } from './storageTypes';
import { isCompleted } from './validateRecords';

export interface LegacySummary {
  games: number; wins: number; draws: number; losses: number; scorePercent: number | null;
  difficulty: Record<string, number>; help: { preview: number; hinted: number; takeback: number };
}
function summarize(records: LedgerRecord[]): LegacySummary {
  const summary: LegacySummary = { games: records.length, wins: 0, draws: 0, losses: 0, scorePercent: null,
    difficulty: {}, help: { preview: 0, hinted: 0, takeback: 0 } };
  for (const record of records) {
    if (record.outcome.status === 'draw') summary.draws++;
    else if ('winner' in record.outcome && record.outcome.winner === record.playerColour) summary.wins++;
    else summary.losses++;
    summary.difficulty[record.difficulty] = (summary.difficulty[record.difficulty] ?? 0) + 1;
    if (record.help.preview) summary.help.preview++;
    if (record.help.hints > 0) summary.help.hinted++;
    if (record.help.takebacks > 0) summary.help.takeback++;
  }
  if (summary.games) summary.scorePercent = 100 * (summary.wins + .5 * summary.draws) / summary.games;
  return summary;
}
/** Consume validated ledger records only. Reopened results leave no holes in
 * blocks; their stable first-completion order is restored on re-completion. */
export function deriveLegacy(ledger: readonly LedgerRecord[]) {
  const completed = ledger.filter(r => isCompleted(r.outcome)).sort((a, b) => a.order! - b.order!);
  const blocks = [];
  for (let offset = 0; offset < completed.length; offset += 100) {
    blocks.push({ first: offset + 1, last: offset + 100, ...summarize(completed.slice(offset, offset + 100)) });
  }
  return { lifetime: summarize(completed), blocks };
}
