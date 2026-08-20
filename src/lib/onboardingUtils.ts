import { Candidate } from '../types';

// 入社予定者（入社予定日が設定済み、または内定通知・内定承諾フェーズ）とみなす候補者かどうか。
// 一度この条件を満たしていても、その後「見送り」「選考辞退」になった場合は入社予定者一覧・件数から除外する。
// joiningDate等の入社準備系フィールドは辞退後もデータとしては残す（削除はしない）ため、
// phaseだけを見て判定している — c.joiningDateが残っていても辞退なら除外される。
export function isJoiningScheduled(candidate: Candidate): boolean {
  if (candidate.phase === 'REJECTED' || candidate.phase === 'DECLINED') return false;
  return !!(candidate.joiningDate || candidate.phase === 'OFFER_ACCEPTED' || candidate.phase === 'OFFER_ISSUED');
}
