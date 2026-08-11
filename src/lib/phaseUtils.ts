import { SelectionPhase } from '../types';

// 選考フローの並び順。REJECTED_DECLINED(辞退/不採用)はこの並びから外れた終端状態のため含まない。
export const PHASE_SEQUENCE: SelectionPhase[] = [
  'DOCUMENT_SCREENING',
  'CASUAL_INTERVIEW',
  'FIRST_INTERVIEW',
  'SECOND_INTERVIEW',
  'FINAL_INTERVIEW',
  'OFFER_ISSUED',
  'OFFER_ACCEPTED'
];

// 指定フェーズの次のフェーズを返す。最終フェーズ(内定承諾)、または辞退/不採用の場合はnull。
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
