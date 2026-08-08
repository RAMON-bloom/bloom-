// Maps SelectionPhase values (src/types.ts) to the Drive subfolder each phase's resumes live in.
// Duplicated here (rather than imported from src/) because api/ and src/ are separate deploy
// targets in this project; this list is small and stable enough that duplication is cheaper
// than wiring up a cross-boundary shared module.

export const RESUME_ROOT_SUBFOLDER = '履歴書・応募書類';

// Sibling of the phase folders below, but deliberately NOT listed in PHASE_FOLDER_NAMES — that's
// what keeps scan-resumes.ts (which only walks PHASE_FOLDER_NAMES) from ever finding what's moved
// in here and re-importing it as a "new" candidate. See api/drive/move-to-deleted.ts.
export const DELETED_FOLDER_NAME = '99_完全削除済み';

export const PHASE_FOLDER_NAMES: Record<string, string> = {
  DOCUMENT_SCREENING: '01_書類選考',
  CASUAL_INTERVIEW: '02_カジュアル面談',
  FIRST_INTERVIEW: '03_1次面接',
  SECOND_INTERVIEW: '04_2次面接',
  FINAL_INTERVIEW: '05_最終面接',
  OFFER_ISSUED: '06_内定',
  OFFER_ACCEPTED: '07_内定承諾',
  REJECTED_DECLINED: '08_不採用・辞退'
};

export function resolvePhaseFolderName(phase?: string): string {
  return (phase && PHASE_FOLDER_NAMES[phase]) || '00_未分類';
}
