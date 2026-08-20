import { Candidate, SelectionPhase } from '../types';

// 選考フローの並び順。REJECTED/DECLINED(見送り/選考辞退)はこの並びから外れた終端状態のため含まない。
export const PHASE_SEQUENCE: SelectionPhase[] = [
  'DOCUMENT_SCREENING',
  'CASUAL_INTERVIEW',
  'FIRST_INTERVIEW',
  'SECOND_INTERVIEW',
  'FINAL_INTERVIEW',
  'OFFER_ISSUED',
  'OFFER_ACCEPTED'
];

// 指定フェーズの次のフェーズを返す。最終フェーズ(内定承諾)、または見送り/選考辞退の場合はnull。
// 書類選考のみ例外: 通過後、カジュアル面談を挟むか1次面接に直接進むかを評価保存時に選べる
// (docScreeningNextPhaseで指定。未指定時は従来通り1次面接に直接進む)。カジュアル面談を選んだ
// 場合、それ以降(カジュアル面談→1次面接→…)は通常のPHASE_SEQUENCE通りに進む。
export function getNextPhase(
  phase: SelectionPhase,
  docScreeningNextPhase?: SelectionPhase
): SelectionPhase | null {
  if (phase === 'DOCUMENT_SCREENING') return docScreeningNextPhase || 'FIRST_INTERVIEW';
  const index = PHASE_SEQUENCE.indexOf(phase);
  if (index === -1 || index === PHASE_SEQUENCE.length - 1) return null;
  return PHASE_SEQUENCE[index + 1];
}

// 旧統合ステータス'REJECTED_DECLINED'(辞退/不採用、2026-08-20の見送り/選考辞退分割以前のデータ)を
// 会社都合/候補者都合を判別できないため一律「見送り」に移行する。localStorage・Driveバックアップ
// いずれか由来のCandidate[]が状態に入る箇所(ATSContext.tsxの初期読み込みとapplyDriveSnapshot)で
// 必ず適用すること。
export function migrateLegacyPhase(candidate: Candidate): Candidate {
  if ((candidate.phase as string) === 'REJECTED_DECLINED') {
    return { ...candidate, phase: 'REJECTED' };
  }
  return candidate;
}
