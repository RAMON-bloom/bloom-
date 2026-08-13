import { Candidate } from '../types';
import { PHASE_SEQUENCE } from './phaseUtils';

// 適性検査の進行状況。Google Formの回答結果を自動検知する手段がないため、SENT/COMPLETEDは
// いずれも担当者の手動操作（送信ボタン／ステータスバッジのクリック切り替え）で立つフラグ。
export type AptitudeTestStatus = 'NOT_SENT' | 'SENT' | 'COMPLETED';

export function getAptitudeTestStatus(candidate: Candidate): AptitudeTestStatus {
  if (candidate.aptitudeTestCompletedAt) return 'COMPLETED';
  if (candidate.aptitudeTestSentAt) return 'SENT';
  return 'NOT_SENT';
}

const STATUS_CYCLE: AptitudeTestStatus[] = ['NOT_SENT', 'SENT', 'COMPLETED'];

export function nextAptitudeTestStatus(status: AptitudeTestStatus): AptitudeTestStatus {
  return STATUS_CYCLE[(STATUS_CYCLE.indexOf(status) + 1) % STATUS_CYCLE.length];
}

// バッジのクリック切り替え用。COMPLETEDは「送付済みでもある」ことを含意するため、SENTを経由せず
// 直接COMPLETEDにした場合もaptitudeTestSentAtを補完する。NOT_SENTに戻す場合は両方クリアする。
export function applyAptitudeTestStatus(candidate: Candidate, status: AptitudeTestStatus): Candidate {
  if (status === 'NOT_SENT') {
    return { ...candidate, aptitudeTestSentAt: undefined, aptitudeTestCompletedAt: undefined };
  }
  const now = new Date().toISOString();
  if (status === 'SENT') {
    return { ...candidate, aptitudeTestSentAt: candidate.aptitudeTestSentAt || now, aptitudeTestCompletedAt: undefined };
  }
  return {
    ...candidate,
    aptitudeTestSentAt: candidate.aptitudeTestSentAt || now,
    aptitudeTestCompletedAt: candidate.aptitudeTestCompletedAt || now
  };
}

export const APTITUDE_TEST_STATUS_META: Record<AptitudeTestStatus, { label: string; badgeClass: string }> = {
  NOT_SENT: { label: '未送付', badgeClass: 'bg-slate-100 text-slate-500 border-slate-200' },
  SENT: { label: '送付済み', badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  COMPLETED: { label: '実施済み', badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
};

// 一覧・カード表示用の短い日付表記 (M/D)。datetime-local形式("YYYY-MM-DDTHH:mm")前提。
export function formatAptitudeTestDeadlineShort(deadline: string): string {
  const d = new Date(deadline);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function isAptitudeTestOverdue(candidate: Candidate): boolean {
  if (!candidate.aptitudeTestDeadline || candidate.aptitudeTestCompletedAt) return false;
  return new Date(candidate.aptitudeTestDeadline) < new Date();
}

// 適性検査は「1次面接合格〜2次面接実施の間」に行う運用のため、それより前のフェーズの候補者
// カード類には出さない（該当者だけが多数の候補者一覧の中で埋もれないようにするため）。
// ただし既に何かデータが入っている候補者は、フェーズが変わっても表示し続ける（入力済み情報を
// 不意に隠さないための安全策）。REJECTED_DECLINED（辞退/不採用）はPHASE_SEQUENCEの並びに
// 含まれずどこで離脱したか一意に決まらないため、安全側に倒して表示する。
const APTITUDE_TEST_VISIBLE_FROM_INDEX = PHASE_SEQUENCE.indexOf('SECOND_INTERVIEW');

export function isAptitudeTestRelevantPhase(candidate: Candidate): boolean {
  if (
    candidate.aptitudeTestDeadline ||
    candidate.aptitudeTestSentAt ||
    candidate.aptitudeTestCompletedAt ||
    candidate.aptitudeTestVerbalScore !== undefined ||
    candidate.aptitudeTestNonVerbalScore !== undefined
  ) {
    return true;
  }
  if (candidate.phase === 'REJECTED_DECLINED') return true;
  return PHASE_SEQUENCE.indexOf(candidate.phase) >= APTITUDE_TEST_VISIBLE_FROM_INDEX;
}
