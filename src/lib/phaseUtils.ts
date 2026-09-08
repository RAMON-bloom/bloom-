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

// ポジションや候補者によっては省略されうる面接ラウンド（例: 2次面接を飛ばして最終面接に進む）。
// 書類選考(開始点)とオファー関連フェーズ(内定通知・承諾、終端)は対象外。
export const SKIPPABLE_PHASES: SelectionPhase[] = [
  'CASUAL_INTERVIEW',
  'FIRST_INTERVIEW',
  'SECOND_INTERVIEW',
  'FINAL_INTERVIEW'
];

// 指定フェーズの次のフェーズを返す。最終フェーズ(内定承諾)、または見送り/選考辞退の場合はnull。
// 書類選考のみ例外: 通過後、カジュアル面談を挟むか1次面接に直接進むかを評価保存時に選べる
// (docScreeningNextPhaseで指定。未指定時は従来通り1次面接に直接進む)。カジュアル面談を選んだ
// 場合、それ以降(カジュアル面談→1次面接→…)は通常のPHASE_SEQUENCE通りに進む。
// skippedPhasesに含まれるフェーズ(candidate.skippedPhases、例: 2次面接省略)は、そこがdocScreening
// の分岐先や本来の次フェーズであっても読み飛ばしてさらに次へ進める。
export function getNextPhase(
  phase: SelectionPhase,
  docScreeningNextPhase?: SelectionPhase,
  skippedPhases?: SelectionPhase[]
): SelectionPhase | null {
  const isSkipped = (p: SelectionPhase) => !!skippedPhases?.includes(p);

  let index: number;
  if (phase === 'DOCUMENT_SCREENING') {
    const branch = docScreeningNextPhase || 'FIRST_INTERVIEW';
    index = PHASE_SEQUENCE.indexOf(branch) - 1;
  } else {
    index = PHASE_SEQUENCE.indexOf(phase);
    if (index === -1) return null;
  }

  index += 1;
  while (index < PHASE_SEQUENCE.length && isSkipped(PHASE_SEQUENCE[index])) {
    index += 1;
  }
  return index < PHASE_SEQUENCE.length ? PHASE_SEQUENCE[index] : null;
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
