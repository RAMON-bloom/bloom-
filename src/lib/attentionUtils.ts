import { Candidate, SelectionPhase, StalledCandidateInfo, OverdueDocScreeningInfo } from '../types';

// 書類選考は初動対応が早く求められるため、他フェーズより短いしきい値にしている。
export const STALLED_DOC_SCREENING_DAYS = 3;
export const STALLED_OTHER_PHASE_DAYS = 7;

// 内定承諾・見送り・選考辞退は選考が終わった状態なので、進捗停滞の検知対象から外す。
const TERMINAL_PHASES: SelectionPhase[] = ['OFFER_ACCEPTED', 'REJECTED', 'DECLINED'];

export function daysSince(dateStr: string, today: Date = new Date()): number {
  const then = new Date(dateStr + 'T00:00:00');
  const now = new Date(today.toISOString().split('T')[0] + 'T00:00:00');
  return Math.floor((now.getTime() - then.getTime()) / 86400000);
}

export function getStalledCandidates(candidates: Candidate[], today: Date = new Date()): StalledCandidateInfo[] {
  return candidates
    .filter((c) => !c.isArchived && !TERMINAL_PHASES.includes(c.phase))
    .map((c) => ({ candidate: c, daysSinceUpdate: daysSince(c.lastUpdated, today) }))
    .filter(({ candidate, daysSinceUpdate }) =>
      daysSinceUpdate >= (candidate.phase === 'DOCUMENT_SCREENING' ? STALLED_DOC_SCREENING_DAYS : STALLED_OTHER_PHASE_DAYS)
    )
    .sort((a, b) => b.daysSinceUpdate - a.daysSinceUpdate);
}

export function getOverdueDocScreening(candidates: Candidate[], today: Date = new Date()): OverdueDocScreeningInfo[] {
  return candidates
    .filter((c) => !c.isArchived && c.phase === 'DOCUMENT_SCREENING')
    .map((c) => ({
      candidate: c,
      assigneeName: c.documentScreeningAssignee || c.assignees[0] || '',
      daysSinceUpdate: daysSince(c.lastUpdated, today)
    }))
    .filter((x) => x.daysSinceUpdate >= STALLED_DOC_SCREENING_DAYS && x.assigneeName)
    .sort((a, b) => b.daysSinceUpdate - a.daysSinceUpdate);
}
