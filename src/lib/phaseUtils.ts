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
export function getNextPhase(phase: SelectionPhase): SelectionPhase | null {
  const index = PHASE_SEQUENCE.indexOf(phase);
  if (index === -1 || index === PHASE_SEQUENCE.length - 1) return null;
  return PHASE_SEQUENCE[index + 1];
}
